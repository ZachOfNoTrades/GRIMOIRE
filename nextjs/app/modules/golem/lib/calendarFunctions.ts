import { getGolemConnection, closeGolemConnection } from './db';
import { GolemCalendarSession } from '../types/calendar';
import { toLocalDateString } from '@/lib/dateRange';

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

    // Fetch a UTC window padded one day each side, then bucket on the local day below.
    // NOTE: started_at/created_at hold UTC, so a SQL-side date would put an evening workout on the next day.
    // The COALESCE expression is the session's calendar anchor (see the function comment).
    const result = await pool.request()
      .input('userId', userId)
      .input('from', fromYMD)
      .input('to', toYMD)
      .query(`
        SELECT
          ws.id,
          ws.name,
          COALESCE(ws.started_at, CASE WHEN ws.week_id IS NULL THEN ws.created_at END) AS anchor_at,
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
          AND COALESCE(ws.started_at, CASE WHEN ws.week_id IS NULL THEN ws.created_at END) >= DATEADD(DAY, -1, CAST(@from AS DATE))
          AND COALESCE(ws.started_at, CASE WHEN ws.week_id IS NULL THEN ws.created_at END) < DATEADD(DAY, 2, CAST(@to AS DATE))
        ORDER BY ws.order_index ASC, ws.created_at ASC
      `);

    const sessions: GolemCalendarSession[] = result.recordset
      .map(({ anchor_at, ...row }) => ({ ...row, calendar_date: toLocalDateString(anchor_at) }))
      .filter((s) => s.calendar_date >= fromYMD && s.calendar_date <= toYMD)
      .sort((a, b) => a.calendar_date.localeCompare(b.calendar_date)); // Stable sort keeps order_index order within a day

    if (sessions.length === 0) {
      console.warn(`No golem sessions found for calendar range '${fromYMD}'..'${toYMD}'`);
    }

    return sessions;
  } catch (error) {
    console.error('Error fetching golem calendar sessions:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}
