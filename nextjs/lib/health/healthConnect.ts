import { getMetricCatalog, listMetrics } from './metrics';
import { getLatestValues, listSamples, recordSamples } from './samples';
import { ensureHealthProfile } from './profile';
import { HealthMetric, HealthSampleInput } from '@/types/health';

// Google Health Connect interop.
//
// There is no Android app yet, so nothing here talks to a device. What it does
// is make the master store speak Health Connect's record vocabulary in both
// directions: `buildExport()` emits records shaped like Jetpack Health Connect
// records (recordType + time/startTime-endTime + a typed value field), and
// `importRecords()` reads that same shape back. When an Android app does land,
// its Health Connect read/write is a transport detail — the data model already
// lines up, and a Health Connect JSON export dropped in today imports as-is.

export const HEALTH_EXPORT_SCHEMA = 'grimoire.health.v1';
export const HEALTH_EXPORT_SOURCE = 'health-connect';

// Health Connect spells its units out; map each canonical unit onto the unit
// name (and scale) that its record classes use.
const HC_UNITS: Record<string, { unit: string; perCanonical: number }> = {
  kg: { unit: 'kilograms', perCanonical: 1 },
  g: { unit: 'grams', perCanonical: 1 },
  cm: { unit: 'meters', perCanonical: 0.01 },
  m: { unit: 'meters', perCanonical: 1 },
  min: { unit: 'seconds', perCanonical: 60 },
  kcal: { unit: 'kilocalories', perCanonical: 1 },
  L: { unit: 'liters', perCanonical: 1 },
  '%': { unit: 'percent', perCanonical: 1 },
  bpm: { unit: 'beatsPerMinute', perCanonical: 1 },
  mmHg: { unit: 'millimetersOfMercury', perCanonical: 1 },
  ms: { unit: 'milliseconds', perCanonical: 1 },
  rpm: { unit: 'breathsPerMinute', perCanonical: 1 },
  degC: { unit: 'celsius', perCanonical: 1 },
  'mmol/L': { unit: 'millimolesPerLiter', perCanonical: 1 },
  'mL/kg/min': { unit: 'millilitersPerMinuteKilogram', perCanonical: 1 },
  count: { unit: 'count', perCanonical: 1 },
};

export interface HealthConnectRecord {
  recordType: string;
  time?: string;
  startTime?: string;
  endTime?: string;
  metadata: {
    id: string;
    dataOrigin: string;
    lastModifiedTime: string;
    // Not part of Health Connect — carried so a round-trip through our own
    // export lands back on the exact metric it came from rather than being
    // re-derived from recordType (BloodPressure maps to two metrics).
    grimoireMetric: string;
  };
  [field: string]: unknown;
}

export interface HealthExport {
  schema: typeof HEALTH_EXPORT_SCHEMA;
  exportedAt: string;
  profile: {
    dateOfBirth: string | null;
    biologicalSex: string | null;
    heightCm: number | null;
    restingHeartRate: number | null;
  };
  recordCount: number;
  records: HealthConnectRecord[];
}

function hcValue(metric: HealthMetric, canonicalValue: number): { value: number; unit: string } {
  const mapping = HC_UNITS[metric.canonical_unit];
  if (!mapping) return { value: canonicalValue, unit: metric.canonical_unit };
  return { value: canonicalValue * mapping.perCanonical, unit: mapping.unit };
}

function canonicalValue(metric: HealthMetric, raw: unknown): number {
  // Accept both the {value, unit} envelope and a bare number.
  const asNumber = typeof raw === 'number' ? raw : Number((raw as { value?: unknown })?.value);
  if (!Number.isFinite(asNumber)) {
    throw new Error(`Record for '${metric.code}' has no numeric value`);
  }
  const suppliedUnit = typeof raw === 'object' && raw !== null ? (raw as { unit?: string }).unit : undefined;
  const mapping = HC_UNITS[metric.canonical_unit];
  // Only rescale when the payload actually used Health Connect's unit name; a
  // bare number (or our canonical unit) is already canonical.
  if (mapping && suppliedUnit === mapping.unit) return asNumber / mapping.perCanonical;
  return asNumber;
}

// Serialize every sample in the window as Health Connect records.
export async function buildExport(
  userId: string,
  options: { since?: string | null; until?: string | null; perMetricLimit?: number } = {},
): Promise<HealthExport> {
  const [profile, metrics] = await Promise.all([ensureHealthProfile(userId), listMetrics()]);
  const perMetricLimit = Math.min(Math.max(Math.floor(options.perMetricLimit ?? 1000), 1), 2000);

  const records: HealthConnectRecord[] = [];
  for (const metric of metrics) {
    if (!metric.health_connect_type) continue;
    const samples = await listSamples(userId, metric.code, {
      since: options.since,
      until: options.until,
      limit: perMetricLimit,
    });
    for (const sample of samples) {
      const field = metric.health_connect_field ?? 'value';
      const record: HealthConnectRecord = {
        recordType: metric.health_connect_type,
        metadata: {
          id: `grimoire-${sample.id}`,
          dataOrigin: `app.grimoire.${sample.source}`,
          lastModifiedTime: sample.modified_at,
          grimoireMetric: metric.code,
        },
        [field]: hcValue(metric, sample.value),
      };
      // Health Connect splits instantaneous records (time) from interval
      // records (startTime/endTime); mirror that split.
      if (metric.is_interval) {
        record.startTime = sample.start_at;
        record.endTime = sample.end_at ?? sample.start_at;
      } else {
        record.time = sample.start_at;
      }
      records.push(record);
    }
  }

  return {
    schema: HEALTH_EXPORT_SCHEMA,
    exportedAt: new Date().toISOString(),
    profile: {
      dateOfBirth: profile.date_of_birth,
      biologicalSex: profile.biological_sex,
      heightCm: profile.height_cm,
      restingHeartRate: profile.resting_heart_rate,
    },
    recordCount: records.length,
    records,
  };
}

export interface HealthImportResult {
  imported: number;
  skipped: number;
  // One line per record we could not place, so a partial import is diagnosable
  // instead of silently lossy.
  errors: string[];
}

// Resolve a record onto a metric code: prefer the round-trip hint, else match
// on (recordType, field) against the catalog.
async function resolveMetric(record: HealthConnectRecord): Promise<{ metric: HealthMetric; field: string } | null> {
  const catalog = await getMetricCatalog();

  const hinted = record.metadata?.grimoireMetric;
  if (hinted && catalog.has(hinted)) {
    const metric = catalog.get(hinted)!;
    return { metric, field: metric.health_connect_field ?? 'value' };
  }

  for (const metric of catalog.values()) {
    if (metric.health_connect_type !== record.recordType) continue;
    const field = metric.health_connect_field ?? 'value';
    if (record[field] !== undefined) return { metric, field };
  }
  return null;
}

// Records this app exported carry their originating module in dataOrigin as
// `app.grimoire.<source>`. Recovering it on the way back in is what makes a
// round-trip idempotent — without it, re-importing your own export writes a
// second copy of every row under the importer's source.
function sourceFromDataOrigin(dataOrigin: string | undefined): string | null {
  const match = /^app\.grimoire\.([a-z0-9-]{1,32})$/i.exec(dataOrigin ?? '');
  return match ? match[1] : null;
}

// Ingest Health Connect records. Unknown record types are counted as skipped
// rather than failing the batch — a real export carries types we don't track.
//
// `source` pins every row to one source; omit it to let each record keep the
// module it came from (falling back to 'health-connect' for foreign records).
export async function importRecords(
  userId: string,
  records: HealthConnectRecord[],
  source?: string,
): Promise<HealthImportResult> {
  const result: HealthImportResult = { imported: 0, skipped: 0, errors: [] };
  const inputs: HealthSampleInput[] = [];

  for (const record of records) {
    let resolved;
    try {
      resolved = await resolveMetric(record);
    } catch (error) {
      result.errors.push(`${record.recordType}: ${(error as Error).message}`);
      continue;
    }
    if (!resolved) {
      result.skipped++;
      continue;
    }

    const startAt = record.startTime ?? record.time;
    if (!startAt) {
      result.errors.push(`${record.recordType}: record has neither time nor startTime`);
      continue;
    }

    try {
      inputs.push({
        metric_code: resolved.metric.code,
        value: canonicalValue(resolved.metric, record[resolved.field]),
        start_at: startAt,
        end_at: record.endTime ?? null,
        source: source ?? sourceFromDataOrigin(record.metadata?.dataOrigin) ?? HEALTH_EXPORT_SOURCE,
        source_ref: record.metadata?.id ?? null,
      });
    } catch (error) {
      result.errors.push(`${record.recordType}: ${(error as Error).message}`);
    }
  }

  // recordSamples caps a single call; chunk so a large export still lands.
  const CHUNK = 200;
  for (let i = 0; i < inputs.length; i += CHUNK) {
    const saved = await recordSamples(userId, inputs.slice(i, i + CHUNK));
    result.imported += saved.length;
  }
  return result;
}

// Compact "latest of everything" view — what a device sync or a dashboard tile
// would ask for.
export async function getLatestForSync(userId: string) {
  return getLatestValues(userId);
}
