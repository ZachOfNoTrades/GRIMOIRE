import { WorkoutSession } from '../types/workoutSession';

// A running session whose clock nobody has touched for this long wasn't being worked — the user
// finished, walked away and never hit Finish (phone locked, tab left open overnight). Everything
// after the last thing they logged is dead air, so the timer gets trimmed back to it instead of
// being allowed to run all night and stamp a 14-hour "workout".
export const STALE_SESSION_IDLE_SECONDS = 2 * 60 * 60; // 2h

// Reconciliation runs at READ time (see getWorkoutSessionById / getCurrentWorkoutSession) rather
// than on a timer, so every entry point into the module — opening the session, loading the golem
// home card, an MCP read — self-heals a stale clock without needing its own trigger.
//
// The fix reuses the existing pause/resume accumulation exactly as designed: the real worked time
// is banked into `duration` and `resumed_at` is moved to now, so the clock restarts from the honest
// total. That also makes it idempotent — a second reconcile of a still-idle session banks zero more
// seconds, so `duration` converges instead of creeping up on every page load.
export async function reconcileStaleSessionTimer(
  pool: { request: () => any },
  userId: string,
  session: WorkoutSession,
): Promise<WorkoutSession> {

  // Only a session with a live, uncompleted clock can go stale.
  const timerStart = session.resumed_at ?? session.started_at;
  if (session.is_completed || !timerStart) return session;

  const startMs = new Date(timerStart).getTime();
  if (!Number.isFinite(startMs)) return session;

  try {
    return await trimAbandonedClock(pool, userId, session, startMs);
  } catch (error) {
    // This is housekeeping riding along on a read. A session the user can still open, with a wrong
    // duration they can edit by hand, beats a session page that won't load at all — so a failure
    // here degrades to the untrimmed row rather than propagating out of the fetch.
    console.error('Error reconciling stale session timer:', error);
    return session;
  }
}

async function trimAbandonedClock(
  pool: { request: () => any },
  userId: string,
  session: WorkoutSession,
  startMs: number,
): Promise<WorkoutSession> {

  // LAST ACTIVITY — the newest thing the user actually logged: a set written or edited, or an
  // exercise added to the session. Session-row edits are deliberately excluded; the reconcile
  // itself writes that row, which would keep resetting its own idle clock.
  const activityResult = await pool.request()
    .input('userId', userId)
    .input('sessionId', session.id)
    .query(`
      SELECT MAX(a.at) AS last_activity_at
      FROM (
        SELECT MAX(s.modified_at) AS at
        FROM session_segment_sets s
        JOIN session_segments g ON g.id = s.session_segment_id
        WHERE g.session_id = @sessionId AND s.user_id = @userId
        UNION ALL
        SELECT MAX(g.modified_at) AS at
        FROM session_segments g
        WHERE g.session_id = @sessionId AND g.user_id = @userId
      ) a
    `);

  const rawLastActivity = activityResult.recordset[0]?.last_activity_at ?? null;
  const loggedMs = rawLastActivity ? new Date(rawLastActivity).getTime() : NaN;

  // A session started but never logged into has no activity of its own — the clock start IS its
  // last activity, so walking away from it banks zero seconds rather than the whole idle stretch.
  const lastActivityMs = Number.isFinite(loggedMs) ? Math.max(startMs, loggedMs) : startMs;

  const now = new Date();
  const idleSeconds = Math.floor((now.getTime() - lastActivityMs) / 1000);
  if (idleSeconds <= STALE_SESSION_IDLE_SECONDS) return session;

  // Seconds banked before this clock leg (only meaningful once the session has been resumed at
  // least once — before that `duration` is unset and `started_at` is the whole story). Clamped
  // because `duration` is a hand-editable column: a negative or junk value already in the row must
  // not be carried forward into a negative total that then renders as a nonsense timer.
  const carriedSeconds = session.resumed_at ? Math.max(0, session.duration ?? 0) : 0;
  const workedSeconds = Math.max(0, Math.floor((lastActivityMs - startMs) / 1000));
  // WALL-CLOCK CEILING — time actually spent working cannot exceed the span from when the session
  // began to the last thing logged in it, no matter how the legs add up. `carriedSeconds` is opaque
  // (a hand-edited value, or a leg whose boundary has since moved), so without this a clock leg that
  // starts before work already banked in `duration` would count that work twice. Skipped when
  // `started_at` is missing or sits after the last activity, where the span says nothing useful.
  const startedAtMs = session.started_at ? new Date(session.started_at).getTime() : NaN;
  const spanSeconds = Number.isFinite(startedAtMs)
    ? Math.floor((lastActivityMs - startedAtMs) / 1000)
    : Number.POSITIVE_INFINITY;
  const bounded = spanSeconds >= 0
    ? Math.min(carriedSeconds + workedSeconds, spanSeconds)
    : carriedSeconds + workedSeconds;

  // `duration` is a SQL int, so an already-absurd stored value plus this leg can overflow the column
  // and make the UPDATE throw — which would silently leave the runaway clock in place. Clamping keeps
  // the trim a write that always lands.
  const trimmedDuration = Math.min(2147483647, bounded);

  // `modified_at` is intentionally left alone: getCurrentWorkoutSession tie-breaks on it, and a
  // read-triggered write must not reorder which session is considered current.
  await pool.request()
    .input('userId', userId)
    .input('sessionId', session.id)
    .input('duration', trimmedDuration)
    .input('resumedAt', now)
    .query(`
      UPDATE workout_sessions
      SET duration = @duration, resumed_at = @resumedAt
      WHERE id = @sessionId AND user_id = @userId AND is_completed = 0
    `);

  return {
    ...session,
    duration: trimmedDuration,
    resumed_at: now,
    timer_trimmed_seconds: idleSeconds,
  };
}
