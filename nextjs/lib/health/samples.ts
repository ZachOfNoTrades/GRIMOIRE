import sql from 'mssql';
import { getHealthConnection } from './db';
import { requireMetric } from './metrics';
import { toCanonical } from './units';
import { HealthLatestValue, HealthSample, HealthSampleInput } from '@/types/health';

// Ceiling on a single write batch so an oversized Health Connect export can't
// hold the pool for minutes. Callers chunk above this.
export const MAX_SAMPLE_BATCH = 500;

function mapSample(row: Record<string, unknown>): HealthSample {
  return {
    id: Number(row.id),
    user_id: row.user_id as string,
    metric_code: row.metric_code as string,
    value: Number(row.value),
    start_at: (row.start_at as Date).toISOString(),
    end_at: row.end_at ? (row.end_at as Date).toISOString() : null,
    source: row.source as string,
    source_ref: (row.source_ref as string) ?? null,
    note: (row.note as string) ?? null,
    created_at: (row.created_at as Date).toISOString(),
    modified_at: (row.modified_at as Date).toISOString(),
  };
}

function asDate(value: string | Date): Date {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid health sample timestamp: '${String(value)}'`);
  return d;
}

// Upsert one measurement. Idempotent on (user, metric, start_at, source) — the
// natural key — so a module mirror or an import can be re-run safely.
export async function recordSample(userId: string, input: HealthSampleInput): Promise<HealthSample> {
  const [saved] = await recordSamples(userId, [input]);
  return saved;
}

// Bulk form of recordSample. Values are normalized to each metric's
// canonical_unit before they hit the table.
export async function recordSamples(userId: string, inputs: HealthSampleInput[]): Promise<HealthSample[]> {
  if (inputs.length === 0) return [];
  if (inputs.length > MAX_SAMPLE_BATCH) {
    throw new Error(`Too many samples in one batch: ${inputs.length} (max ${MAX_SAMPLE_BATCH})`);
  }

  const pool = await getHealthConnection();
  const saved: HealthSample[] = [];

  for (const input of inputs) {
    const metric = await requireMetric(input.metric_code);
    const value = toCanonical(Number(input.value), input.unit, metric.canonical_unit);
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite value for metric '${input.metric_code}'`);
    }

    const result = await pool.request()
      .input('userId', sql.NVarChar(128), userId)
      .input('metricCode', sql.NVarChar(64), metric.code)
      .input('value', sql.Float, value)
      .input('startAt', sql.DateTime2, asDate(input.start_at))
      .input('endAt', sql.DateTime2, input.end_at ? asDate(input.end_at) : null)
      .input('source', sql.NVarChar(32), input.source ?? 'manual')
      .input('sourceRef', sql.NVarChar(128), input.source_ref ?? null)
      .input('note', sql.NVarChar(512), input.note ?? null)
      .query(`
        MERGE health_sample WITH (HOLDLOCK) AS target
        USING (SELECT @userId AS user_id, @metricCode AS metric_code, @startAt AS start_at, @source AS source) AS src
          ON target.user_id = src.user_id
         AND target.metric_code = src.metric_code
         AND target.start_at = src.start_at
         AND target.source = src.source
        WHEN MATCHED THEN UPDATE SET
          value = @value, end_at = @endAt, source_ref = @sourceRef,
          note = @note, modified_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (user_id, metric_code, value, start_at, end_at, source, source_ref, note)
          VALUES (@userId, @metricCode, @value, @startAt, @endAt, @source, @sourceRef, @note)
        OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.metric_code, INSERTED.value,
               INSERTED.start_at, INSERTED.end_at, INSERTED.source, INSERTED.source_ref,
               INSERTED.note, INSERTED.created_at, INSERTED.modified_at;
      `);
    saved.push(mapSample(result.recordset[0]));
  }

  return saved;
}

// Samples for one metric, newest first. `since`/`until` are ISO instants.
export async function listSamples(
  userId: string,
  metricCode: string,
  options: { since?: string | null; until?: string | null; limit?: number } = {},
): Promise<HealthSample[]> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 200), 1), 2000);
  const pool = await getHealthConnection();
  const result = await pool.request()
    .input('userId', sql.NVarChar(128), userId)
    .input('metricCode', sql.NVarChar(64), metricCode)
    .input('since', sql.DateTime2, options.since ? asDate(options.since) : null)
    .input('until', sql.DateTime2, options.until ? asDate(options.until) : null)
    .input('limit', sql.Int, limit)
    .query(`
      SELECT TOP (@limit) id, user_id, metric_code, value, start_at, end_at,
             source, source_ref, note, created_at, modified_at
      FROM health_sample
      WHERE user_id = @userId AND metric_code = @metricCode
        AND (@since IS NULL OR start_at >= @since)
        AND (@until IS NULL OR start_at <= @until)
      ORDER BY start_at DESC
    `);
  if (result.recordset.length === 0) {
    console.warn(`No health samples for user '${userId}' metric '${metricCode}'`);
  }
  return result.recordset.map(mapSample);
}

// The single newest sample for a metric, or null when nothing has been logged.
// This is the cross-module read path: golem and forage both call it rather than
// reaching into each other's databases.
export async function getLatestSample(userId: string, metricCode: string): Promise<HealthSample | null> {
  const pool = await getHealthConnection();
  const result = await pool.request()
    .input('userId', sql.NVarChar(128), userId)
    .input('metricCode', sql.NVarChar(64), metricCode)
    .query(`
      SELECT TOP 1 id, user_id, metric_code, value, start_at, end_at,
             source, source_ref, note, created_at, modified_at
      FROM health_sample
      WHERE user_id = @userId AND metric_code = @metricCode
      ORDER BY start_at DESC
    `);
  return result.recordset.length ? mapSample(result.recordset[0]) : null;
}

// Latest value of every metric that has one, joined to the catalog for display.
export async function getLatestValues(userId: string): Promise<HealthLatestValue[]> {
  const pool = await getHealthConnection();
  const result = await pool.request()
    .input('userId', sql.NVarChar(128), userId)
    .query(`
      SELECT m.code, m.display_name, m.category, m.canonical_unit, m.sort_order,
             s.value, s.start_at, s.source
      FROM health_metric m
      CROSS APPLY (
        SELECT TOP 1 value, start_at, source
        FROM health_sample
        WHERE user_id = @userId AND metric_code = m.code
        ORDER BY start_at DESC
      ) s
      WHERE m.is_active = 1
      ORDER BY m.sort_order, m.code
    `);
  if (result.recordset.length === 0) {
    console.warn(`No health samples at all for user '${userId}'`);
  }
  return result.recordset.map((row) => ({
    metric_code: row.code as string,
    display_name: row.display_name as string,
    category: row.category as HealthLatestValue['category'],
    value: Number(row.value),
    unit: row.canonical_unit as string,
    measured_at: (row.start_at as Date).toISOString(),
    source: row.source as string,
  }));
}

// Remove one sample. Returns false when the row does not exist or is not the
// caller's — the API layer turns that into a 404.
export async function deleteSample(userId: string, id: number): Promise<boolean> {
  const pool = await getHealthConnection();
  const result = await pool.request()
    .input('userId', sql.NVarChar(128), userId)
    .input('id', sql.BigInt, id)
    .query('DELETE FROM health_sample WHERE id = @id AND user_id = @userId');
  return (result.rowsAffected[0] ?? 0) > 0;
}
