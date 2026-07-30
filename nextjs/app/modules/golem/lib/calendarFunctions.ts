import { getGolemConnection, closeGolemConnection } from './db';
import { GolemCalendarSession } from '../types/calendar';

// Fetch the user's workout sessions that fall on a calendar day within [fromYMD, toYMD]
// (both inclusive, YYYY-MM-DD). Each session is anchored on its real workout day —
// started_at when the session has been started/completed, falling back to created_at only
// for standalone (ad-hoc) sessions so a just-created extra workout shows on the day it was
// added. Unstarted PROGRAM sessions resolve to NULL (they are future plan with no date) and
// are filtered out by the BETWEEN, keeping the calendar a record of what was actually done.
export async function getSessionsForCalendar(
  userId: string,
  fromYMD: string,
  toYMD: string,
): Promise<GolemCalendarSession[]> {
  let pool;
  try {
    pool = await getGolemConnection();

    // CONVERT(..., 23) yields 'YYYY-MM-DD'; ISO date strings compare correctly with BETWEEN.
    // The COALESCE expression is the session's calendar anchor (see the function comment).
    const result = await pool.request()
      .input('userId', userId)
      .input('from', fromYMD)
      .input('to', toYMD)
      .query(`
        SELECT
          ws.id,
          ws.name,
          CONVERT(VARCHAR(10), COALESCE(ws.started_at, CASE WHEN ws.week_id IS NULL THEN ws.created_at END), 23) AS calendar_date,
          ws.is_completed,
          ws.is_current,
          CAST(CASE WHEN ws.week_id IS NULL THEN 1 ELSE 0 END AS BIT) AS is_standalone,
          p.name AS program_name,
          da.name AS day_archetype_name,
          ws.duration
        FROM workout_sessions ws
        LEFT JOIN weeks w ON ws.week_id = w.id
        LEFT JOIN blocks b ON w.block_id = b.id
        LEFT JOIN programs p ON b.program_id = p.id
        LEFT JOIN day_archetypes da ON da.id = ws.day_archetype_id
        WHERE ws.user_id = @userId
          AND CONVERT(VARCHAR(10), COALESCE(ws.started_at, CASE WHEN ws.week_id IS NULL THEN ws.created_at END), 23) BETWEEN @from AND @to
        ORDER BY calendar_date ASC, ws.order_index ASC, ws.created_at ASC
      `);

    if (result.recordset.length === 0) {
      console.warn(`No golem sessions found for calendar range '${fromYMD}'..'${toYMD}'`);
    }

    return result.recordset as GolemCalendarSession[];
  } catch (error) {
    console.error('Error fetching golem calendar sessions:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}
