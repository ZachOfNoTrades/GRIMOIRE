import sql from 'mssql';
import { getFoodConnection, closeFoodConnection } from './db';
import {
  ForageUserSettings,
  WeightUnit,
  DEFAULT_SETTINGS,
  FAVORITES_HISTORY_MIN_DAYS,
  FAVORITES_HISTORY_MAX_DAYS,
} from '../types/settings';

const ALLOWED_UNITS: WeightUnit[] = ['lbs', 'kg'];

// All settings columns, normalized for the client: weekday TIME -> HH:MM, DATE -> YYYY-MM-DD.
const SETTINGS_SELECT = `SELECT user_id, weight_unit,
        checkin_notif_enabled,
        CONVERT(VARCHAR(5), checkin_notif_time, 108) AS checkin_notif_time,
        CONVERT(VARCHAR(10), checkin_notif_last_sent_date, 23) AS checkin_notif_last_sent_date,
        favorites_history_days,
        unlogged_badge_enabled,
        CONVERT(VARCHAR(5), unlogged_badge_time, 108) AS unlogged_badge_time
   FROM forage_user_settings`;

interface SettingsRow {
  user_id: string;
  weight_unit: WeightUnit;
  checkin_notif_enabled: boolean;
  checkin_notif_time: string;
  checkin_notif_last_sent_date: string | null;
  favorites_history_days: number | null;
  unlogged_badge_enabled: boolean | null;
  unlogged_badge_time: string | null;
}

function mapSettings(r: SettingsRow): ForageUserSettings {
  return {
    user_id: r.user_id,
    weight_unit: r.weight_unit,
    checkin_notif_enabled: Boolean(r.checkin_notif_enabled),
    checkin_notif_time: (r.checkin_notif_time ?? DEFAULT_SETTINGS.checkin_notif_time).slice(0, 5),
    checkin_notif_last_sent_date: r.checkin_notif_last_sent_date ?? null,
    favorites_history_days: r.favorites_history_days ?? DEFAULT_SETTINGS.favorites_history_days,
    unlogged_badge_enabled:
      r.unlogged_badge_enabled === null
        ? DEFAULT_SETTINGS.unlogged_badge_enabled
        : Boolean(r.unlogged_badge_enabled),
    unlogged_badge_time: (r.unlogged_badge_time ?? DEFAULT_SETTINGS.unlogged_badge_time).slice(0, 5),
  };
}

export async function getSettings(userId: string): Promise<ForageUserSettings> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query<SettingsRow>(`${SETTINGS_SELECT} WHERE user_id = @userId`);
    if (result.recordset.length === 0) {
      // No row yet — return defaults without persisting; first PUT will write.
      return { user_id: userId, ...DEFAULT_SETTINGS };
    }
    return mapSettings(result.recordset[0]);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function upsertSettings(
  userId: string,
  weightUnit: WeightUnit,
): Promise<ForageUserSettings> {
  if (!ALLOWED_UNITS.includes(weightUnit)) {
    throw new Error(`Invalid weight_unit: '${weightUnit}'`);
  }
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('weightUnit', sql.NVarChar(8), weightUnit)
      .query(
        `MERGE forage_user_settings AS tgt
         USING (SELECT @userId AS user_id) AS src
           ON tgt.user_id = src.user_id
         WHEN MATCHED THEN UPDATE SET weight_unit = @weightUnit, ts_updated = SYSUTCDATETIME()
         WHEN NOT MATCHED THEN INSERT (user_id, weight_unit) VALUES (@userId, @weightUnit);`
      );
    return getSettings(userId);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Persists the history window (in days) the picker's hourly "favorites" looks back
// over when counting frequently-logged foods. Clamped to the allowed range so a bad
// client value can't widen it without bound or zero it out.
export async function upsertFavoritesHistoryDays(
  userId: string,
  days: number,
): Promise<ForageUserSettings> {
  if (!Number.isFinite(days)) {
    throw new Error(`Invalid favorites_history_days: '${days}'`);
  }
  const clamped = Math.min(FAVORITES_HISTORY_MAX_DAYS, Math.max(FAVORITES_HISTORY_MIN_DAYS, Math.round(days)));
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('days', sql.Int, clamped)
      .query(
        `MERGE forage_user_settings AS tgt
         USING (SELECT @userId AS user_id) AS src
           ON tgt.user_id = src.user_id
         WHEN MATCHED THEN UPDATE SET favorites_history_days = @days, ts_updated = SYSUTCDATETIME()
         WHEN NOT MATCHED THEN INSERT (user_id, favorites_history_days) VALUES (@userId, @days);`
      );
    return getSettings(userId);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Persists the homepage "nothing logged yet" badge preference. `time` is local HH:MM (24h) —
// the cutoff after which an empty diary is worth flagging on the dashboard card. Purely a
// display gate; nothing is sent, so there's no de-dupe stamp to clear here.
export async function upsertUnloggedBadge(
  userId: string,
  enabled: boolean,
  time: string,
): Promise<ForageUserSettings> {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error(`Invalid unlogged_badge_time: '${time}'`);
  }
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('enabled', sql.Bit, enabled)
      .input('time', sql.VarChar(5), time)
      .query(
        `MERGE forage_user_settings AS tgt
         USING (SELECT @userId AS user_id) AS src
           ON tgt.user_id = src.user_id
         WHEN MATCHED THEN UPDATE SET unlogged_badge_enabled = @enabled,
                                      unlogged_badge_time = @time,
                                      ts_updated = SYSUTCDATETIME()
         WHEN NOT MATCHED THEN INSERT (user_id, unlogged_badge_enabled, unlogged_badge_time)
                               VALUES (@userId, @enabled, @time);`
      );
    return getSettings(userId);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Persists the user's check-in reminder preference. `time` is local HH:MM (24h);
// SQL Server casts the 'HH:MM' string to TIME. Toggling/changing the time clears
// the de-dupe stamp so a freshly-enabled reminder can fire again today.
export async function upsertCheckinNotif(
  userId: string,
  enabled: boolean,
  time: string,
): Promise<ForageUserSettings> {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error(`Invalid checkin_notif_time: '${time}'`);
  }
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('enabled', sql.Bit, enabled)
      .input('time', sql.VarChar(5), time)
      .query(
        `MERGE forage_user_settings AS tgt
         USING (SELECT @userId AS user_id) AS src
           ON tgt.user_id = src.user_id
         WHEN MATCHED THEN UPDATE SET checkin_notif_enabled = @enabled,
                                      checkin_notif_time = @time,
                                      checkin_notif_last_sent_date = NULL,
                                      ts_updated = SYSUTCDATETIME()
         WHEN NOT MATCHED THEN INSERT (user_id, checkin_notif_enabled, checkin_notif_time)
                               VALUES (@userId, @enabled, @time);`
      );
    return getSettings(userId);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Marks today's check-in reminder as sent. Idempotent — the scheduler also gates on
// lastSentDate so it never double-sends within the same UTC day.
export async function markCheckinNotifSent(userId: string, todayYMD: string): Promise<void> {
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('today', sql.Date, todayYMD)
      .query(
        `UPDATE forage_user_settings SET checkin_notif_last_sent_date = @today, ts_updated = SYSUTCDATETIME()
         WHERE user_id = @userId`
      );
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Users with the check-in reminder enabled whose chosen time is <= the current local
// minute. The scheduler then resolves each user's active program + due-state before
// sending. Mirrors quest's listDigestCandidates.
export interface CheckinNotifCandidate {
  userId: string;
  time: string;
  lastSentDate: string | null;
}

export async function listCheckinNotifCandidates(nowHHMM: string): Promise<CheckinNotifCandidate[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const res = await pool
      .request()
      .input('nowHHMM', sql.VarChar(5), nowHHMM)
      .query<{ user_id: string; checkin_notif_time: string; checkin_notif_last_sent_date: string | null }>(
        `SELECT user_id,
                CONVERT(VARCHAR(5), checkin_notif_time, 108) AS checkin_notif_time,
                CONVERT(VARCHAR(10), checkin_notif_last_sent_date, 23) AS checkin_notif_last_sent_date
         FROM forage_user_settings
         WHERE checkin_notif_enabled = 1
           AND CONVERT(VARCHAR(5), checkin_notif_time, 108) <= @nowHHMM`
      );
    return res.recordset.map((r) => ({
      userId: r.user_id,
      time: r.checkin_notif_time,
      lastSentDate: r.checkin_notif_last_sent_date,
    }));
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}
