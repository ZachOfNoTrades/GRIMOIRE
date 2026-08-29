import sql from 'mssql';
import { getQuestConnection } from './db';
import { UserState } from '../types/userState';
import { Difficulty, Frequency } from '../types/task';
import { getDamageFactor, getCurrentDate, getHealthDamage, getNeglectFactor, getNeglectCap, getAdvancedMode, getGambleWeekStartDay } from './settingsFunctions';
import { isOccurrenceOn, occurrenceWindowEndingOn } from './taskFunctions';
import { evaluateFormula } from './formulaEvaluator';
import { isFrozenDay } from './freezeDayFunctions';
import { GAMBLE_DIE_SIDES, gambleCostForRoll, gambleWeekStart } from './gambleConfig';

export async function ensureUserState(userId: string): Promise<UserState> {
  const pool = await getQuestConnection();
  await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(
      `MERGE INTO quest_user_state AS dest
       USING (SELECT @userId AS user_id) AS src ON dest.user_id = src.user_id
       WHEN NOT MATCHED THEN
         INSERT (user_id) VALUES (@userId);`
    );
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<UserState>(
      `SELECT health, max_health,
              CONVERT(VARCHAR(10), last_damage_check_date, 23) AS last_damage_check_date,
              CONVERT(VARCHAR(10), last_review_ack_date, 23) AS last_review_ack_date
       FROM quest_user_state WHERE user_id = @userId`
    );
  return res.recordset[0];
}

export async function getUserState(userId: string): Promise<UserState> {
  return ensureUserState(userId);
}

export async function setUserState(userId: string, health: number, maxHealth: number): Promise<UserState> {
  const pool = await getQuestConnection();
  await ensureUserState(userId);
  const clampedMax = Math.max(1, Math.floor(maxHealth));
  const clampedHealth = Math.max(0, Math.min(clampedMax, Math.floor(health)));
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('health', sql.Int, clampedHealth)
    .input('maxHealth', sql.Int, clampedMax)
    .query<UserState>(
      `UPDATE quest_user_state
       SET health = @health, max_health = @maxHealth, ts_modified = GETDATE()
       OUTPUT INSERTED.health, INSERTED.max_health,
              CONVERT(VARCHAR(10), INSERTED.last_damage_check_date, 23) AS last_damage_check_date,
                CONVERT(VARCHAR(10), INSERTED.last_review_ack_date, 23) AS last_review_ack_date
       WHERE user_id = @userId`
    );
  return res.recordset[0];
}

async function getCurrentBalance(req: sql.Request, userId: string): Promise<number> {
  const res = await req
    .input('balUserId', sql.UniqueIdentifier, userId)
    .query<{ balance: number }>(
      `SELECT ISNULL(SUM(delta), 0) AS balance FROM quest_ledger WHERE user_id = @balUserId`
    );
  return res.recordset[0]?.balance ?? 0;
}

export interface DamageOutcome {
  state: UserState;
  damage_taken: number;
  died: boolean;
  coins_lost: number;
}

// targetDate stamps the row with the calendar date the damage corresponds to (e.g. yesterday's
// missed-dailies date). freezeDay reverses by matching target_date, so passing it correctly is
// what lets a late freeze still find and undo its damage. Pass null for date-agnostic damage
// (habits, manual hits).
export async function applyDamage(userId: string, rawDamage: number, reason: string, targetDate: string | null = null): Promise<DamageOutcome> {
  const pool = await getQuestConnection();
  const factor = await getDamageFactor(userId);
  const damage = Math.max(0, Math.round(rawDamage * factor));
  if (damage === 0) {
    const state = await ensureUserState(userId);
    return { state, damage_taken: 0, died: false, coins_lost: 0 };
  }
  const state = await ensureUserState(userId);
  const tx = pool.transaction();
  await tx.begin();
  try {
    const newHealth = state.health - damage;
    let died = false;
    let coinsLost = 0;
    let finalHealth = newHealth;
    if (newHealth <= 0) {
      died = true;
      finalHealth = state.max_health;
      const balance = await getCurrentBalance(tx.request(), userId);
      coinsLost = balance;
      if (balance > 0) {
        await tx.request()
          .input('userId', sql.UniqueIdentifier, userId)
          .input('delta', sql.Decimal(10, 2), -balance)
          .input('reason', sql.NVarChar(500), `Death — ${reason}`)
          .query(
            `INSERT INTO quest_ledger (user_id, delta, reason, ref_type)
             VALUES (@userId, @delta, @reason, 'death')`
          );
      }
    }
    const updated = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('health', sql.Int, finalHealth)
      .query<UserState>(
        `UPDATE quest_user_state
         SET health = @health, ts_modified = GETDATE()
         OUTPUT INSERTED.health, INSERTED.max_health,
                CONVERT(VARCHAR(10), INSERTED.last_damage_check_date, 23) AS last_damage_check_date,
                CONVERT(VARCHAR(10), INSERTED.last_review_ack_date, 23) AS last_review_ack_date
         WHERE user_id = @userId`
      );
    // Journal the damage event so it can be reversed later (e.g. by clearTodayReview)
    await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('damage', sql.Int, damage)
      .input('healthBefore', sql.Int, state.health)
      .input('healthAfter', sql.Int, finalHealth)
      .input('died', sql.Bit, died ? 1 : 0)
      .input('reason', sql.NVarChar(500), reason)
      .input('targetDate', sql.Date, targetDate)
      .query(
        `INSERT INTO quest_damage_log (user_id, damage, health_before, health_after, died, reason, target_date)
         VALUES (@userId, @damage, @healthBefore, @healthAfter, @died, @reason, @targetDate)`
      );
    await tx.commit();
    return { state: updated.recordset[0], damage_taken: damage, died, coins_lost: coinsLost };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function applyHeal(userId: string, amount: number): Promise<UserState> {
  const pool = await getQuestConnection();
  const state = await ensureUserState(userId);
  const newHealth = Math.min(state.max_health, state.health + Math.max(0, Math.round(amount)));
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('health', sql.Int, newHealth)
    .query<UserState>(
      `UPDATE quest_user_state
       SET health = @health, ts_modified = GETDATE()
       OUTPUT INSERTED.health, INSERTED.max_health,
              CONVERT(VARCHAR(10), INSERTED.last_damage_check_date, 23) AS last_damage_check_date,
                CONVERT(VARCHAR(10), INSERTED.last_review_ack_date, 23) AS last_review_ack_date
       WHERE user_id = @userId`
    );
  return res.recordset[0];
}

export type GambleResult =
  | { ok: true; roll: number; healed: number; spent: number; balance: number; state: UserState; rollsThisWeek: number; nextCost: number }
  | { ok: false; reason: 'insufficient' | 'full_health'; balance: number; state: UserState; cost: number; rollsThisWeek: number };

// How many short rests the user has already rolled in the CURRENT quest WEEK. The counter is
// stamped with the day of the most recent roll (quest_user_state.gamble_rolls_date), so a stamp
// from before this week's start day simply reads as zero — the weekly reset is implicit and needs
// no scheduled job. The week starts on quest_settings.gamble_week_start_day (Monday by default).
// Pass `today` when the caller already resolved it (getCurrentDate hits quest_settings for the
// simulation date).
export async function getGambleRollsThisWeek(userId: string, today?: string): Promise<number> {
  const pool = await getQuestConnection();
  await ensureUserState(userId);
  const day = today ?? await getCurrentDate(userId);
  const weekStart = gambleWeekStart(day, await getGambleWeekStartDay(userId));
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<{ rolls_count: number; rolls_date: string | null }>(
      `SELECT gamble_rolls_count AS rolls_count,
              CONVERT(VARCHAR(10), gamble_rolls_date, 23) AS rolls_date
       FROM quest_user_state WHERE user_id = @userId`
    );
  const row = res.recordset[0];
  return row && row.rolls_date && row.rolls_date >= weekStart ? Number(row.rolls_count) : 0;
}

/** Coins the user's NEXT short rest costs right now (escalates with each roll already made this week). */
export async function getGambleCost(userId: string, today?: string): Promise<number> {
  return gambleCostForRoll(await getGambleRollsThisWeek(userId, today));
}

// "Gamble for health" — a DnD short-rest: pay coins to roll a d20 and recover that many HP (capped
// at the missing amount). It's a gamble — a low roll wastes the coins, a high roll is a big heal.
// The price ESCALATES within a WEEK: the Nth roll costs gambleCostForRoll(N - 1) (2, 4, 6, ...), so
// leaning on short rests gets expensive fast; the counter resets on the user's week-start day
// (quest_settings.gamble_week_start_day, Monday by default). The die is
// rolled HERE (server-side) so the outcome can't be tampered with from the client; the overlay
// animation only lands on the number we return. Coin debit + heal + roll-counter bump happen in one
// transaction with the same UPDLOCK/HOLDLOCK balance read the reward-spend path uses, so concurrent
// rolls can neither race the balance nor buy two rolls at the same price. Writes a ref_type='gamble'
// ledger row; because it does NOT touch quest_damage_log, a later clearTodayReview leaves the heal intact.
export async function gambleForHealth(userId: string): Promise<GambleResult> {
  const pool = await getQuestConnection();
  const state = await ensureUserState(userId);
  const today = await getCurrentDate(userId);
  // First day of the quest week `today` falls in — rolls stamped on or after it still escalate.
  const weekStart = gambleWeekStart(today, await getGambleWeekStartDay(userId));
  // Nothing to recover — don't let the user burn coins on a no-op heal.
  if (state.health >= state.max_health) {
    const balance = await getCurrentBalance(pool.request(), userId);
    const rollsThisWeek = await getGambleRollsThisWeek(userId, today);
    return { ok: false, reason: 'full_health', balance, state, cost: gambleCostForRoll(rollsThisWeek), rollsThisWeek };
  }
  const tx = pool.transaction();
  await tx.begin();
  try {
    const balRow = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query<{ balance: number }>(
        `SELECT ISNULL(SUM(delta), 0) AS balance FROM quest_ledger WITH (UPDLOCK, HOLDLOCK) WHERE user_id = @userId`
      );
    const balance = balRow.recordset[0]?.balance ?? 0;
    // Re-read the week's roll counter under the same lock so two concurrent rolls can't both price
    // themselves off the same count. A stamp from before this week's start means the week's first roll.
    const rollsRow = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query<{ rolls_count: number; rolls_date: string | null }>(
        `SELECT gamble_rolls_count AS rolls_count,
                CONVERT(VARCHAR(10), gamble_rolls_date, 23) AS rolls_date
         FROM quest_user_state WITH (UPDLOCK, HOLDLOCK) WHERE user_id = @userId`
      );
    const priorRow = rollsRow.recordset[0];
    const rollsThisWeek = priorRow && priorRow.rolls_date && priorRow.rolls_date >= weekStart
      ? Number(priorRow.rolls_count)
      : 0;
    const cost = gambleCostForRoll(rollsThisWeek);
    if (balance < cost) {
      await tx.rollback();
      return { ok: false, reason: 'insufficient', balance, state, cost, rollsThisWeek };
    }
    // Roll 1..GAMBLE_DIE_SIDES and heal up to the missing HP (overage beyond max is the gamble's risk).
    const roll = 1 + Math.floor(Math.random() * GAMBLE_DIE_SIDES);
    const healed = Math.min(roll, state.max_health - state.health);
    const newHealth = state.health + healed;
    // Debit the coins.
    await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('delta', sql.Decimal(10, 2), -cost)
      .input('reason', sql.NVarChar(500), `Short rest #${rollsThisWeek + 1} this week — rolled ${roll}, healed ${healed} HP`)
      .query(
        `INSERT INTO quest_ledger (user_id, delta, reason, ref_type, ref_id)
         VALUES (@userId, @delta, @reason, 'gamble', NULL)`
      );
    // Apply the heal and stamp the week's roll counter against today (which prices the next roll).
    const updated = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('health', sql.Int, newHealth)
      .input('rollsThisWeek', sql.Int, rollsThisWeek + 1)
      .input('today', sql.Date, today)
      .query<UserState>(
        `UPDATE quest_user_state
         SET health = @health, gamble_rolls_count = @rollsThisWeek, gamble_rolls_date = @today, ts_modified = GETDATE()
         OUTPUT INSERTED.health, INSERTED.max_health,
                CONVERT(VARCHAR(10), INSERTED.last_damage_check_date, 23) AS last_damage_check_date,
                CONVERT(VARCHAR(10), INSERTED.last_review_ack_date, 23) AS last_review_ack_date
         WHERE user_id = @userId`
      );
    await tx.commit();
    return {
      ok: true,
      roll,
      healed,
      spent: cost,
      balance: balance - cost,
      state: updated.recordset[0],
      rollsThisWeek: rollsThisWeek + 1,
      nextCost: gambleCostForRoll(rollsThisWeek + 1),
    };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function processDailyDamageCheck(userId: string): Promise<DamageOutcome | null> {
  const pool = await getQuestConnection();
  const state = await ensureUserState(userId);
  const todayStr = await getCurrentDate(userId);
  if (state.last_damage_check_date === todayStr) {
    return null;
  }
  if (!state.last_damage_check_date) {
    await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('today', sql.Date, todayStr)
      .query(`UPDATE quest_user_state SET last_damage_check_date = @today WHERE user_id = @userId`);
    return null;
  }
  // Pull each daily candidate (created on/before yesterday, not completed yesterday) along with
  // its schedule fields. We then filter in JS to only count tasks actually scheduled for
  // yesterday — a weekly task is only "missed" on its weekday, not every day.
  const yestStr = (() => {
    const d = new Date(`${todayStr}T00:00:00`); d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  // Frozen-day short-circuit: the user opted out of damage for yesterday (e.g. out of town).
  // Advance last_damage_check_date so the modal flow continues normally and we don't re-evaluate
  // yesterday tomorrow, but skip the damage / neglect work entirely.
  if (await isFrozenDay(userId, yestStr)) {
    await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('today', sql.Date, todayStr)
      .query(`UPDATE quest_user_state SET last_damage_check_date = @today WHERE user_id = @userId`);
    return null;
  }
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('today', sql.Date, todayStr)
    .query<{
      id: string; difficulty: Difficulty; neglect_count: number;
      frequency: Frequency; days_of_week: string | null; every_n: number; start_date: string | null;
      window_days: number;
      last_completed_date: string | null; deferred_to_date: string | null;
    }>(
      `DECLARE @yest DATE = DATEADD(day, -1, @today);
       SELECT id, difficulty, neglect_count,
              frequency, days_of_week, every_n,
              CONVERT(VARCHAR(10), start_date, 23) AS start_date,
              window_days,
              CONVERT(VARCHAR(10), last_completed_date, 23) AS last_completed_date,
              CONVERT(VARCHAR(10), deferred_to_date, 23) AS deferred_to_date
       FROM quest_tasks
       WHERE user_id = @userId
         AND kind = 'daily'
         AND CAST(ts_created AS DATE) <= @yest
         AND (last_completed_date IS NULL OR last_completed_date <> @yest)`
    );
  const missedTasks = res.recordset.filter(t => {
    const occ = {
      frequency: t.frequency,
      days_of_week: t.days_of_week,
      every_n: t.every_n,
      start_date: t.start_date,
      window_days: t.window_days,
      deferred_to_date: t.deferred_to_date,
    };
    // An occurrence is "missed" only once its grace window has fully elapsed unsatisfied — i.e.
    // yesterday is the final day of some occurrence's window and nothing was completed on/after
    // that occurrence's start. This fires neglect exactly once per occurrence (window_days=1 ⇒
    // once on the scheduled day).
    const occStart = t.deferred_to_date === yestStr
      ? yestStr // a freeze carry-over occupies exactly its deferred day
      : occurrenceWindowEndingOn(occ, yestStr);
    if (occStart === null) return false;
    return !(t.last_completed_date != null && t.last_completed_date >= occStart);
  });
  let outcome: DamageOutcome | null = null;
  if (missedTasks.length > 0) {
    // applyDamage applies damage_factor itself, so we pass raw per-task damage here.
    const [healthDamage, neglectFactor, neglectCap, advanced, balance] = await Promise.all([
      getHealthDamage(userId),
      getNeglectFactor(userId),
      getNeglectCap(userId),
      getAdvancedMode(userId),
      getCurrentBalance(pool.request(), userId),
    ]);
    let rawDamage = 0;
    for (const t of missedTasks) {
      const base = healthDamage[t.difficulty] ?? 0;
      // neglect_count + 1 because this miss is what triggers the damage; the counter for this task
      // will be incremented to that value below.
      const neglect = t.neglect_count + 1;
      if (advanced.enabled && advanced.damageFormula) {
        const v = evaluateFormula(advanced.damageFormula, { base, streak: 0, neglect, age: 0, coins: balance });
        rawDamage += v ?? base;
      } else {
        const cappedNeglect = Math.min(t.neglect_count, neglectCap);
        const bonus = base * cappedNeglect * neglectFactor;
        rawDamage += base + bonus;
      }
    }
    if (rawDamage > 0) {
      outcome = await applyDamage(userId, rawDamage, `${missedTasks.length} missed dailies`, yestStr);
    }
    // Increment neglect counters only for the tasks that were scheduled-and-missed yesterday.
    const req = pool.request().input('yest', sql.Date, yestStr);
    const params: string[] = [];
    missedTasks.forEach((t, i) => {
      const name = `id${i}`;
      req.input(name, sql.UniqueIdentifier, t.id);
      params.push(`@${name}`);
    });
    await req.query(`UPDATE quest_tasks
                     SET neglect_count = neglect_count + 1,
                         neglect_last_date = @yest
                     WHERE id IN (${params.join(',')})`);
  }
  await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('today', sql.Date, todayStr)
    .query(`UPDATE quest_user_state SET last_damage_check_date = @today WHERE user_id = @userId`);
  return outcome;
}

// Called when the user dismisses the previous-day review modal. We record the ack date so we
// don't re-prompt until the next day-rollover, then run the regular damage check — which counts
// "missed yesterday" AFTER any backdated completions the user just recorded in the modal.
export async function acknowledgeReview(userId: string): Promise<DamageOutcome | null> {
  const pool = await getQuestConnection();
  await ensureUserState(userId);
  const todayStr = await getCurrentDate(userId);
  await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('today', sql.Date, todayStr)
    .query(`UPDATE quest_user_state SET last_review_ack_date = @today WHERE user_id = @userId`);
  return processDailyDamageCheck(userId);
}

// DEBUG: Reverses the side-effects of acknowledging today's previous-day review so the modal
// pops again on next load. Deletes today's task-ledger rows for any daily whose
// last_completed_date < today (i.e. backdated by the review), resets those tasks'
// completion/streak fields, deletes any death-row from today (restoring coins lost on death),
// restores HP using today's damage log, and clears last_review_ack_date / last_damage_check_date.
export async function clearTodayReview(userId: string): Promise<{ reversedTaskCount: number; reversedCoins: number; restoredHealth: number; unfrozenDate: string | null }> {
  const pool = await getQuestConnection();
  const today = await getCurrentDate(userId);
  const tx = pool.transaction();
  await tx.begin();
  try {
    const tasksRes = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('today', sql.Date, today)
      .query<{ id: string }>(
        `SELECT t.id
         FROM quest_tasks t
         WHERE t.user_id = @userId AND t.kind = 'daily'
           AND t.last_completed_date IS NOT NULL
           AND t.last_completed_date < @today
           AND EXISTS (
             SELECT 1 FROM quest_ledger l
             WHERE l.user_id = @userId AND l.ref_id = t.id AND l.ref_type = 'task'
               AND CAST(l.ts_created AS DATE) = @today
           )`
      );
    const affectedTaskIds = tasksRes.recordset.map(r => r.id);

    // Sum the coin deltas we're about to reverse so the user sees the actual coin impact,
    // not just the number of ledger rows touched.
    let reversedCoins = 0;
    for (const taskId of affectedTaskIds) {
      const delRes = await tx.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('refId', sql.UniqueIdentifier, taskId)
        .input('today', sql.Date, today)
        .query<{ delta: number }>(
          `DELETE FROM quest_ledger
           OUTPUT deleted.delta
           WHERE user_id = @userId AND ref_id = @refId AND ref_type = 'task'
             AND CAST(ts_created AS DATE) = @today`
        );
      for (const row of delRes.recordset) reversedCoins -= row.delta;

      await tx.request()
        .input('id', sql.UniqueIdentifier, taskId)
        .query(
          `UPDATE quest_tasks
           SET last_completed_date = NULL,
               ts_completed = NULL,
               streak_count = CASE WHEN streak_count > 0 THEN streak_count - 1 ELSE 0 END,
               streak_last_date = NULL,
               last_bonus_date = NULL
           WHERE id = @id`
        );

      // Drop the dated completion-log rows the review created today (for any credited date) so the
      // calendar and the re-popped modal agree the completions were undone.
      await tx.request()
        .input('taskId', sql.UniqueIdentifier, taskId)
        .input('today', sql.Date, today)
        .query(
          `DELETE FROM quest_task_completions
           WHERE task_id = @taskId AND CAST(ts_created AS DATE) = @today`
        );

      // Also reset any subtasks the review marked complete (done=1 with ts_completed today)
      // so the review modal re-shows them as unchecked.
      await tx.request()
        .input('taskId', sql.UniqueIdentifier, taskId)
        .input('today', sql.Date, today)
        .query(
          `UPDATE quest_subtasks
           SET done = 0, ts_completed = NULL, last_bonus_date = NULL
           WHERE task_id = @taskId
             AND done = 1
             AND CAST(ts_completed AS DATE) = @today`
        );
    }

    // Undo neglect increments that today's damage check applied. The increment stamped
    // neglect_last_date with yesterday's date; decrement those by 1 and roll the date back
    // by one occurrence (best-effort — set NULL when count drops to 0).
    await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('today', sql.Date, today)
      .query(
        `DECLARE @yest DATE = DATEADD(day, -1, @today);
         UPDATE quest_tasks
         SET neglect_count = CASE WHEN neglect_count > 0 THEN neglect_count - 1 ELSE 0 END,
             neglect_last_date = CASE WHEN neglect_count > 1 THEN neglect_last_date ELSE NULL END
         WHERE user_id = @userId
           AND neglect_last_date = @yest`
      );

    // Reverse any death-zeroing from today's damage check
    const deathDel = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('today', sql.Date, today)
      .query<{ delta: number }>(
        `DELETE FROM quest_ledger
         OUTPUT deleted.delta
         WHERE user_id = @userId AND ref_type = 'death'
           AND CAST(ts_created AS DATE) = @today`
      );
    for (const row of deathDel.recordset) reversedCoins -= row.delta;

    // Restore HP using today's damage journal. For each event we add `damage` back, capped at
    // max_health. Then delete today's damage rows so they can't be reversed again.
    const dmgRes = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('today', sql.Date, today)
      .query<{ total: number | null }>(
        `SELECT ISNULL(SUM(damage), 0) AS total
         FROM quest_damage_log
         WHERE user_id = @userId AND CAST(ts_created AS DATE) = @today`
      );
    const totalDamage = dmgRes.recordset[0]?.total ?? 0;

    // last_damage_check_date is set to yesterday (not NULL) so the next acknowledgeReview
    // re-runs processDailyDamageCheck normally. NULL would be interpreted as "first-time user"
    // and would silently skip the damage check.
    const healRes = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('today', sql.Date, today)
      .input('healAmount', sql.Int, totalDamage)
      .query<{ before: number; after: number }>(
        `UPDATE quest_user_state
         SET health = CASE
                        WHEN health + @healAmount > max_health THEN max_health
                        ELSE health + @healAmount
                      END,
             last_review_ack_date = NULL,
             last_damage_check_date = DATEADD(day, -1, @today),
             ts_modified = GETDATE()
         OUTPUT deleted.health AS before, inserted.health AS after
         WHERE user_id = @userId`
      );
    const healRow = healRes.recordset[0];
    const restoredHealth = healRow ? healRow.after - healRow.before : 0;

    await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('today', sql.Date, today)
      .query(
        `DELETE FROM quest_damage_log
         WHERE user_id = @userId AND CAST(ts_created AS DATE) = @today`
      );

    // If yesterday was frozen as part of resolving today's review (e.g. user clicked "Freeze
    // yesterday" on the modal), undo the freeze marker so the modal can pop again and the
    // damage check evaluates yesterday normally. The forfeited ledger rows from freezeDay are
    // gone for good — we only lift the dedupe gate, matching unfreezeDay's contract.
    const unfreezeRes = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('today', sql.Date, today)
      .query<{ frozen_date: string }>(
        `DELETE FROM quest_frozen_days
         OUTPUT CONVERT(VARCHAR(10), deleted.frozen_date, 23) AS frozen_date
         WHERE user_id = @userId AND frozen_date = DATEADD(day, -1, @today)`
      );
    const unfrozenDate = unfreezeRes.recordset[0]?.frozen_date ?? null;

    // If the unfreeze pulled the trigger on yesterday, any "carry to today" deferrals it set
    // should also clear — they were piggybacked on the freeze and lose meaning once it's gone.
    // Scoping by deferred_to_date = today means we only touch carry-overs the freeze created;
    // a future feature that defers to a different date wouldn't be affected.
    if (unfrozenDate) {
      await tx.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('today', sql.Date, today)
        .query(
          `UPDATE quest_tasks
           SET deferred_to_date = NULL
           WHERE user_id = @userId AND kind = 'daily' AND deferred_to_date = @today`
        );
    }

    await tx.commit();
    return { reversedTaskCount: affectedTaskIds.length, reversedCoins, restoredHealth, unfrozenDate };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export interface ReviewCompletionCache {
  date: string;
  taskIds: string[];
  subtasks: { taskId: string; subtaskId: string }[];
}

// Reads the last review submission's selections. The cache exists so a clearTodayReview can
// re-pop the modal with the SAME checkboxes filled in — the user's prior intent is preserved
// even though the underlying completions get wiped. Returns null when there is no cache yet
// or the stored payload fails to parse.
export async function getReviewCompletionCache(userId: string): Promise<ReviewCompletionCache | null> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<{ d: string | null; data: string | null }>(
      `SELECT CONVERT(VARCHAR(10), last_review_completion_date, 23) AS d,
              last_review_completion_data AS data
       FROM quest_user_state WHERE user_id = @userId`
    );
  const row = res.recordset[0];
  if (!row || !row.d || !row.data) return null;
  try {
    const parsed = JSON.parse(row.data) as { tasks?: unknown; subtasks?: unknown };
    const taskIds = Array.isArray(parsed.tasks)
      ? parsed.tasks.filter((v: unknown): v is string => typeof v === 'string')
      : [];
    const subtasks = Array.isArray(parsed.subtasks)
      ? parsed.subtasks.filter(
          (v: unknown): v is { taskId: string; subtaskId: string } =>
            !!v
            && typeof (v as { taskId: unknown }).taskId === 'string'
            && typeof (v as { subtaskId: unknown }).subtaskId === 'string'
        )
      : [];
    return { date: row.d, taskIds, subtasks };
  } catch {
    return null;
  }
}

export async function setReviewCompletionCache(
  userId: string,
  date: string,
  taskIds: string[],
  subtasks: { taskId: string; subtaskId: string }[],
): Promise<void> {
  const pool = await getQuestConnection();
  const data = JSON.stringify({ tasks: taskIds, subtasks });
  await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('date', sql.Date, date)
    .input('data', sql.NVarChar(sql.MAX), data)
    .query(
      `UPDATE quest_user_state
       SET last_review_completion_date = @date,
           last_review_completion_data = @data,
           ts_modified = GETDATE()
       WHERE user_id = @userId`
    );
}

export async function adjustBalanceTo(userId: string, targetBalance: number): Promise<{ delta: number }> {
  const pool = await getQuestConnection();
  const current = await getCurrentBalance(pool.request(), userId);
  const target = Math.max(0, Math.round(targetBalance * 100) / 100);
  const delta = target - current;
  if (delta === 0) return { delta: 0 };
  await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('delta', sql.Decimal(10, 2), delta)
    .input('reason', sql.NVarChar(500), 'Manual balance adjustment')
    .query(
      `INSERT INTO quest_ledger (user_id, delta, reason, ref_type)
       VALUES (@userId, @delta, @reason, 'adjust')`
    );
  return { delta };
}
