// DB access for the engine — thin functions that read real logged data and return engine-typed inputs.
// Queries validated against live data (plan §7 / data check). Follows the module's singleton-pool
// convention (closeGolemConnection is a no-op; kept in finally for consistency with sibling lib files).
import { getGolemConnection, closeGolemConnection } from '../db';
import type { E1rmPoint, MuscleSetEvent } from './types';
import type { TopSet } from './progression';

// Most recent completed top working set for an exercise (best set of the latest session that used it).
// Drives the progression decision. Returns null if the exercise has no logged weighted+rep history.
export async function getRecentTopSet(userId: string, exerciseId: string): Promise<TopSet | null> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('exerciseId', exerciseId)
      .query(`
        SELECT TOP 1 sss.weight, sss.reps, sss.rpe, sss.time_seconds
        FROM session_segment_sets sss
        JOIN session_segments ss ON sss.session_segment_id = ss.id
        JOIN workout_sessions ws ON ss.session_id = ws.id
        WHERE ws.user_id = @userId
          AND ss.exercise_id = @exerciseId
          AND ws.is_completed = 1
          AND sss.is_warmup = 0
          AND sss.is_completed = 1
          AND ((sss.reps IS NOT NULL AND sss.weight > 0) OR sss.time_seconds IS NOT NULL)
        ORDER BY ws.started_at DESC,
                 COALESCE(sss.weight * (1 + sss.reps / 30.0), 0) DESC, -- best weighted set (rep-based)
                 COALESCE(sss.time_seconds, 0) DESC                    -- longest hold/effort (timed)
      `);

    if (result.recordset.length === 0) {
      console.warn(`No logged top set found for exercise id: '${exerciseId}'`);
      return null;
    }
    const row = result.recordset[0];
    return { weight: row.weight ?? 0, reps: row.reps ?? 0, rpe: row.rpe, timeSeconds: row.time_seconds ?? null };
  } catch (error) {
    console.error('Error fetching recent top set:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Per-session best e1RM (Epley) for an exercise over the last `days`, ascending by date.
// Feeds plateau detection and realized-progression-rate (volume.ts).
export async function getE1rmSeries(userId: string, exerciseId: string, days: number = 180): Promise<E1rmPoint[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('exerciseId', exerciseId)
      .input('days', days)
      .query(`
        SELECT MAX(ws.started_at) AS dt,
               MAX(sss.weight * (1 + sss.reps / 30.0)) AS e1rm
        FROM session_segment_sets sss
        JOIN session_segments ss ON sss.session_segment_id = ss.id
        JOIN workout_sessions ws ON ss.session_id = ws.id
        WHERE ws.user_id = @userId
          AND ss.exercise_id = @exerciseId
          AND ws.is_completed = 1
          AND sss.is_warmup = 0
          AND sss.is_completed = 1
          AND sss.weight > 0
          AND sss.reps IS NOT NULL
          AND ws.started_at >= DATEADD(day, -@days, GETDATE())
        GROUP BY ws.id
        ORDER BY dt
      `);

    return result.recordset.map((r) => ({ date: r.dt as Date, e1rm: Math.round(r.e1rm) }));
  } catch (error) {
    console.error('Error fetching e1RM series:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// One event per completed working set (date + muscle trained) over the last `days`, for calendar-week
// volume bucketing (volume.ts). Captures standalone sessions the old weeks-keyed calc missed (plan §7).
export async function getMuscleSetEvents(userId: string, days: number = 180): Promise<MuscleSetEvent[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('days', days)
      .query(`
        SELECT ws.started_at AS dt, mg.name AS muscle
        FROM session_segment_sets sss
        JOIN session_segments ss ON sss.session_segment_id = ss.id
        JOIN workout_sessions ws ON ss.session_id = ws.id
        JOIN exercise_muscle_groups emg ON emg.exercise_id = ss.exercise_id
        JOIN muscle_groups mg ON mg.id = emg.muscle_group_id
        WHERE ws.user_id = @userId
          AND ws.is_completed = 1
          AND sss.is_warmup = 0
          AND sss.is_completed = 1
          AND ws.started_at >= DATEADD(day, -@days, GETDATE())
      `);

    return result.recordset.map((r) => ({ date: r.dt as Date, muscle: r.muscle as string }));
  } catch (error) {
    console.error('Error fetching muscle set events:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}
