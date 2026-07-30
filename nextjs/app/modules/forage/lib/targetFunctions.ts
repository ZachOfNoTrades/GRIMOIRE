import sql from 'mssql';
import { getFoodConnection, closeFoodConnection } from './db';
import { MacroTarget } from '../types/target';

// Phase 4: macro targets now live in the unified history-capable
// `nutrient_targets_v2` table (scope='macro', one row per macro nutrient), NOT in
// the legacy `macro_targets` table. Each MacroTarget the rest of the app expects
// is RESOLVED from the 4 macro nutrient-target rows (kcal/protein/fat/carbs) that
// share a user_id + effective_date + day_of_week + is_active + source. The macro
// goal value is stored in `target` (floor/ceiling NULL). The MacroTarget contract
// in types/target.ts is preserved so callers/UI/API are unaffected.

const MACRO_CODES = ['kcal', 'protein', 'fat', 'carbs'] as const;

// One resolved macro-target "group" = the 4 macro rows sharing identity.
function rowsToMacroTarget(rows: any[]): MacroTarget {
  // Pull the shared identity off any row (they all carry the same group fields).
  const head = rows[0];
  const byCode: Record<string, number> = {};
  for (const r of rows) byCode[r.code] = Number(r.target);
  return {
    id: head.group_id,
    user_id: head.user_id,
    effective_date: head.effective_date,
    day_of_week: head.day_of_week,
    kcal: byCode['kcal'] ?? 0,
    protein_g: byCode['protein'] ?? 0,
    carbs_g: byCode['carbs'] ?? 0,
    fat_g: byCode['fat'] ?? 0,
    is_active: !!head.is_active,
    source: head.source,
  };
}

// When `forDate` is null, returns the current is_active=1 target. When `forDate`
// is set (YYYY-MM-DD), returns the target that was effective on that date — needed
// so the dashboard shows correct macros for past dates after the MacroFactor
// program history has been imported. A "target" is the group of macro rows sharing
// (user_id, effective_date, day_of_week, is_active, source); they are written
// atomically so the group is always consistent.
export async function getActiveTarget(
  userId: string,
  forDate: string | null = null,
): Promise<MacroTarget | null> {
  let pool;
  try {
    pool = await getFoodConnection();
    const req = pool.request().input('userId', sql.UniqueIdentifier, userId);
    // Identify the winning group by its effective_date (and is_active when current).
    // All 4 macro rows of a group share the same effective_date/ts, so picking the
    // group is a MAX(effective_date) over the macro rows for this user.
    let groupFilter = "v.scope='macro' AND v.user_id=@userId AND v.day_of_week IS NULL";
    if (forDate) {
      req.input('forDate', sql.Date, forDate);
      groupFilter += ' AND v.effective_date <= @forDate';
    } else {
      groupFilter += ' AND v.is_active=1';
    }
    // The active/most-recent group: highest effective_date, tie-broken by latest
    // updated_at so a same-day re-target wins. We resolve the group's identity from
    // the kcal row (always present — a target with zero kcal is not written) then
    // pull all macro rows for that exact identity.
    const result = await req.query<any>(
      `;WITH macro AS (
         SELECT v.id, v.user_id,
                CONVERT(varchar(10), v.effective_date, 23) AS effective_date,
                v.effective_date AS eff_raw, v.day_of_week, v.is_active, v.source,
                v.updated_at, v.target, n.code
         FROM nutrient_targets_v2 v
         JOIN nutrients n ON n.id = v.nutrient_id
         WHERE ${groupFilter}
       ),
       winner AS (
         SELECT TOP 1 eff_raw, updated_at, is_active, source
         FROM macro
         ORDER BY eff_raw DESC, updated_at DESC
       )
       SELECT m.id AS group_id, m.user_id, m.effective_date, m.day_of_week,
              m.is_active, m.source, m.code, m.target
       FROM macro m
       JOIN winner w
         ON m.eff_raw = w.eff_raw AND m.updated_at = w.updated_at
        AND m.is_active = w.is_active AND m.source = w.source`
    );
    if (result.recordset.length === 0) return null;
    return rowsToMacroTarget(result.recordset);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

async function insertTarget(
  pool: sql.ConnectionPool,
  userId: string,
  target: { kcal: number; protein_g: number; carbs_g: number; fat_g: number },
  source: 'manual' | 'program',
): Promise<MacroTarget> {
  // Deactivate the prior current macro group (all-days only — per-DOW unaffected).
  await pool
    .request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(
      `UPDATE nutrient_targets_v2 SET is_active=0
       WHERE scope='macro' AND user_id=@userId AND day_of_week IS NULL`
    );

  // Insert the 4 macro rows as one group sharing effective_date/updated_at (one
  // SYSUTCDATETIME captured once, applied to all 4) so they resolve back together.
  await pool
    .request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('kcal', sql.Int, Math.round(target.kcal))
    .input('protein', sql.Int, Math.round(target.protein_g))
    .input('carbs', sql.Int, Math.round(target.carbs_g))
    .input('fat', sql.Int, Math.round(target.fat_g))
    .input('source', sql.VarChar(16), source)
    .query(
      `DECLARE @now DATETIME2 = SYSUTCDATETIME();
       DECLARE @eff DATE = CAST(GETDATE() AS DATE);
       ;WITH macro_ids AS (SELECT code, id FROM nutrients WHERE category='macro')
       INSERT INTO nutrient_targets_v2
         (scope, user_id, program_id, nutrient_id, floor, target, ceiling,
          effective_date, day_of_week, is_active, source, updated_at)
       SELECT 'macro', @userId, NULL, mi.id, NULL, v.val, NULL,
              @eff, NULL, 1, @source, @now
       FROM (VALUES ('kcal',@kcal),('protein',@protein),('fat',@fat),('carbs',@carbs)) AS v(code,val)
       JOIN macro_ids mi ON mi.code = v.code;`
    );
  // Re-select the just-written active group to return the resolved MacroTarget.
  const read = await pool
    .request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<any>(
      `;WITH macro AS (
         SELECT v.id, v.user_id,
                CONVERT(varchar(10), v.effective_date, 23) AS effective_date,
                v.effective_date AS eff_raw, v.day_of_week, v.is_active, v.source,
                v.updated_at, v.target, n.code
         FROM nutrient_targets_v2 v
         JOIN nutrients n ON n.id = v.nutrient_id
         WHERE v.scope='macro' AND v.user_id=@userId AND v.day_of_week IS NULL AND v.is_active=1
       ),
       winner AS (SELECT TOP 1 eff_raw, updated_at FROM macro ORDER BY eff_raw DESC, updated_at DESC)
       SELECT m.id AS group_id, m.user_id, m.effective_date, m.day_of_week,
              m.is_active, m.source, m.code, m.target
       FROM macro m JOIN winner w ON m.eff_raw=w.eff_raw AND m.updated_at=w.updated_at`
    );
  return rowsToMacroTarget(read.recordset);
}

export async function setTarget(
  userId: string,
  target: { kcal: number; protein_g: number; carbs_g: number; fat_g: number },
): Promise<MacroTarget> {
  let pool;
  try {
    pool = await getFoodConnection();
    return await insertTarget(pool, userId, target, 'manual');
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function setTargetFromProgram(
  userId: string,
  target: { kcal: number; protein_g: number; carbs_g: number; fat_g: number },
): Promise<MacroTarget> {
  let pool;
  try {
    pool = await getFoodConnection();
    return await insertTarget(pool, userId, target, 'program');
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}
