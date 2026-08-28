import sql from 'mssql';
import { getFoodConnection, closeFoodConnection } from './db';
import { WeightEntry } from '../types/weight';
import { getLatestBodyMassLb, mirrorBodyCompositionSafe } from '@/lib/health/bridge';

export async function listWeights(userId: string, sinceDate: string | null): Promise<WeightEntry[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const req = pool.request().input('userId', sql.UniqueIdentifier, userId);
    let where = 'user_id=@userId';
    if (sinceDate) {
      req.input('since', sql.Date, sinceDate);
      where += ' AND log_date >= @since';
    }
    const result = await req.query<any>(
      `SELECT id, user_id, CONVERT(varchar(10), log_date, 23) AS log_date, weight_lb, body_fat_pct
       FROM weight_log
       WHERE ${where}
       ORDER BY log_date DESC`
    );
    if (result.recordset.length === 0) {
      console.warn(`No weight entries for user_id: '${userId}'`);
      return [];
    }
    return result.recordset.map((r) => ({
      ...r,
      weight_lb: Number(r.weight_lb),
      body_fat_pct: r.body_fat_pct == null ? null : Number(r.body_fat_pct),
    }));
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Most recent weigh-ins that carry a body-fat reading, newest first. Body fat is
// recorded far less often than weight (an occasional visual estimate, not a daily
// scale number), so the dashboard's Visual Body Fat card cannot reuse the 30-day
// weigh-in window listWeights serves the rest of the dashboard from — a user with
// real readings, just older ones, would see an empty card.
export async function listBodyFatEntries(userId: string, limit: number): Promise<WeightEntry[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('limit', sql.Int, limit)
      .query<any>(
        `SELECT TOP (@limit) id, user_id, CONVERT(varchar(10), log_date, 23) AS log_date, weight_lb, body_fat_pct
         FROM weight_log
         WHERE user_id=@userId AND body_fat_pct IS NOT NULL
         ORDER BY log_date DESC`
      );
    if (result.recordset.length === 0) {
      console.warn(`No body-fat entries for user_id: '${userId}'`);
      return [];
    }
    return result.recordset.map((r) => ({
      ...r,
      weight_lb: Number(r.weight_lb),
      body_fat_pct: r.body_fat_pct == null ? null : Number(r.body_fat_pct),
    }));
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// The most recent forage weigh-in ROW, or null when the user has never logged one
// here. getLatestWeightLb below is the number the coaching math wants and hides
// where it came from; this keeps the log_date, which a caller reporting the
// strategy needs in order to say how stale the bodyweight behind the targets is.
export async function getLatestWeightEntry(userId: string): Promise<WeightEntry | null> {
  let pool;
  try {
    pool = await getFoodConnection();
    const r = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query<any>(
        `SELECT TOP 1 id, user_id, CONVERT(varchar(10), log_date, 23) AS log_date, weight_lb, body_fat_pct
         FROM weight_log WHERE user_id=@userId ORDER BY log_date DESC`
      );
    if (r.recordset.length === 0) return null;
    const row = r.recordset[0];
    return {
      ...row,
      weight_lb: Number(row.weight_lb),
      body_fat_pct: row.body_fat_pct == null ? null : Number(row.body_fat_pct),
    };
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Most recent weight on record, or null if the user has never logged one.
// Canonical source for the check-in coaching math (computeTargets' latest_weight_lb).
export async function getLatestWeightLb(userId: string): Promise<number | null> {
  let pool;
  try {
    pool = await getFoodConnection();
    const r = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query<any>(`SELECT TOP 1 weight_lb FROM weight_log WHERE user_id=@userId ORDER BY log_date DESC`);
    if (r.recordset.length > 0) return Number(r.recordset[0].weight_lb);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }

  // FORAGE HAS NO WEIGH-IN — fall back to the app-level health store, which is
  // where a Google Health Connect import or another module's reading lands.
  // Without this, importing a year of weights still leaves the check-in math
  // with no bodyweight to work from.
  return getLatestBodyMassLb(userId);
}

export async function upsertWeight(
  userId: string,
  logDate: string,
  weightLb: number,
  bodyFatPct: number | null = null,
): Promise<WeightEntry> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('logDate', sql.Date, logDate)
      .input('weightLb', sql.Decimal(6, 2), weightLb)
      .input('bodyFatPct', sql.Decimal(4, 1), bodyFatPct)
      .query<any>(
        `MERGE weight_log AS tgt
         USING (SELECT @userId AS user_id, @logDate AS log_date) AS src
           ON tgt.user_id = src.user_id AND tgt.log_date = src.log_date
         WHEN MATCHED THEN UPDATE SET weight_lb = @weightLb, body_fat_pct = @bodyFatPct
         WHEN NOT MATCHED THEN INSERT (user_id, log_date, weight_lb, body_fat_pct)
                              VALUES (@userId, @logDate, @weightLb, @bodyFatPct)
         OUTPUT INSERTED.id, INSERTED.user_id,
                CONVERT(varchar(10), INSERTED.log_date, 23) AS log_date,
                INSERTED.weight_lb, INSERTED.body_fat_pct;`
      );
    const row = result.recordset[0];
    const entry: WeightEntry = {
      ...row,
      weight_lb: Number(row.weight_lb),
      body_fat_pct: row.body_fat_pct == null ? null : Number(row.body_fat_pct),
    };

    // MIRROR TO THE MASTER HEALTH STORE — so golem, the health page and a
    // Health Connect export all see this weigh-in. Keyed on the weight_log row
    // id, so re-saving the same day updates instead of duplicating. Deliberately
    // not awaited: weight_log has already committed and is the source of truth,
    // so a health-store hiccup must not fail the user's weigh-in.
    mirrorBodyCompositionSafe(userId, {
      measuredAt: `${entry.log_date}T12:00:00Z`,
      weightLb: entry.weight_lb,
      bodyFatPct: entry.body_fat_pct,
      source: 'forage',
      sourceRef: String(entry.id),
    });

    return entry;
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function deleteWeight(userId: string, logDate: string): Promise<void> {
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('logDate', sql.Date, logDate)
      .query(`DELETE FROM weight_log WHERE user_id=@userId AND log_date=@logDate`);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}
