import { ModuleBadge } from '@/types/dashboardBadge';
import { getGolemConnection } from './db';

// Homepage badge for the Golem card: which workout today is.
//
// Golem programs are a queue, not a calendar — an unstarted program session has no date (see
// getSessionsForCalendar), and completing one advances the program-wide is_current pointer to the
// next session. So "today's workout" resolves in two steps:
//   1. A session actually worked today (started or created today) — show it, greened out once
//      completed so a glance at the dashboard says "already done".
//   2. Otherwise the current/active session — that's what's up next, i.e. today's workout.
// Nothing current and nothing done today produces no badge rather than an empty-state one.

// Workout names run long ("Glycolytic C + Posterior/Glute + Core"), and these badges sit on a
// 2-up mobile grid, so clip to something that fits. The full name stays in `detail`.
const MAX_LABEL = 22;

function clip(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > MAX_LABEL ? `${trimmed.slice(0, MAX_LABEL - 1)}…` : trimmed;
}

// Server-local calendar date — matches the anchor CONVERT(...COALESCE(started_at, created_at))
// comparisons the calendar and history surfaces already use.
function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface SessionRow {
  name: string;
  archetype_name: string | null;
  is_completed: boolean;
}

export async function getGolemBadges(userId: string): Promise<ModuleBadge[]> {
  const pool = await getGolemConnection();

  // WORKED TODAY — a session started today, or an ad-hoc session created today. An unfinished one
  // wins over a finished one: after logging a second workout, "still going" beats "already done".
  const todayRes = await pool
    .request()
    .input('userId', userId)
    .input('today', todayIsoLocal())
    .query<SessionRow>(
      `SELECT TOP 1 ws.name, da.name AS archetype_name, ws.is_completed
       FROM workout_sessions ws
       LEFT JOIN day_archetypes da ON da.id = ws.day_archetype_id
       WHERE ws.user_id = @userId
         AND CONVERT(VARCHAR(10), COALESCE(ws.started_at, CASE WHEN ws.week_id IS NULL THEN ws.created_at END), 23) = @today
       ORDER BY ws.is_completed ASC, ws.modified_at DESC`
    );

  const worked = todayRes.recordset[0];
  if (worked) {
    const name = worked.name || worked.archetype_name || 'Workout';
    return [
      worked.is_completed
        ? {
            key: 'golem-today-done',
            label: clip(name),
            tone: 'green',
            detail: `Completed today: ${name}`,
          }
        : {
            key: 'golem-today-active',
            label: clip(name),
            tone: 'yellow',
            detail: `In progress today: ${name}`,
          },
    ];
  }

  // UP NEXT — the current session. Same deterministic tie-break as getCurrentWorkoutSession:
  // prefer the session in the current program, then the most recently touched.
  const currentRes = await pool
    .request()
    .input('userId', userId)
    .query<SessionRow>(
      `SELECT TOP 1 ws.name, da.name AS archetype_name, ws.is_completed
       FROM workout_sessions ws
       LEFT JOIN day_archetypes da ON da.id = ws.day_archetype_id
       LEFT JOIN weeks w ON ws.week_id = w.id
       LEFT JOIN blocks b ON w.block_id = b.id
       LEFT JOIN programs p ON b.program_id = p.id
       WHERE ws.is_current = 1 AND ws.user_id = @userId AND ws.is_completed = 0
       ORDER BY CASE WHEN p.is_current = 1 THEN 0 ELSE 1 END, ws.modified_at DESC`
    );

  const current = currentRes.recordset[0];
  if (!current) return [];

  const name = current.name || current.archetype_name || 'Workout';
  return [
    {
      key: 'golem-today',
      label: clip(name),
      tone: 'blue',
      detail: `Today's workout: ${name}`,
    },
  ];
}
