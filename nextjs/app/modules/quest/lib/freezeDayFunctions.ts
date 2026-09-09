import sql from 'mssql';
import { getQuestConnection } from './db';
import { getCurrentDate } from './settingsFunctions';
import { activeOccurrenceStart, effectiveStreak } from './taskFunctions';
import { Frequency, RepeatMode, TaskKind } from '../types/task';

export interface FrozenDay {
  frozen_date: string;
  ts_created: Date;
}

export interface FreezeDayResult {
  alreadyFrozen: boolean;
  reversedTaskCount: number;
  reversedCoins: number;
  restoredHealth: number;
  deferredTaskCount: number;
}

export interface FreezeDayOptions {
  // IDs of dailies that were scheduled for @dateYMD which the user wants made available on
  // (@dateYMD + 1 day). For each, freezeDay stamps deferred_to_date = (@dateYMD + 1). Only
  // dailies belonging to @userId are honoured; unknown / cross-user IDs are silently dropped.
  deferTaskIds?: string[];
}

export async function isFrozenDay(userId: string, dateYMD: string): Promise<boolean> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('date', sql.Date, dateYMD)
    .query<{ ok: number }>(
      `SELECT TOP 1 1 AS ok FROM quest_frozen_days WHERE user_id = @userId AND frozen_date = @date`
    );
  return res.recordset.length > 0;
}

export async function listFrozenDays(userId: string, limit = 50): Promise<FrozenDay[]> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('limit', sql.Int, limit)
    .query<FrozenDay>(
      `SELECT TOP (@limit)
              CONVERT(VARCHAR(10), frozen_date, 23) AS frozen_date,
              ts_created
       FROM quest_frozen_days
       WHERE user_id = @userId
       ORDER BY frozen_date DESC`
    );
  return res.recordset;
}

// Frozen dates within [from, to] (inclusive, YYYY-MM-DD) for a user — used by the calendar to mark
// excused days. Returns the bare date strings.
export async function listFrozenDaysInRange(userId: string, from: string, to: string): Promise<string[]> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('from', sql.Date, from)
    .input('to', sql.Date, to)
    .query<{ frozen_date: string }>(
      `SELECT CONVERT(VARCHAR(10), frozen_date, 23) AS frozen_date
       FROM quest_frozen_days
       WHERE user_id = @userId AND frozen_date BETWEEN @from AND @to`
    );
  return res.recordset.map((r) => r.frozen_date);
}

// Mark @dateYMD as frozen and undo its side-effects: forfeit any daily-task rewards credited
// that day, roll back streak / last_completed_date state to a "didn't do this on @date" shape,
// and reverse any damage already applied by the next day's processDailyDamageCheck for missing
// those dailies. Returns alreadyFrozen=true if (user, date) is already in quest_frozen_days.
export async function freezeDay(userId: string, dateYMD: string, options: FreezeDayOptions = {}): Promise<FreezeDayResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYMD)) {
    throw new Error(`Invalid date: '${dateYMD}' (expected YYYY-MM-DD)`);
  }
  const today = await getCurrentDate(userId);
  if (dateYMD >= today) {
    throw new Error(`Freeze date must be before today (today=${today}, requested=${dateYMD})`);
  }
  const pool = await getQuestConnection();

  // Short-circuit before touching the ledger / damage log if the date is already on file.
  if (await isFrozenDay(userId, dateYMD)) {
    return { alreadyFrozen: true, reversedTaskCount: 0, reversedCoins: 0, restoredHealth: 0, deferredTaskCount: 0 };
  }

  // The defer target is always (@dateYMD + 1 day). Computed in JS so we don't have to round-trip
  // for the date math — UTC-naive arithmetic on a YMD string with a fixed 00:00 anchor is safe.
  const deferTarget = (() => {
    const d = new Date(`${dateYMD}T00:00:00`); d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  // Dedupe and discard malformed IDs before the round-trip; SQL Server's UNIQUEIDENTIFIER
  // parameter will reject garbage but bailing here gives a cleaner failure mode.
  const deferIds = Array.from(new Set((options.deferTaskIds ?? []).filter(s => typeof s === 'string' && s.length > 0)));

  // ALREADY-SCHEDULED ELIGIBILITY FILTER — drop any carry-over candidate already scheduled on the
  // carry target (deferTarget = frozen day + 1). Such a daily is still completable on deferTarget,
  // so deferring it would create a redundant duplicate occupancy. "Scheduled" means EITHER an
  // existing deferred_to_date one-shot already pointing at deferTarget, OR an occurrence whose grace
  // window covers deferTarget. Mirrors the client carry-over checklist (home/page.tsx isScheduledOn)
  // and the migrate-to-today guard, enforcing the same rule server-side. Past-window tasks with no
  // matching deferral return null/false from both checks and stay eligible to carry forward.
  let eligibleDeferIds = deferIds;
  if (deferIds.length > 0) {
    const schedReq = pool.request().input('userId', sql.UniqueIdentifier, userId);
    const placeholders: string[] = [];
    deferIds.forEach((id, i) => {
      const name = `sid${i}`;
      schedReq.input(name, sql.UniqueIdentifier, id);
      placeholders.push(`@${name}`);
    });
    const schedRes = await schedReq.query<{ id: string; frequency: Frequency; days_of_week: string | null; every_n: number; start_date: string | null; window_days: number; deferred_to_date: string | null }>(
      `SELECT id, frequency, days_of_week, every_n,
              CONVERT(VARCHAR(10), start_date, 23) AS start_date,
              window_days,
              CONVERT(VARCHAR(10), deferred_to_date, 23) AS deferred_to_date
       FROM quest_tasks
       WHERE user_id = @userId AND kind = 'daily' AND id IN (${placeholders.join(',')})`
    );
    const alreadyScheduled = new Set(
      schedRes.recordset
        .filter((s) => s.deferred_to_date === deferTarget || activeOccurrenceStart(s, deferTarget) !== null)
        .map((s) => s.id.toUpperCase())
    );
    eligibleDeferIds = deferIds.filter((id) => !alreadyScheduled.has(id.toUpperCase()));
  }

  const tx = pool.transaction();
  await tx.begin();
  try {
    // Reserve the freeze marker first. PK on (user_id, frozen_date) means a racing insert
    // throws a duplicate-key error — let it bubble; the caller treats it as "already frozen".
    await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('date', sql.Date, dateYMD)
      .query(`INSERT INTO quest_frozen_days (user_id, frozen_date) VALUES (@userId, @date)`);

    // Tasks completed ON the frozen date. Earlier completions (whose streak happens to extend
    // through this date) are handled by the streak-preservation sweep below; here we only undo
    // what was actually credited on @date.
    const tasksRes = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('date', sql.Date, dateYMD)
      .query<{ id: string; last_bonus_date: string | null }>(
        `SELECT id,
                CONVERT(VARCHAR(10), last_bonus_date, 23) AS last_bonus_date
         FROM quest_tasks
         WHERE user_id = @userId AND kind = 'daily' AND last_completed_date = @date`
      );

    let reversedCoins = 0;
    let reversedTaskCount = 0;
    for (const t of tasksRes.recordset) {
      // Delete every positive task-ledger row this task wrote on @date — "Daily:",
      // "Streak bonus:", "Subtask:", "Subtask streak bonus:". The legitimate negative rows
      // ("Un-completed: …", "Un-subtask: …") on @date stay; their reversal of an earlier
      // credit is independent of the freeze.
      const delRes = await tx.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('refId', sql.UniqueIdentifier, t.id)
        .input('date', sql.Date, dateYMD)
        .query<{ delta: number }>(
          `DELETE FROM quest_ledger
           OUTPUT deleted.delta
           WHERE user_id = @userId AND ref_id = @refId AND ref_type = 'task' AND delta > 0
             AND CAST(ts_created AS DATE) = @date`
        );
      for (const row of delRes.recordset) reversedCoins -= Number(row.delta);

      // Clear last_completed_date so the daily is "open" again, but DO NOT touch streak_count
      // — freezing is a skip, not an uncompletion. The post-loop sweep keeps streak_last_date
      // anchored at @date so the chain doesn't break.
      const newLastBonus = t.last_bonus_date === dateYMD ? null : t.last_bonus_date;
      await tx.request()
        .input('id', sql.UniqueIdentifier, t.id)
        .input('lastBonusDate', sql.Date, newLastBonus)
        .query(
          `UPDATE quest_tasks
           SET last_completed_date = NULL,
               ts_completed = NULL,
               last_bonus_date = @lastBonusDate
           WHERE id = @id`
        );

      // Subtasks the user checked off on @date go back to unchecked so the parent shows
      // as "not started" once the freeze settles.
      await tx.request()
        .input('taskId', sql.UniqueIdentifier, t.id)
        .input('date', sql.Date, dateYMD)
        .query(
          `UPDATE quest_subtasks
           SET done = 0, ts_completed = NULL, last_bonus_date = NULL
           WHERE task_id = @taskId AND done = 1 AND CAST(ts_completed AS DATE) = @date`
        );
      reversedTaskCount += 1;
    }

    // Streak preservation: advance streak_last_date to @date for every active daily whose streak
    // was STILL ALIVE going into the frozen day. Without this, effectiveStreak() on the day after
    // the freeze would see streak_last_date < expectedPreviousOccurrence(today) and return 0 —
    // i.e. the streak would silently break across the frozen day.
    //
    // The aliveness gate is the point: a bare `streak_count > 0` sweep also advances dailies whose
    // streak died weeks earlier, and since every later freeze drags the marker forward again, a
    // long-dead streak reads as live forever (McGill Big 3: completed once on 2026-08-24, missed
    // 08-25..27 unfrozen, yet streak_last_date walked to 2026-09-07). Aliveness is per-task cadence
    // math, so the candidates are filtered in JS with effectiveStreak — the same predicate the
    // reward path uses — and only the survivors are written back. Evaluating it AT @date is what
    // makes "the freeze excuses @date" work: @date's own occurrence window is still open at @date,
    // so the test reduces to "was the previous occurrence satisfied?".
    //
    // Tasks whose streak_last_date is already at or past @date (e.g. completed on a later day) are
    // excluded by the query so we don't drag streak markers backwards.
    const streakRes = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('date', sql.Date, dateYMD)
      .query<{ id: string; streak_count: number; streak_last_date: string | null; kind: TaskKind; frequency: Frequency; days_of_week: string | null; every_n: number; start_date: string | null; repeat_mode: RepeatMode | null; window_days: number | null }>(
        `SELECT id, streak_count,
                CONVERT(VARCHAR(10), streak_last_date, 23) AS streak_last_date,
                kind, frequency, days_of_week, every_n,
                CONVERT(VARCHAR(10), start_date, 23) AS start_date,
                repeat_mode, window_days
         FROM quest_tasks
         WHERE user_id = @userId
           AND kind = 'daily'
           AND streak_count > 0
           AND (streak_last_date IS NULL OR streak_last_date < @date)`
      );
    // deferred_to_date is deliberately not selected: it is a one-shot carry-over marker, not part of
    // the base cadence a streak is measured against, and freezeDay rewrites it below anyway.
    const aliveIds = streakRes.recordset
      .filter((t) => effectiveStreak(t, dateYMD) > 0)
      .map((t) => t.id);
    if (aliveIds.length > 0) {
      const streakReq = tx.request().input('date', sql.Date, dateYMD);
      const streakValues: string[] = [];
      aliveIds.forEach((id, i) => {
        const name = `kid${i}`;
        streakReq.input(name, sql.UniqueIdentifier, id);
        streakValues.push(`SELECT @${name} AS id`);
      });
      await streakReq.query(
        `UPDATE t
         SET streak_last_date = @date
         FROM quest_tasks t
         INNER JOIN (${streakValues.join(' UNION ALL ')}) src ON src.id = t.id`
      );
    }

    // Damage processed for @date by processDailyDamageCheck (which stamps target_date = the
    // missed-dailies date) needs to be undone: restore the HP, drop the death-zeroing ledger
    // row(s), and undo the neglect increment that stamped neglect_last_date = @date. Matching
    // on target_date instead of ts_created is what makes a "late freeze" work — e.g. user
    // goes dark for days, processes Tue's review on Wed (damage logged Wed with
    // target_date=Tue), then later freezes Tue. ts_created date math would miss that row;
    // target_date does not.
    const damageRes = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('date', sql.Date, dateYMD)
      .query<{ total: number | null; minTs: Date | null; maxTs: Date | null }>(
        `SELECT ISNULL(SUM(damage), 0) AS total,
                MIN(ts_created) AS minTs,
                MAX(ts_created) AS maxTs
         FROM quest_damage_log
         WHERE user_id = @userId
           AND target_date = @date
           AND reason LIKE '%missed dailies%'`
      );
    const totalDamage = Number(damageRes.recordset[0]?.total ?? 0);
    // Death rows live in quest_ledger and don't carry target_date — fall back to matching the
    // ts_created window of the damage rows we're about to reverse. If no damage rows exist for
    // @date there's nothing to pair against, so we skip the death lookup entirely.
    const damageMinTs = damageRes.recordset[0]?.minTs ?? null;
    const damageMaxTs = damageRes.recordset[0]?.maxTs ?? null;

    let restoredHealth = 0;
    if (totalDamage > 0) {
      const healRes = await tx.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('healAmount', sql.Int, totalDamage)
        .query<{ before: number; after: number }>(
          `UPDATE quest_user_state
           SET health = CASE WHEN health + @healAmount > max_health THEN max_health ELSE health + @healAmount END,
               ts_modified = GETDATE()
           OUTPUT deleted.health AS before, inserted.health AS after
           WHERE user_id = @userId`
        );
      const healRow = healRes.recordset[0];
      restoredHealth = healRow ? healRow.after - healRow.before : 0;

      await tx.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('date', sql.Date, dateYMD)
        .query(
          `DELETE FROM quest_damage_log
           WHERE user_id = @userId
             AND target_date = @date
             AND reason LIKE '%missed dailies%'`
        );
    }

    // Death-zeroing only runs when applyDamage drove HP to 0 — i.e. it's paired with at least
    // one damage row in the same applyDamage call. Bracketing the search to the [min, max]
    // ts_created of the damage rows we just reversed targets the exact same applyDamage event
    // and avoids deleting unrelated death rows (e.g. from a habit hit on the same day).
    let deathDel: { recordset: { delta: number }[] } = { recordset: [] };
    if (damageMinTs && damageMaxTs) {
      deathDel = await tx.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('minTs', sql.DateTime, damageMinTs)
        .input('maxTs', sql.DateTime, damageMaxTs)
        .query<{ delta: number }>(
          `DELETE FROM quest_ledger
           OUTPUT deleted.delta
           WHERE user_id = @userId AND ref_type = 'death'
             AND ts_created BETWEEN @minTs AND @maxTs`
        );
    }
    for (const row of deathDel.recordset) reversedCoins -= Number(row.delta);

    await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('date', sql.Date, dateYMD)
      .query(
        `UPDATE quest_tasks
         SET neglect_count = CASE WHEN neglect_count > 0 THEN neglect_count - 1 ELSE 0 END,
             neglect_last_date = CASE WHEN neglect_count > 1 THEN neglect_last_date ELSE NULL END
         WHERE user_id = @userId AND neglect_last_date = @date`
      );

    // Carry-over: stamp deferred_to_date on the chosen tasks so they appear in the next day's
    // list even if today's day-of-week wouldn't normally schedule them. The UNION ALL trick
    // builds the (@id1, @id2, …) set as a one-column derived table so the UPDATE filters on it
    // without needing a SQL injection-prone IN list. user_id + kind = 'daily' filters guard
    // against cross-user IDs or attempts to defer a todo. Returned count is the actual number of
    // tasks updated, not the input list length.
    let deferredTaskCount = 0;
    if (eligibleDeferIds.length > 0) {
      const req = tx.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('deferTarget', sql.Date, deferTarget);
      const valuesSql: string[] = [];
      eligibleDeferIds.forEach((id, i) => {
        const name = `did${i}`;
        req.input(name, sql.UniqueIdentifier, id);
        valuesSql.push(`SELECT @${name} AS id`);
      });
      const updRes = await req.query<{ id: string }>(
        `UPDATE t
         SET deferred_to_date = @deferTarget
         OUTPUT inserted.id
         FROM quest_tasks t
         INNER JOIN (${valuesSql.join(' UNION ALL ')}) src ON src.id = t.id
         WHERE t.user_id = @userId AND t.kind = 'daily'`
      );
      deferredTaskCount = updRes.recordset.length;
    }

    // If we just froze the date the previous-day review modal is currently asking about,
    // stamp the review-ack so the modal doesn't pop again on the next page load. The modal
    // always targets yesterday, so this only fires when dateYMD == effective yesterday.
    const yest = (() => {
      const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    if (dateYMD === yest) {
      await tx.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('today', sql.Date, today)
        .query(
          `UPDATE quest_user_state
           SET last_review_ack_date = @today, ts_modified = GETDATE()
           WHERE user_id = @userId`
        );
    }

    await tx.commit();
    return { alreadyFrozen: false, reversedTaskCount, reversedCoins, restoredHealth, deferredTaskCount };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// Debug-only: removes the freeze marker. Does NOT restore the ledger rows deleted by freezeDay,
// so once you've frozen a date its rewards are gone for good — this just lifts the dedupe gate
// and re-enables future damage on that date.
export async function unfreezeDay(userId: string, dateYMD: string): Promise<{ removed: boolean }> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('date', sql.Date, dateYMD)
    .query(`DELETE FROM quest_frozen_days WHERE user_id = @userId AND frozen_date = @date`);
  return { removed: (res.rowsAffected[0] ?? 0) > 0 };
}
