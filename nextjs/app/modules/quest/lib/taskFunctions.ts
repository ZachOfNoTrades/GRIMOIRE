import sql from 'mssql';
import { getQuestConnection } from './db';
import { Task, Subtask, Difficulty, TaskKind, Frequency, RepeatMode, REPEAT_MODES } from '../types/task';
import {
  getFactors,
  getCurrentDate,
  getStreakFactor,
  getStreakCap,
  getAdvancedMode,
  getCurrentBalance,
  getTodoBonusConfig,
  getForcedTodoBonusId,
  getRetroConfig,
  getAllDailiesBonusConfig,
  markAllDailiesBonusAwarded,
  AdvancedMode,
} from './settingsFunctions';
import { QuestFactors } from '../types/settings';
import { evaluateFormula } from './formulaEvaluator';
import { pickTodayBonus, BonusPick, BonusCandidate } from './todoBonusFunctions';
import { listRemindersForTasks, listRemindersForTask, normalizeReminders, replaceReminders } from './reminderFunctions';
import { isFrozenDay } from './freezeDayFunctions';

const TASK_SELECT_COLUMNS = `id, user_id, title, description, difficulty, status, kind,
  CONVERT(VARCHAR(10), last_completed_date, 23) AS last_completed_date,
  CASE WHEN last_completed_date = @today THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS done_today,
  frequency, days_of_week, every_n,
  CONVERT(VARCHAR(10), start_date, 23) AS start_date,
  repeat_mode,
  window_days,
  CAST(manual_reward_override AS FLOAT) AS manual_reward_override,
  CONVERT(VARCHAR(10), deferred_to_date, 23) AS deferred_to_date,
  sort_order,
  streak_count,
  CONVERT(VARCHAR(10), streak_last_date, 23) AS streak_last_date,
  CONVERT(VARCHAR(10), last_bonus_date, 23) AS last_bonus_date,
  neglect_count,
  CONVERT(VARCHAR(10), neglect_last_date, 23) AS neglect_last_date,
  ts_created, CONVERT(VARCHAR(10), ts_completed, 23) AS ts_completed`;

function taskOutputClause(doneTodayLiteral: '0' | '1' | 'computed' = 'computed'): string {
  const doneToday = doneTodayLiteral === 'computed'
    ? `CASE WHEN INSERTED.last_completed_date = @today THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS done_today`
    : `CAST(${doneTodayLiteral} AS BIT) AS done_today`;
  return `INSERTED.id, INSERTED.user_id, INSERTED.title, INSERTED.description, INSERTED.difficulty,
          INSERTED.status, INSERTED.kind,
          CONVERT(VARCHAR(10), INSERTED.last_completed_date, 23) AS last_completed_date,
          ${doneToday},
          INSERTED.frequency, INSERTED.days_of_week, INSERTED.every_n,
          CONVERT(VARCHAR(10), INSERTED.start_date, 23) AS start_date,
          INSERTED.repeat_mode,
          INSERTED.window_days,
          CAST(INSERTED.manual_reward_override AS FLOAT) AS manual_reward_override,
          CONVERT(VARCHAR(10), INSERTED.deferred_to_date, 23) AS deferred_to_date,
          INSERTED.sort_order,
          INSERTED.streak_count,
          CONVERT(VARCHAR(10), INSERTED.streak_last_date, 23) AS streak_last_date,
          CONVERT(VARCHAR(10), INSERTED.last_bonus_date, 23) AS last_bonus_date,
          INSERTED.neglect_count,
          CONVERT(VARCHAR(10), INSERTED.neglect_last_date, 23) AS neglect_last_date,
          INSERTED.ts_created, CONVERT(VARCHAR(10), INSERTED.ts_completed, 23) AS ts_completed`;
}

// LIVE REWARD COMPUTATION — never stored. The factor map IS the absolute reward per difficulty.
export function computeReward(difficulty: Difficulty, factors: QuestFactors): number {
  return Math.max(0, factors[difficulty] ?? 0);
}

export function computeStreakBonus(base: number, streak: number, streakFactor: number, streakCap: number): number {
  if (streak <= 0 || streakFactor <= 0) return 0;
  const effective = Math.min(streak, streakCap);
  return Math.max(0, base * effective * streakFactor);
}

// Advanced-mode total DAILY reward: daily formula returns base + streak bonus combined.
// Falls back to `base` if the formula is empty or fails to evaluate so a broken formula never
// zeroes rewards.
export function computeDailyRewardAdvancedTotal(base: number, streak: number, coins: number, formula: string | null): number {
  if (!formula) return base;
  const v = evaluateFormula(formula, { base, streak, neglect: 0, age: 0, coins });
  return v ?? base;
}

// Advanced-mode total TODO reward: todo formula returns base + age bonus combined. Age is in days.
export function computeTodoRewardAdvancedTotal(base: number, age: number, coins: number, formula: string | null): number {
  if (!formula) return base;
  const v = evaluateFormula(formula, { base, streak: 0, neglect: 0, age, coins });
  return v ?? base;
}

// Advanced-mode streak bonus is the delta between the daily formula at the current streak and
// the daily formula at streak=0 — i.e. how much of the total reward is attributable to
// consecutive completions.
export function computeStreakBonusAdvanced(
  base: number,
  streak: number,
  coins: number,
  formula: string | null,
  fallbackFactor: number,
  fallbackCap: number,
): number {
  if (!formula) return computeStreakBonus(base, streak, fallbackFactor, fallbackCap);
  const atZero = evaluateFormula(formula, { base, streak: 0, neglect: 0, age: 0, coins });
  const atCurrent = evaluateFormula(formula, { base, streak, neglect: 0, age: 0, coins });
  if (atZero === null || atCurrent === null) {
    return computeStreakBonus(base, streak, fallbackFactor, fallbackCap);
  }
  return Math.max(0, atCurrent - atZero);
}

// Whole days between a task's creation timestamp and the user's effective "today" YYYY-MM-DD.
// Negative-clamped so a forward-simulation date relative to ts_created (or clock skew) can't
// feed a negative age into the formula.
export function computeTaskAge(tsCreated: Date | string, today: string): number {
  const todayMs = new Date(`${today}T00:00:00`).getTime();
  const createdMs = (tsCreated instanceof Date ? tsCreated : new Date(tsCreated)).getTime();
  if (!Number.isFinite(todayMs) || !Number.isFinite(createdMs)) return 0;
  return Math.max(0, Math.floor((todayMs - createdMs) / 86400000));
}

const WEEKDAY_KEYS_BY_INDEX = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYMD(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

interface OccurrenceShape {
  frequency: Frequency;
  days_of_week: string | null;
  every_n: number;
  start_date: string | null;
  // Monthly / yearly calendar anchor. Optional + null-tolerant so every legacy caller passing a
  // plain shape keeps the historical 'day_of_month' behaviour.
  repeat_mode?: RepeatMode | null;
  // Completion grace window: each scheduled occurrence stays completable for window_days days
  // (1 = the scheduled day only). Optional so legacy callers passing a plain shape still type-check.
  window_days?: number | null;
  // Optional so callers that don't know about the carry-over override (legacy paths,
  // expectedPreviousOccurrence walking historical dates) can still pass a plain occurrence shape.
  deferred_to_date?: string | null;
}

// ── Completion grace window (any frequency) ──────────────────────────────────────────────────
// Each scheduled occurrence (per the base cadence in isOccurrence) stays completable for
// window_days days starting on the occurrence date; one completion anywhere in that span
// satisfies the occurrence. window_days = 1 reproduces the legacy "must complete on the day"
// behavior. These helpers are PURE (no db) so the client (home/page.tsx) mirrors them — keep the
// two copies in sync.

function windowDaysOf(task: OccurrenceShape): number {
  const n = task.window_days ?? 1;
  return n >= 1 ? n : 1;
}

// The base-cadence occurrence date whose grace window covers dateYMD, or null if dateYMD falls in
// no window. Walks back up to window_days-1 days to find the occurrence that opened the window.
export function activeOccurrenceStart(task: OccurrenceShape, dateYMD: string): string | null {
  const n = windowDaysOf(task);
  const base = parseYMD(dateYMD);
  for (let i = 0; i < n; i++) {
    const cand = new Date(base);
    cand.setDate(cand.getDate() - i);
    if (isOccurrence(task, cand)) return formatYMD(cand);
  }
  return null;
}

// The occurrence date whose grace window ENDS exactly on dateYMD (start = dateYMD-(window_days-1)),
// or null if no occurrence opens there. Used by neglect: a window is only "missed" once its final
// day passes unsatisfied, so neglect fires once per occurrence.
export function occurrenceWindowEndingOn(task: OccurrenceShape, dateYMD: string): string | null {
  const start = parseYMD(dateYMD);
  start.setDate(start.getDate() - (windowDaysOf(task) - 1));
  return isOccurrence(task, start) ? formatYMD(start) : null;
}

// True when a completion satisfies the grace window active on dateYMD — i.e. the completion landed
// on or after that window's occurrence date. Drives done_today for grace-window tasks.
export function isWindowSatisfied(task: OccurrenceShape, lastCompleted: string | null, dateYMD: string): boolean {
  if (!lastCompleted) return false;
  const start = activeOccurrenceStart(task, dateYMD);
  return start !== null && lastCompleted >= start;
}

export function isOccurrenceOn(task: OccurrenceShape, dateYMD: string): boolean {
  // One-shot override checked before the walk because string equality is cheaper and the carry-
  // over is what makes a freeze-deferred task appear on a normally off-schedule day.
  if (task.deferred_to_date && task.deferred_to_date === dateYMD) return true;
  // "Active" = dateYMD lies within some occurrence's grace window (window_days=1 ⇒ exactly the
  // base-cadence occurrence days).
  return activeOccurrenceStart(task, dateYMD) !== null;
}

// Coerce a caller-supplied repeat_mode into something storable: NULL unless the frequency actually
// has a calendar anchor AND the value is a known mode. NULL reads as 'day_of_month'.
function normalizeRepeatMode(frequency: Frequency, mode: string | null | undefined): RepeatMode | null {
  if (frequency !== 'monthly' && frequency !== 'yearly') return null;
  return REPEAT_MODES.includes(mode as RepeatMode) ? (mode as RepeatMode) : null;
}

// Which <weekday> of its month a date is: the 1st..5th Monday, etc.
function weekdayOrdinal(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

// Does `date` sit on the same monthly anchor as `start`? 'day_of_month' compares the day number;
// 'nth_weekday' compares (weekday, ordinal-within-month) — so a "1st Monday" task lands on the 1st
// Monday of each month, and a month with no 5th <weekday> simply has no occurrence.
function matchesMonthAnchor(task: OccurrenceShape, start: Date, date: Date): boolean {
  if (task.repeat_mode === 'nth_weekday') {
    return date.getDay() === start.getDay() && weekdayOrdinal(date) === weekdayOrdinal(start);
  }
  return date.getDate() === start.getDate();
}

function isOccurrence(task: OccurrenceShape, date: Date): boolean {
  if (task.frequency === 'daily') {
    if (task.days_of_week) {
      const wd = WEEKDAY_KEYS_BY_INDEX[date.getDay()];
      const allowed = task.days_of_week.split(',').map((s) => s.trim()).filter(Boolean);
      if (!allowed.includes(wd)) return false;
    }
    if ((task.every_n ?? 1) > 1 && task.start_date) {
      const start = parseYMD(task.start_date);
      const days = Math.round((date.getTime() - start.getTime()) / 86400000);
      return days >= 0 && days % task.every_n === 0;
    }
    return task.start_date ? date >= parseYMD(task.start_date) : true;
  }
  if (task.frequency === 'weekly') {
    if (!task.start_date) return false;
    const start = parseYMD(task.start_date);
    const days = Math.round((date.getTime() - start.getTime()) / 86400000);
    return days >= 0 && days % (7 * (task.every_n || 1)) === 0;
  }
  if (task.frequency === 'monthly') {
    if (!task.start_date) return false;
    const start = parseYMD(task.start_date);
    if (!matchesMonthAnchor(task, start, date)) return false;
    const monthsDiff = (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth());
    return monthsDiff >= 0 && monthsDiff % (task.every_n || 1) === 0;
  }
  if (task.frequency === 'yearly') {
    if (!task.start_date) return false;
    const start = parseYMD(task.start_date);
    // Yearly is monthly's anchor pinned to one month: same month, then the same day-of-month or
    // the same weekday ordinal within it.
    if (date.getMonth() !== start.getMonth()) return false;
    if (!matchesMonthAnchor(task, start, date)) return false;
    const yearsDiff = date.getFullYear() - start.getFullYear();
    return yearsDiff >= 0 && yearsDiff % (task.every_n || 1) === 0;
  }
  return true;
}

// Previous base-cadence occurrence STRICTLY before `today` (bounded walk). With a grace window,
// callers pass an occurrence date as `today` to step occurrence-by-occurrence.
export function expectedPreviousOccurrence(task: OccurrenceShape, today: string): string | null {
  const todayD = parseYMD(today);
  for (let i = 1; i <= 400; i++) {
    const d = new Date(todayD);
    d.setDate(d.getDate() - i);
    if (isOccurrence(task, d)) return formatYMD(d);
  }
  return null;
}

// Most recent base-cadence occurrence on or before `dateYMD` (bounded walk), or null.
function mostRecentOccurrenceOnOrBefore(task: OccurrenceShape, dateYMD: string): string | null {
  const d0 = parseYMD(dateYMD);
  for (let i = 0; i <= 400; i++) {
    const d = new Date(d0);
    d.setDate(d.getDate() - i);
    if (isOccurrence(task, d)) return formatYMD(d);
  }
  return null;
}

function effectiveStreak(task: { streak_count: number; streak_last_date: string | null; kind: TaskKind } & OccurrenceShape, today: string): number {
  if (task.kind !== 'daily') return 0;
  if (!task.streak_count || !task.streak_last_date) return 0;
  // Streaks count one occurrence per scheduled occurrence (window_days=1 ⇒ one per day). Compare
  // the last completion against occurrence DATES, treating a completion anywhere in an occurrence's
  // grace window as satisfying that occurrence.
  const n = windowDaysOf(task);
  const dCur = mostRecentOccurrenceOnOrBefore(task, today);
  if (dCur === null) return task.streak_count; // before the first occurrence — nothing due yet
  // Completed within the current/most-recent occurrence's window → streak includes it.
  if (task.streak_last_date >= dCur) return task.streak_count;
  // Current occurrence not yet satisfied. If its window already fully elapsed, it was missed.
  const windowEnd = parseYMD(dCur);
  windowEnd.setDate(windowEnd.getDate() + n - 1);
  if (parseYMD(today) > windowEnd) return 0;
  // Window still open: streak survives iff the PREVIOUS occurrence was satisfied.
  const dPrev = expectedPreviousOccurrence(task, dCur);
  if (dPrev === null) return task.streak_count;
  if (task.streak_last_date < dPrev) return 0;
  return task.streak_count;
}

interface StreakConfig {
  factor: number;
  cap: number;
}

interface RewardContext {
  factors: QuestFactors;
  streak: StreakConfig;
  advanced: AdvancedMode;
  coins: number;
  today: string;
  bonus: BonusPick;
}

function attachReward(task: Task, ctx: RewardContext): Task {
  // Manual reward override (when set) REPLACES the difficulty-derived base reward; every downstream
  // term (streak bonus, advanced formulas, aged-todo bonus) builds on this overridden base, so the
  // override behaves exactly like a custom per-difficulty factor for this one task.
  const baseStatic = task.manual_reward_override != null
    ? Math.max(0, Number(task.manual_reward_override))
    : computeReward(task.difficulty, ctx.factors);
  // A grace-window occurrence is "done" when completed anywhere in its window, not just on
  // ctx.today — override the SQL-seeded done_today (last_completed_date = @today) accordingly so
  // every read/write path sees the correct value through this single function. The
  // last_completed === today term preserves the legacy "completed today" case (incl. off-schedule
  // completions); window_days=1 makes the two terms equivalent.
  if (task.kind === 'daily') {
    task.done_today = task.last_completed_date === ctx.today
      || isWindowSatisfied(task, task.last_completed_date, ctx.today);
  }
  const eff = effectiveStreak(task, ctx.today);
  task.streak_count = eff;
  if (ctx.advanced.enabled) {
    if (task.kind === 'daily') {
      // Daily formula returns base + streak bonus. Split into base/bonus so the UI can render the
      // streak-bonus column separately.
      const totalReward = computeDailyRewardAdvancedTotal(baseStatic, eff, ctx.coins, ctx.advanced.dailyRewardFormula);
      const rewardAtZero = computeDailyRewardAdvancedTotal(baseStatic, 0, ctx.coins, ctx.advanced.dailyRewardFormula);
      task.reward_value = rewardAtZero;
      task.streak_bonus = Math.max(0, totalReward - rewardAtZero);
    } else {
      // Todo formula returns base + age bonus. There is no streak concept for todos — the entire
      // formula output becomes reward_value, and streak_bonus stays 0.
      const age = computeTaskAge(task.ts_created, ctx.today);
      const totalReward = computeTodoRewardAdvancedTotal(baseStatic, age, ctx.coins, ctx.advanced.todoRewardFormula);
      task.reward_value = totalReward;
      task.streak_bonus = 0;
    }
  } else {
    task.reward_value = baseStatic;
    task.streak_bonus = task.kind === 'daily'
      ? computeStreakBonus(baseStatic, eff, ctx.streak.factor, ctx.streak.cap)
      : 0;
  }
  // Random aged-todo bonus — only applies to todos that match today's deterministic pick.
  if (task.kind === 'todo' && ctx.bonus.taskId && ctx.bonus.taskId === task.id && ctx.bonus.multiplier > 0) {
    task.reward_value = task.reward_value * ctx.bonus.multiplier;
    task.todo_bonus_today = true;
    task.todo_bonus_multiplier = ctx.bonus.multiplier;
  }
  return task;
}

function attachSubtasks(task: Task, subtasks: Subtask[]): Task {
  task.subtasks = subtasks;
  task.subtask_total = subtasks.length;
  task.subtask_done = subtasks.filter((s) => s.done).length;
  if (!task.reminders) task.reminders = [];
  return task;
}

// Loads everything needed to evaluate rewards for a given user: per-difficulty factors, streak
// config, advanced-mode flag/formulas, current coin balance (only used when advanced mode is on
// — formulas can reference `coins`), and the effective "today". Centralising this keeps the
// fetch list in one place; every completion / list / create path uses the same context.
async function loadRewardCtx(userId: string): Promise<RewardContext> {
  const [factors, streakFactor, streakCap, today, advanced, coins] = await Promise.all([
    getFactors(userId),
    getStreakFactor(userId),
    getStreakCap(userId),
    getCurrentDate(userId),
    getAdvancedMode(userId),
    getCurrentBalance(userId),
  ]);
  const bonus = await resolveTodayBonus(userId, today);
  return {
    factors,
    streak: { factor: streakFactor, cap: streakCap },
    advanced,
    coins,
    today,
    bonus,
  };
}

// Which todo (if any) carries today's random aged-todo bonus, and at what multiplier. Exported so
// read-only surfaces that only need the pick — the dashboard badge — don't have to run the full
// listTasks pass, while still going through the exact same roll the reward math uses.
export async function resolveTodayBonus(userId: string, today: string): Promise<BonusPick> {
  const [bonusConfig, todoCandidates, forcedBonusId] = await Promise.all([
    getTodoBonusConfig(userId),
    listTodoBonusCandidates(userId),
    getForcedTodoBonusId(userId),
  ]);
  // Debug override: a non-null forced_todo_bonus_id makes that todo the bonus regardless of the
  // daily roll, as long as the bonus mechanic itself is enabled. Set/cleared via the debug page.
  if (forcedBonusId && bonusConfig.enabled && bonusConfig.multiplier > 0) {
    return { taskId: forcedBonusId, multiplier: bonusConfig.multiplier };
  }
  return pickTodayBonus(userId, todoCandidates, today, bonusConfig);
}

// All of a user's todos, regardless of status, used as the bonus eligibility pool. The picker
// filters by ts_created/ts_completed: it drops todos created on or after `today` and todos completed
// on a prior day, keeping older todos that are still open OR were completed today (so the daily pick
// stays stable). ts_completed is returned as YYYY-MM-DD for a timezone-safe compare in the picker.
async function listTodoBonusCandidates(userId: string): Promise<BonusCandidate[]> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<BonusCandidate>(
      `SELECT id, ts_created, CONVERT(VARCHAR(10), ts_completed, 23) AS ts_completed
       FROM quest_tasks WHERE user_id = @userId AND kind = 'todo'`
    );
  return res.recordset;
}

interface DailyOccurrenceRow extends OccurrenceShape {
  last_completed_date: string | null;
}

// True when every daily task scheduled to occur on `today` (per its cadence) has already been
// satisfied (completed anywhere within its occurrence window). A day with zero scheduled dailies
// does NOT count as "all done" — at least one occurrence must exist to earn the bonus. Runs inside
// the caller's transaction so it sees the completion just written in the same tx.
async function allScheduledDailiesDone(tx: sql.Transaction, userId: string, today: string): Promise<boolean> {
  const res = await tx.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('today', sql.Date, today)
    .query<DailyOccurrenceRow>(
      `SELECT frequency, days_of_week, every_n,
              CONVERT(VARCHAR(10), start_date, 23) AS start_date,
              repeat_mode,
              window_days,
              CONVERT(VARCHAR(10), deferred_to_date, 23) AS deferred_to_date,
              CONVERT(VARCHAR(10), last_completed_date, 23) AS last_completed_date
       FROM quest_tasks WHERE user_id = @userId AND kind = 'daily'`
    );
  const scheduled = res.recordset.filter((t) => isOccurrenceOn(t, today));
  if (scheduled.length === 0) return false;
  return scheduled.every((t) =>
    t.last_completed_date === today || isWindowSatisfied(t, t.last_completed_date, today)
  );
}

function evalStreakBonus(ctx: RewardContext, base: number, streak: number): number {
  if (ctx.advanced.enabled) {
    return computeStreakBonusAdvanced(base, streak, ctx.coins, ctx.advanced.dailyRewardFormula, ctx.streak.factor, ctx.streak.cap);
  }
  return computeStreakBonus(base, streak, ctx.streak.factor, ctx.streak.cap);
}

export async function listTasks(userId: string): Promise<Task[]> {
  const pool = await getQuestConnection();
  const ctx = await loadRewardCtx(userId);
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('today', sql.Date, ctx.today)
    .query<Task>(
      `SELECT ${TASK_SELECT_COLUMNS}
       FROM quest_tasks
       WHERE user_id = @userId
       ORDER BY sort_order ASC, ts_created ASC`
    );
  const tasks = result.recordset;
  for (const t of tasks) attachReward(t, ctx);
  if (tasks.length === 0) return tasks;

  const subRes = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<Subtask & { done_bit: number }>(
      `SELECT s.id, s.task_id, s.title, CAST(s.done AS BIT) AS done, s.position,
              CONVERT(VARCHAR(10), s.last_bonus_date, 23) AS last_bonus_date
       FROM dbo.quest_subtasks s
       INNER JOIN dbo.quest_tasks t ON t.id = s.task_id
       WHERE t.user_id = @userId
       ORDER BY s.task_id, s.position, s.ts_created`
    );
  const byTask = new Map<string, Subtask[]>();
  for (const row of subRes.recordset) {
    const list = byTask.get(row.task_id) ?? [];
    list.push({
      id: row.id,
      task_id: row.task_id,
      title: row.title,
      done: !!row.done,
      position: row.position,
      last_bonus_date: row.last_bonus_date,
    });
    byTask.set(row.task_id, list);
  }
  const remByTask = await listRemindersForTasks(tasks.map((t) => t.id));
  for (const t of tasks) {
    attachSubtasks(t, byTask.get(t.id) ?? []);
    t.reminders = remByTask.get(t.id) ?? [];
  }
  return tasks;
}

export interface CreateTaskOptions {
  // Optional free-text notes/details. Null/omitted = no description.
  description?: string | null;
  frequency?: Frequency;
  days_of_week?: string | null;
  every_n?: number;
  start_date?: string | null;
  // Monthly / yearly calendar anchor ('day_of_month' | 'nth_weekday'). Ignored for other
  // frequencies; anything unrecognized stores NULL, which reads as 'day_of_month'.
  repeat_mode?: string | null;
  // Completion grace window in days (>=1; 1 = scheduled day only).
  window_days?: number;
  reminders?: unknown;
  // Manual reward override: a non-null number replaces the difficulty-derived base reward; null
  // (or omitted) keeps the per-difficulty factor.
  manual_reward_override?: number | null;
}

export async function createTask(
  userId: string,
  title: string,
  difficulty: Difficulty,
  kind: TaskKind,
  subtaskTitles: string[] = [],
  options: CreateTaskOptions = {},
): Promise<Task> {
  const pool = await getQuestConnection();
  const ctx = await loadRewardCtx(userId);
  const today = ctx.today;
  // Todos insert at the TOP (MIN - 10), dailies at the BOTTOM (MAX + 10). Negative sort_order is
  // fine — INT, no zero anchor — so we never need to reindex when prepending.
  const nextOrderRes = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<{ next_order: number }>(
      kind === 'todo'
        ? `SELECT ISNULL(MIN(sort_order), 0) - 10 AS next_order FROM quest_tasks WHERE user_id = @userId`
        : `SELECT ISNULL(MAX(sort_order), 0) + 10 AS next_order FROM quest_tasks WHERE user_id = @userId`
    );
  const nextOrder = nextOrderRes.recordset[0]?.next_order ?? (kind === 'todo' ? -10 : 10);
  const frequency = options.frequency ?? 'daily';
  // Description: trim and treat an empty string as no description (NULL).
  const descriptionTrimmed = options.description?.trim();
  const description = descriptionTrimmed ? descriptionTrimmed : null;
  // Grace window: at least 1 day (1 = must complete on the scheduled day).
  const windowDays = Math.max(1, Math.floor(options.window_days ?? 1));
  const repeatMode = normalizeRepeatMode(frequency, options.repeat_mode);
  // Normalize the override: null/undefined or a non-finite/negative number means "no override".
  const overrideRaw = options.manual_reward_override;
  const manualOverride = overrideRaw != null && Number.isFinite(overrideRaw) && overrideRaw >= 0
    ? overrideRaw
    : null;
  const insertResult = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('title', sql.NVarChar(500), title)
    .input('description', sql.NVarChar(sql.MAX), description)
    .input('difficulty', sql.NVarChar(20), difficulty)
    .input('kind', sql.NVarChar(10), kind)
    .input('frequency', sql.NVarChar(20), frequency)
    .input('daysOfWeek', sql.NVarChar(50), options.days_of_week ?? null)
    .input('everyN', sql.Int, options.every_n ?? 1)
    .input('startDate', sql.Date, options.start_date ?? null)
    .input('repeatMode', sql.NVarChar(20), repeatMode)
    .input('windowDays', sql.Int, windowDays)
    .input('manualReward', sql.Decimal(10, 2), manualOverride)
    .input('sortOrder', sql.Int, nextOrder)
    .input('today', sql.Date, today)
    .query<Task>(
      `INSERT INTO quest_tasks (user_id, title, description, difficulty, kind, frequency, days_of_week, every_n, start_date, repeat_mode, window_days, manual_reward_override, sort_order)
       OUTPUT ${taskOutputClause('0')}
       VALUES (@userId, @title, @description, @difficulty, @kind, @frequency, @daysOfWeek, @everyN, @startDate, @repeatMode, @windowDays, @manualReward, @sortOrder)`
    );
  const task = attachReward(insertResult.recordset[0], ctx);

  const subs: Subtask[] = [];
  const cleaned = subtaskTitles.map((s) => s.trim()).filter((s) => s.length > 0);
  for (let i = 0; i < cleaned.length; i++) {
    const subRes = await pool.request()
      .input('taskId', sql.UniqueIdentifier, task.id)
      .input('title', sql.NVarChar(500), cleaned[i])
      .input('position', sql.Int, i)
      .query<Subtask & { done_bit: number }>(
        `INSERT INTO quest_subtasks (task_id, title, position)
         OUTPUT INSERTED.id, INSERTED.task_id, INSERTED.title, CAST(INSERTED.done AS BIT) AS done, INSERTED.position,
                CONVERT(VARCHAR(10), INSERTED.last_bonus_date, 23) AS last_bonus_date
         VALUES (@taskId, @title, @position)`
      );
    const row = subRes.recordset[0];
    subs.push({
      id: row.id,
      task_id: row.task_id,
      title: row.title,
      done: !!row.done,
      position: row.position,
      last_bonus_date: row.last_bonus_date,
    });
  }
  const reminderInputs = normalizeReminders(options.reminders);
  if (reminderInputs.length > 0) {
    task.reminders = await replaceReminders(task.id, reminderInputs);
  } else {
    task.reminders = [];
  }
  return attachSubtasks(task, subs);
}

async function reloadSubtasks(pool: sql.ConnectionPool, taskId: string): Promise<Subtask[]> {
  const res = await pool.request()
    .input('taskId', sql.UniqueIdentifier, taskId)
    .query<Subtask & { done_bit: number }>(
      `SELECT id, task_id, title, CAST(done AS BIT) AS done, position,
              CONVERT(VARCHAR(10), last_bonus_date, 23) AS last_bonus_date
       FROM quest_subtasks
       WHERE task_id = @taskId
       ORDER BY position, ts_created`
    );
  return res.recordset.map((row) => ({
    id: row.id,
    task_id: row.task_id,
    title: row.title,
    done: !!row.done,
    position: row.position,
    last_bonus_date: row.last_bonus_date,
  }));
}

export interface CompletionRecord {
  task_id: string;
  completed_on: string;
  awarded: number;
  late: boolean;
}

// All dated completions for a user within [from, to] (inclusive, YYYY-MM-DD). The calendar overlays
// these on the schedule (computed client-side from the cadence fields) to render done/missed per day.
export async function listCompletionsInRange(userId: string, from: string, to: string): Promise<CompletionRecord[]> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('from', sql.Date, from)
    .input('to', sql.Date, to)
    .query<{ task_id: string; completed_on: string; awarded: number; late: boolean }>(
      `SELECT task_id,
              CONVERT(VARCHAR(10), completed_on, 23) AS completed_on,
              awarded, late
       FROM quest_task_completions
       WHERE user_id = @userId AND completed_on BETWEEN @from AND @to`
    );
  return res.recordset.map((r) => ({
    task_id: r.task_id,
    completed_on: r.completed_on,
    awarded: Number(r.awarded),
    late: Boolean(r.late),
  }));
}

// Carry a daily that fell on a (now frozen) yesterday forward to today — the after-the-fact version
// of the freeze "carry to today" picker. Only valid when yesterday is actually frozen (the carry
// target is always frozen day + 1 = today). Stamps deferred_to_date = today so the task appears and
// is completable today, while its original frozen-day occurrence stays visible-but-locked. Returns
// null when yesterday isn't frozen or the task isn't an owned daily.
export async function migrateTaskToToday(userId: string, taskId: string): Promise<Task | null> {
  const pool = await getQuestConnection();
  const ctx = await loadRewardCtx(userId);
  const today = ctx.today;
  const yest = (() => {
    const d = parseYMD(today);
    d.setDate(d.getDate() - 1);
    return formatYMD(d);
  })();
  if (!(await isFrozenDay(userId, yest))) return null;

  // ALREADY-SCHEDULED ELIGIBILITY GUARD — a daily must not be carried forward to a day it is
  // already scheduled on: it is still completable today by its own schedule (or a prior carry-over),
  // so migrating it would just re-stamp a redundant deferred_to_date. This mirrors the calendar's
  // client gate (isScheduledOn) but enforces it on the server so a direct API call can't transfer an
  // already-scheduled daily. "Scheduled" means EITHER an existing deferred_to_date one-shot pointing
  // at today, OR an active occurrence whose grace window covers today (activeOccurrenceStart spans
  // both the base-cadence occurrence days and any multi-day window). A past-window task with no
  // matching deferral returns null/false and stays eligible to migrate.
  const schedRes = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('id', sql.UniqueIdentifier, taskId)
    .query<{ frequency: Frequency; days_of_week: string | null; every_n: number; start_date: string | null; repeat_mode: RepeatMode | null; window_days: number; deferred_to_date: string | null }>(
      `SELECT frequency, days_of_week, every_n,
              CONVERT(VARCHAR(10), start_date, 23) AS start_date,
              repeat_mode,
              window_days,
              CONVERT(VARCHAR(10), deferred_to_date, 23) AS deferred_to_date
       FROM quest_tasks
       WHERE id = @id AND user_id = @userId AND kind = 'daily'`
    );
  const sched = schedRes.recordset[0];
  if (!sched) return null;
  // already scheduled today (one-shot deferral OR in-grace occurrence) → not eligible
  if (sched.deferred_to_date === today || activeOccurrenceStart(sched, today) !== null) return null;

  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('id', sql.UniqueIdentifier, taskId)
    .input('today', sql.Date, today)
    .query<Task>(
      `UPDATE quest_tasks
       SET deferred_to_date = @today
       OUTPUT ${taskOutputClause('computed')}
       WHERE id = @id AND user_id = @userId AND kind = 'daily'`
    );
  const task = res.recordset[0];
  if (!task) return null;
  attachReward(task, ctx);
  const subs = await reloadSubtasks(pool, taskId);
  return attachSubtasks(task, subs);
}

export async function completeTask(
  userId: string,
  taskId: string,
  options?: { forDate?: string }
): Promise<{ task: Task; awarded: number; allDailiesBonusAwarded?: number } | null> {
  const pool = await getQuestConnection();
  const baseCtx = await loadRewardCtx(userId);
  // Retro config prices + bounds late (backdated, past-window) daily completions.
  const retro = await getRetroConfig(userId);
  // forDate lets a caller retroactively complete a daily for a previous date (e.g. yesterday)
  // when offering a "previous day review". Falls back to the user's effective current date.
  const today = options?.forDate ?? baseCtx.today;
  const ctx: RewardContext = { ...baseCtx, today };
  // A frozen day is excused — its dailies (including any carried/migrated to a later day via
  // deferred_to_date) must not be completable on the frozen date itself. Only backdated dates can
  // be frozen (freezeDay requires date < today), so skip the lookup on a normal same-day complete.
  const creditFrozen = options?.forDate ? await isFrozenDay(userId, today) : false;
  const tx = pool.transaction();
  await tx.begin();
  try {
    const lookup = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('id', sql.UniqueIdentifier, taskId)
      .input('today', sql.Date, today)
      .query<Task>(
        `SELECT ${TASK_SELECT_COLUMNS}
         FROM quest_tasks WITH (UPDLOCK, HOLDLOCK)
         WHERE id = @id AND user_id = @userId`
      );
    const existing = lookup.recordset[0];
    if (!existing) {
      await tx.rollback();
      return null;
    }
    attachReward(existing, ctx);

    // Subtask count — if any, parent completion does NOT award the base (subtasks are the base increments)
    const subCountRes = await tx.request()
      .input('id', sql.UniqueIdentifier, taskId)
      .query<{ n: number }>(`SELECT COUNT(*) AS n FROM quest_subtasks WHERE task_id = @id`);
    const subtaskCount = subCountRes.recordset[0]?.n ?? 0;
    const hasSubtasks = subtaskCount > 0;

    // The date this completion is credited to (forDate when backdating, else the effective today)
    // and the real effective today, used to detect late/look-back regardless of the credit date.
    const creditDate = today;
    const realToday = baseCtx.today;

    if (existing.kind === 'daily') {
      // Excused guard. A frozen day is not completable — this covers a task that was carried off a
      // frozen day (its original occurrence stays visible-but-locked on that frozen date), while its
      // new target day (deferred_to_date = frozen day + 1, never frozen) stays completable. Other,
      // unrelated occurrences of the same task are NOT blocked.
      if (creditFrozen) {
        await tx.rollback();
        return { task: existing, awarded: 0 };
      }
      // A completion is "late" when crediting a PAST date whose occurrence grace window has already
      // closed as of realToday — those pay the reduced retro multiplier and leave neglect/HP intact.
      // Today and still-open windows (e.g. the yesterday review modal) stay full price.
      let late = false;
      if (creditDate < realToday) {
        const occStart = activeOccurrenceStart(existing, creditDate);
        if (occStart) {
          const windowEnd = parseYMD(occStart);
          windowEnd.setDate(windowEnd.getDate() + windowDaysOf(existing) - 1);
          late = parseYMD(realToday) > windowEnd;
        } else {
          late = true; // crediting a non-occurrence date — treat as a late ad-hoc fill
        }
      }
      // A gap-fill credits a past occurrence that sits BEHIND a more recent completion. It must not
      // regress last_completed_date or touch the streak — it only records the dated completion and
      // (reduced) coins. done_today is unreliable for it (computed vs the past creditDate), so we
      // gate idempotency on the completion log instead.
      const gapFill = existing.last_completed_date != null && existing.last_completed_date > creditDate;

      // Idempotency: one completion per task per date (the log is authoritative).
      const logRes = await tx.request()
        .input('id', sql.UniqueIdentifier, taskId)
        .input('creditDate', sql.Date, creditDate)
        .query<{ n: number }>(`SELECT COUNT(*) AS n FROM quest_task_completions WHERE task_id = @id AND completed_on = @creditDate`);
      if ((logRes.recordset[0]?.n ?? 0) > 0) {
        await tx.rollback();
        return { task: existing, awarded: 0 };
      }
      // Forward/on-time path also respects the active-window done state (covers multi-day windows
      // where another date in the same window already satisfied the occurrence).
      if (!gapFill && existing.done_today) {
        await tx.rollback();
        return { task: existing, awarded: 0 };
      }
      // Late gating: reduced multiplier requires the feature on and the date within look-back.
      if (late) {
        if (!retro.enabled) {
          await tx.rollback();
          return { task: existing, awarded: 0 };
        }
        const minDate = parseYMD(realToday);
        minDate.setDate(minDate.getDate() - retro.lookbackDays);
        if (parseYMD(creditDate) < minDate) {
          await tx.rollback();
          return { task: existing, awarded: 0 };
        }
      }
      const mult = late ? retro.multiplier : 1;
      const round2 = (n: number) => Math.round(n * 100) / 100;

      let baseAward: number;
      let bonusAward: number;
      let nextTask: Task;
      if (gapFill) {
        // Reduced base coins only — no streak bonus, no task-row mutation. The log row makes the
        // calendar render the day as done.
        baseAward = hasSubtasks ? 0 : round2(existing.reward_value * mult);
        bonusAward = 0;
        nextTask = existing;
      } else {
        // STREAK INCREMENT: effective pre-streak + 1 (resets to 1 if stale).
        // Bonus is computed from preStreak so the FIRST completion (preStreak=0) grants no bonus —
        // the streak must already exist to be rewarded.
        const preStreak = effectiveStreak(existing, creditDate);
        const newStreak = preStreak + 1;
        const bonus = evalStreakBonus(ctx, existing.reward_value, preStreak);
        // Once-per-day bonus gate: if the streak bonus was already paid for this date (e.g. user
        // completed → uncompleted → re-completed), don't pay it again.
        const bonusAlreadyPaid = existing.last_bonus_date === creditDate;
        baseAward = hasSubtasks ? 0 : round2(existing.reward_value * mult);
        bonusAward = (hasSubtasks || bonusAlreadyPaid) ? 0 : round2(bonus * mult);
        const nextBonusDate = bonusAward > 0 ? creditDate : existing.last_bonus_date;
        // Neglect ("decay") counts CONSECUTIVE missed occurrences, so any completion credited on or
        // after the last recorded miss breaks that chain and clears it — a late completion included,
        // since it also advances the streak. Skipping the reset on late completions let a daily that
        // the user finishes every morning-for-yesterday carry a stale decay count indefinitely
        // (streak climbing while decay stayed put), so the next genuine miss was priced as an
        // N+1-consecutive-day neglect: one missed max-difficulty daily cost 25 HP instead of 2. The
        // HP already lost for a past miss is still never refunded — that stays per the retro design.
        // A late fill credited BEHIND the last miss leaves the counter alone; the misses recorded
        // after that date are still unbroken neglect.
        const neglectReset = `neglect_count = CASE WHEN neglect_last_date > @today THEN neglect_count ELSE 0 END,
                 neglect_last_date = CASE WHEN neglect_last_date > @today THEN neglect_last_date ELSE NULL END,`;
        const updated = await tx.request()
          .input('id', sql.UniqueIdentifier, taskId)
          .input('today', sql.Date, creditDate)
          .input('streakCount', sql.Int, newStreak)
          .input('lastBonusDate', sql.Date, nextBonusDate)
          .query<Task>(
            `UPDATE quest_tasks
             SET last_completed_date = @today, ts_completed = CAST(@today AS DATETIME),
                 streak_count = @streakCount, streak_last_date = @today,
                 last_bonus_date = @lastBonusDate,
                 ${neglectReset}
                 deferred_to_date = CASE WHEN deferred_to_date = @today THEN NULL ELSE deferred_to_date END
             OUTPUT ${taskOutputClause('1')}
             WHERE id = @id`
          );
        await tx.request()
          .input('id', sql.UniqueIdentifier, taskId)
          .query(`UPDATE quest_subtasks SET done = 0, ts_completed = NULL WHERE task_id = @id`);
        nextTask = updated.recordset[0];
      }
      const awarded = baseAward + bonusAward;
      const pct = Math.round(mult * 100);
      // Two separate ledger rows: the base ("Daily: …") is reversible by uncompletion, the streak
      // bonus ("Streak bonus: …") is sticky. A late row tags the discount in its reason so it's
      // visible in history (and so the on-time 'Daily:%' reversal filter never matches it).
      let baseLedgerId: string | null = null;
      if (baseAward > 0) {
        const reason = late ? `Daily (late ${pct}%): ${existing.title}` : `Daily: ${existing.title}`;
        const led = await tx.request()
          .input('userId', sql.UniqueIdentifier, userId)
          .input('delta', sql.Decimal(10, 2), baseAward)
          .input('reason', sql.NVarChar(500), reason)
          .input('refId', sql.UniqueIdentifier, taskId)
          .query<{ id: string }>(
            `INSERT INTO quest_ledger (user_id, delta, reason, ref_type, ref_id)
             OUTPUT INSERTED.id
             VALUES (@userId, @delta, @reason, 'task', @refId)`
          );
        baseLedgerId = led.recordset[0]?.id ?? null;
      }
      if (bonusAward > 0) {
        const reason = late ? `Streak bonus (late ${pct}%): ${existing.title}` : `Streak bonus: ${existing.title}`;
        await tx.request()
          .input('userId', sql.UniqueIdentifier, userId)
          .input('delta', sql.Decimal(10, 2), bonusAward)
          .input('reason', sql.NVarChar(500), reason)
          .input('refId', sql.UniqueIdentifier, taskId)
          .query(
            `INSERT INTO quest_ledger (user_id, delta, reason, ref_type, ref_id)
             VALUES (@userId, @delta, @reason, 'task', @refId)`
          );
      }
      // Record the dated completion (authoritative for the calendar + idempotency).
      await tx.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('id', sql.UniqueIdentifier, taskId)
        .input('creditDate', sql.Date, creditDate)
        .input('awarded', sql.Decimal(10, 2), awarded)
        .input('late', sql.Bit, late ? 1 : 0)
        .input('ledgerId', sql.UniqueIdentifier, baseLedgerId)
        .query(
          `INSERT INTO quest_task_completions (user_id, task_id, completed_on, awarded, late, ledger_id)
           VALUES (@userId, @id, @creditDate, @awarded, @late, @ledgerId)`
        );
      // "All dailies complete" bonus — only for a genuine same-day completion (not a gap-fill or a
      // backdated review), and only once per calendar date (all_dailies_bonus_last_awarded_date).
      let allDailiesBonusAwarded = 0;
      if (!gapFill && creditDate === realToday) {
        const allDailiesBonus = await getAllDailiesBonusConfig(userId);
        if (
          allDailiesBonus.enabled
          && allDailiesBonus.amount > 0
          && allDailiesBonus.lastAwardedDate !== creditDate
          && (await allScheduledDailiesDone(tx, userId, creditDate))
        ) {
          allDailiesBonusAwarded = allDailiesBonus.amount;
          await tx.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .input('delta', sql.Decimal(10, 2), allDailiesBonusAwarded)
            .input('reason', sql.NVarChar(500), `All dailies bonus: ${creditDate}`)
            .query(
              `INSERT INTO quest_ledger (user_id, delta, reason, ref_type)
               VALUES (@userId, @delta, @reason, 'all_dailies_bonus')`
            );
          await markAllDailiesBonusAwarded(tx, userId, creditDate);
        }
      }
      await tx.commit();
      const task = attachReward(nextTask, ctx);
      const subs = await reloadSubtasks(pool, taskId);
      return { task: attachSubtasks(task, subs), awarded, allDailiesBonusAwarded };
    }

    if (existing.status === 'done') {
      await tx.rollback();
      return { task: existing, awarded: 0 };
    }

    const updated = await tx.request()
      .input('id', sql.UniqueIdentifier, taskId)
      .input('today', sql.Date, today)
      .query<Task>(
        `UPDATE quest_tasks
         SET status = 'done', ts_completed = CAST(@today AS DATETIME)
         OUTPUT ${taskOutputClause('0')}
         WHERE id = @id`
      );

    // Todos: no streak applies
    const awarded = hasSubtasks ? 0 : existing.reward_value;
    let todoLedgerId: string | null = null;
    if (!hasSubtasks) {
      // Surface the random bonus multiplier in the ledger reason so it's visible in history.
      const reasonPrefix = existing.todo_bonus_today
        ? `Completed (bonus ${Number(existing.todo_bonus_multiplier ?? 1).toFixed(2)}x)`
        : 'Completed';
      const led = await tx.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('delta', sql.Decimal(10, 2), awarded)
        .input('reason', sql.NVarChar(500), `${reasonPrefix}: ${existing.title}`)
        .input('refId', sql.UniqueIdentifier, taskId)
        .query<{ id: string }>(
          `INSERT INTO quest_ledger (user_id, delta, reason, ref_type, ref_id)
           OUTPUT INSERTED.id
           VALUES (@userId, @delta, @reason, 'task', @refId)`
        );
      todoLedgerId = led.recordset[0]?.id ?? null;
    }
    // Record the dated completion so the calendar can render the todo on its completion day. A todo
    // completes once; the UNIQUE(task_id, completed_on) guards against a same-date double-log.
    await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('id', sql.UniqueIdentifier, taskId)
      .input('creditDate', sql.Date, creditDate)
      .input('awarded', sql.Decimal(10, 2), awarded)
      .input('ledgerId', sql.UniqueIdentifier, todoLedgerId)
      .query(
        `INSERT INTO quest_task_completions (user_id, task_id, completed_on, awarded, late, ledger_id)
         VALUES (@userId, @id, @creditDate, @awarded, 0, @ledgerId)`
      );

    await tx.commit();
    const task = attachReward(updated.recordset[0], ctx);
    const subs = await reloadSubtasks(pool, taskId);
    return { task: attachSubtasks(task, subs), awarded };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export interface TaskUpdate {
  title?: string;
  // Optional free-text notes/details. Pass a string to set it, null/empty to clear, or omit to
  // leave unchanged (partial-update semantics).
  description?: string | null;
  difficulty?: Difficulty;
  kind?: TaskKind;
  frequency?: Frequency;
  days_of_week?: string | null;
  every_n?: number;
  start_date?: string | null;
  // Monthly / yearly calendar anchor ('day_of_month' | 'nth_weekday'). Ignored for other
  // frequencies; anything unrecognized stores NULL, which reads as 'day_of_month'.
  repeat_mode?: string | null;
  // Completion grace window in days (>=1; 1 = scheduled day only).
  window_days?: number;
  reminders?: unknown;
  // Manual reward override. Pass a number to set it, null to clear it (revert to difficulty-based),
  // or omit to leave it unchanged (partial-update semantics).
  manual_reward_override?: number | null;
}

export async function updateTask(userId: string, taskId: string, patch: TaskUpdate): Promise<Task | null> {
  const pool = await getQuestConnection();
  const ctx = await loadRewardCtx(userId);
  const today = ctx.today;
  const existingRes = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('id', sql.UniqueIdentifier, taskId)
    .input('today', sql.Date, today)
    .query<Task>(
      `SELECT ${TASK_SELECT_COLUMNS}
       FROM quest_tasks WHERE id = @id AND user_id = @userId`
    );
  const existing = existingRes.recordset[0];
  if (!existing) return null;
  const nextFrequency = patch.frequency ?? existing.frequency ?? 'daily';
  const next = {
    title: patch.title?.trim() || existing.title,
    // undefined = leave as-is; a trimmed non-empty string sets it; null/empty clears it.
    description: patch.description !== undefined
      ? (patch.description?.trim() ? patch.description.trim() : null)
      : existing.description,
    difficulty: patch.difficulty ?? existing.difficulty,
    kind: patch.kind ?? existing.kind,
    frequency: nextFrequency,
    days_of_week: patch.days_of_week !== undefined ? patch.days_of_week : existing.days_of_week,
    every_n: patch.every_n ?? existing.every_n ?? 1,
    start_date: patch.start_date !== undefined ? patch.start_date : existing.start_date,
    // Re-normalized against the NEXT frequency, so switching monthly → weekly drops a stale anchor.
    repeat_mode: normalizeRepeatMode(
      nextFrequency,
      patch.repeat_mode !== undefined ? patch.repeat_mode : existing.repeat_mode,
    ),
    window_days: Math.max(1, Math.floor(patch.window_days ?? existing.window_days ?? 1)),
    // undefined = leave as-is; null/invalid = clear; finite >=0 = set.
    manual_reward_override: patch.manual_reward_override !== undefined
      ? (Number.isFinite(patch.manual_reward_override as number) && (patch.manual_reward_override as number) >= 0
          ? (patch.manual_reward_override as number)
          : null)
      : existing.manual_reward_override,
  };
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('id', sql.UniqueIdentifier, taskId)
    .input('title', sql.NVarChar(500), next.title)
    .input('description', sql.NVarChar(sql.MAX), next.description)
    .input('difficulty', sql.NVarChar(20), next.difficulty)
    .input('kind', sql.NVarChar(10), next.kind)
    .input('frequency', sql.NVarChar(20), next.frequency)
    .input('daysOfWeek', sql.NVarChar(50), next.days_of_week)
    .input('everyN', sql.Int, next.every_n)
    .input('startDate', sql.Date, next.start_date)
    .input('repeatMode', sql.NVarChar(20), next.repeat_mode)
    .input('windowDays', sql.Int, next.window_days)
    .input('manualReward', sql.Decimal(10, 2), next.manual_reward_override)
    .input('today', sql.Date, today)
    .query<Task>(
      `UPDATE quest_tasks
       SET title = @title, description = @description, difficulty = @difficulty, kind = @kind,
           frequency = @frequency, days_of_week = @daysOfWeek, every_n = @everyN, start_date = @startDate,
           repeat_mode = @repeatMode, window_days = @windowDays, manual_reward_override = @manualReward
       OUTPUT ${taskOutputClause('computed')}
       WHERE id = @id AND user_id = @userId`
    );
  const task = res.recordset[0];
  if (!task) return null;
  attachReward(task, ctx);
  // Only replace reminders when the caller explicitly passed an array — undefined means "leave
  // the existing reminders alone", which matters because the PUT endpoint is partial-update.
  if (patch.reminders !== undefined) {
    task.reminders = await replaceReminders(taskId, normalizeReminders(patch.reminders));
  } else {
    task.reminders = await listRemindersForTask(taskId);
  }
  const subs = await reloadSubtasks(pool, taskId);
  return attachSubtasks(task, subs);
}

export async function uncompleteTask(userId: string, taskId: string): Promise<Task | null> {
  const pool = await getQuestConnection();
  const ctx = await loadRewardCtx(userId);
  const today = ctx.today;
  const tx = pool.transaction();
  await tx.begin();
  try {
    const lookup = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('id', sql.UniqueIdentifier, taskId)
      .input('today', sql.Date, today)
      .query<Task>(
        `SELECT ${TASK_SELECT_COLUMNS}
         FROM quest_tasks WITH (UPDLOCK, HOLDLOCK)
         WHERE id = @id AND user_id = @userId`
      );
    const existing = lookup.recordset[0];
    if (!existing) {
      await tx.rollback();
      return null;
    }
    attachReward(existing, ctx);

    // Look up the most recent positive BASE ledger entry for this task — i.e. the "Daily: …"
    // or "Completed: …" / "Completed (bonus …)" row that captured the base reward at completion
    // time. Inclusion-based filter (rather than excluding subtask / streak-bonus rows by name)
    // so a new ledger reason added elsewhere can't accidentally be reversed here.
    const lastRewardRes = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('refId', sql.UniqueIdentifier, taskId)
      .query<{ delta: number }>(
        `SELECT TOP 1 delta
         FROM quest_ledger
         WHERE user_id = @userId AND ref_id = @refId AND ref_type = 'task' AND delta > 0
           AND (reason LIKE 'Daily:%' OR reason LIKE 'Completed:%' OR reason LIKE 'Completed (%')
         ORDER BY ts_created DESC`
      );
    const lastReward = lastRewardRes.recordset[0] ? Number(lastRewardRes.recordset[0].delta) : 0;

    let updatedRes;
    if (existing.kind === 'daily') {
      if (!existing.done_today) {
        await tx.rollback();
        return existing;
      }
      const newStreak = Math.max(0, existing.streak_count - 1);
      // After undo, point streak_last_date at the occurrence BEFORE the one we just un-did so the
      // decremented streak reads as intact. With a grace window the current completion satisfied
      // the occurrence covering `today`, so step back from that occurrence's date.
      const curOccurrence = mostRecentOccurrenceOnOrBefore(existing, today);
      const newLastDate = newStreak === 0 || curOccurrence === null
        ? null
        : expectedPreviousOccurrence(existing, curOccurrence);
      updatedRes = await tx.request()
        .input('id', sql.UniqueIdentifier, taskId)
        .input('streakCount', sql.Int, newStreak)
        .input('streakLastDate', sql.Date, newLastDate)
        .query<Task>(
          `UPDATE quest_tasks
           SET last_completed_date = NULL, ts_completed = NULL,
               streak_count = @streakCount, streak_last_date = @streakLastDate
           OUTPUT ${taskOutputClause('0')}
           WHERE id = @id`
        );
    } else {
      if (existing.status !== 'done') {
        await tx.rollback();
        return existing;
      }
      updatedRes = await tx.request()
        .input('id', sql.UniqueIdentifier, taskId)
        .query<Task>(
          `UPDATE quest_tasks
           SET status = 'open', ts_completed = NULL
           OUTPUT ${taskOutputClause('0')}
           WHERE id = @id`
        );
    }

    // Use ONLY the historic ledger amount. If no parent ledger entry exists (e.g. the task
    // had subtasks at completion time and rewards were paid through them, or the difficulty
    // factor was 0), there is nothing to reverse here. Never recompute from current settings.
    const reverseAmount = lastReward;
    if (reverseAmount > 0) {
      await tx.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('delta', sql.Decimal(10, 2), -reverseAmount)
        .input('reason', sql.NVarChar(500), `Un-completed: ${existing.title}`)
        .input('refId', sql.UniqueIdentifier, taskId)
        .query(
          `INSERT INTO quest_ledger (user_id, delta, reason, ref_type, ref_id)
           VALUES (@userId, @delta, @reason, 'task', @refId)`
        );
    }
    // Uncomplete reverses TODAY's completion — drop its dated completion-log row so the calendar
    // stops showing today as done. Past dated completions aren't un-completable from here.
    await tx.request()
      .input('id', sql.UniqueIdentifier, taskId)
      .input('today', sql.Date, today)
      .query(`DELETE FROM quest_task_completions WHERE task_id = @id AND completed_on = @today`);
    await tx.commit();
    const task = attachReward(updatedRes.recordset[0], ctx);
    const subs = await reloadSubtasks(pool, taskId);
    return attachSubtasks(task, subs);
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function reorderTasks(userId: string, orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const pool = await getQuestConnection();
  const tx = pool.transaction();
  await tx.begin();
  try {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('id', sql.UniqueIdentifier, orderedIds[i])
        .input('sortOrder', sql.Int, (i + 1) * 10)
        .query(`UPDATE quest_tasks SET sort_order = @sortOrder WHERE id = @id AND user_id = @userId`);
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function deleteTask(userId: string, taskId: string): Promise<boolean> {
  const pool = await getQuestConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('id', sql.UniqueIdentifier, taskId)
    .query(`DELETE FROM quest_tasks WHERE id = @id AND user_id = @userId`);
  return (result.rowsAffected[0] ?? 0) > 0;
}

export async function createSubtask(userId: string, taskId: string, title: string): Promise<Subtask | null> {
  const pool = await getQuestConnection();
  const owns = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('taskId', sql.UniqueIdentifier, taskId)
    .query(`SELECT 1 AS ok FROM quest_tasks WHERE id = @taskId AND user_id = @userId`);
  if (owns.recordset.length === 0) return null;
  const positionRes = await pool.request()
    .input('taskId', sql.UniqueIdentifier, taskId)
    .query<{ next_position: number }>(`SELECT ISNULL(MAX(position) + 1, 0) AS next_position FROM quest_subtasks WHERE task_id = @taskId`);
  const position = positionRes.recordset[0]?.next_position ?? 0;
  const res = await pool.request()
    .input('taskId', sql.UniqueIdentifier, taskId)
    .input('title', sql.NVarChar(500), title.trim())
    .input('position', sql.Int, position)
    .query<Subtask & { done_bit: number }>(
      `INSERT INTO quest_subtasks (task_id, title, position)
       OUTPUT INSERTED.id, INSERTED.task_id, INSERTED.title, CAST(INSERTED.done AS BIT) AS done, INSERTED.position,
              CONVERT(VARCHAR(10), INSERTED.last_bonus_date, 23) AS last_bonus_date
       VALUES (@taskId, @title, @position)`
    );
  const row = res.recordset[0];
  return {
    id: row.id,
    task_id: row.task_id,
    title: row.title,
    done: !!row.done,
    position: row.position,
    last_bonus_date: row.last_bonus_date,
  };
}

// Persist a new ordering for a task's checklist items (subtasks). `orderedIds` is the full list of
// subtask ids in the desired top-to-bottom order; each is stamped with its index as `position`.
// Ownership is enforced via the parent task, and every UPDATE is scoped to the task so a caller
// can't renumber another task's rows. Ids not belonging to this task are silently ignored. Returns
// the reloaded, reordered subtasks, or null when the task isn't owned by the user.
export async function reorderSubtasks(
  userId: string,
  taskId: string,
  orderedIds: string[],
): Promise<Subtask[] | null> {
  const pool = await getQuestConnection();
  const owns = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('taskId', sql.UniqueIdentifier, taskId)
    .query(`SELECT 1 AS ok FROM quest_tasks WHERE id = @taskId AND user_id = @userId`);
  if (owns.recordset.length === 0) return null;
  // WRITE EACH POSITION IN A TRANSACTION — all-or-nothing so a partial failure never leaves the
  // checklist half-renumbered. Position = index in the requested order.
  const tx = pool.transaction();
  await tx.begin();
  try {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.request()
        .input('taskId', sql.UniqueIdentifier, taskId)
        .input('subId', sql.UniqueIdentifier, orderedIds[i])
        .input('position', sql.Int, i)
        .query(`UPDATE quest_subtasks SET position = @position WHERE id = @subId AND task_id = @taskId`);
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }
  return reloadSubtasks(pool, taskId);
}

export async function toggleSubtask(
  userId: string,
  taskId: string,
  subtaskId: string,
  done: boolean,
): Promise<{ subtask: Subtask; delta: number } | null> {
  const pool = await getQuestConnection();
  const ctx = await loadRewardCtx(userId);
  const { factors } = ctx;
  const today = ctx.today;
  const tx = pool.transaction();
  await tx.begin();
  try {
    // UPDLOCK/HOLDLOCK on the PARENT row (the same row completeTask locks) so a subtask toggle and
    // a parent completion can never interleave. Without it the parent's "reset subtasks to done = 0"
    // could land BETWEEN this lookup and the UPDATE below, leaving the subtask stuck done = 1 on an
    // already-completed daily — which then renders pre-checked the next day and shows as locked
    // ("Already complete") in the previous-day review modal.
    const lookup = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('taskId', sql.UniqueIdentifier, taskId)
      .input('id', sql.UniqueIdentifier, subtaskId)
      .query<{ difficulty: Difficulty; title: string; was_done: number; streak_count: number; streak_last_date: string | null; sub_last_bonus_date: string | null; kind: TaskKind; last_completed_date: string | null; frequency: Frequency; days_of_week: string | null; every_n: number; start_date: string | null; repeat_mode: RepeatMode | null; window_days: number | null; deferred_to_date: string | null }>(
        `SELECT t.difficulty, s.title, CAST(s.done AS INT) AS was_done,
                t.streak_count,
                CONVERT(VARCHAR(10), t.streak_last_date, 23) AS streak_last_date,
                CONVERT(VARCHAR(10), s.last_bonus_date, 23) AS sub_last_bonus_date,
                t.kind, t.frequency, t.days_of_week, t.every_n, t.repeat_mode,
                CONVERT(VARCHAR(10), t.last_completed_date, 23) AS last_completed_date,
                CONVERT(VARCHAR(10), t.start_date, 23) AS start_date,
                t.window_days,
                CONVERT(VARCHAR(10), t.deferred_to_date, 23) AS deferred_to_date
         FROM dbo.quest_subtasks s
         INNER JOIN dbo.quest_tasks t WITH (UPDLOCK, HOLDLOCK) ON t.id = s.task_id
         WHERE s.id = @id AND s.task_id = @taskId AND t.user_id = @userId`
      );
    const found = lookup.recordset[0];
    if (!found) {
      await tx.rollback();
      return null;
    }
    const wasDone = !!found.was_done;

    // A completed daily has already zeroed its subtasks for the next cycle — checking one back on
    // would resurrect it into that cycle. Refuse and hand back the subtask's real (reset) state so
    // the caller can roll its optimistic tick back. Only dailies reset subtasks on completion, so
    // todos are unaffected.
    const parentDailyComplete =
      found.kind === 'daily' &&
      (found.last_completed_date === today || isWindowSatisfied(found, found.last_completed_date, today));
    if (done && !wasDone && parentDailyComplete) {
      await tx.rollback();
      const current = await pool.request()
        .input('id', sql.UniqueIdentifier, subtaskId)
        .query<Subtask>(
          `SELECT id, task_id, title, CAST(done AS BIT) AS done, position,
                  CONVERT(VARCHAR(10), last_bonus_date, 23) AS last_bonus_date
           FROM quest_subtasks WHERE id = @id`
        );
      const row = current.recordset[0];
      if (!row) return null;
      return {
        subtask: {
          id: row.id,
          task_id: row.task_id,
          title: row.title,
          done: !!row.done,
          position: row.position,
          last_bonus_date: row.last_bonus_date,
        },
        delta: 0,
      };
    }
    const reward = computeReward(found.difficulty, factors);
    // Use preStreak (the streak coming INTO today). If parent has already been completed today,
    // streak_count was incremented — back off by 1 so subtask bonus matches the "pre-completion" value.
    const preStreak = found.streak_last_date === today
      ? Math.max(0, (found.streak_count ?? 0) - 1)
      : (found.streak_count ?? 0);
    const bonus = evalStreakBonus(ctx, reward, preStreak);
    // Track the base and bonus halves separately. Awarding splits them into two ledger rows
    // (base = "Subtask: …", bonus = "Subtask streak bonus: …"). Reversal pulls back only the
    // base, leaving the streak bonus earned.
    // Once-per-day bonus gate per subtask: if the streak bonus was already paid today for this
    // subtask, don't pay it again on un-check → re-check on the same day.
    const subBonusAlreadyPaidToday = found.sub_last_bonus_date === today;
    let baseDelta = 0;
    let bonusDelta = 0;
    if (done && !wasDone) {
      baseDelta = reward;
      bonusDelta = subBonusAlreadyPaidToday ? 0 : bonus;
    } else if (!done && wasDone) {
      // Reverse the EXACT base amount this subtask last awarded from the ledger. Never recompute —
      // settings tweaks (factors, streak factor/cap) between completion and uncompletion would
      // otherwise cause the reversal to differ from what was actually given.
      const subtaskReason = `Subtask: ${found.title}`;
      const lastSubRes = await tx.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('refId', sql.UniqueIdentifier, taskId)
        .input('reason', sql.NVarChar(500), subtaskReason)
        .query<{ delta: number }>(
          `SELECT TOP 1 delta
           FROM quest_ledger
           WHERE user_id = @userId AND ref_id = @refId AND ref_type = 'task' AND delta > 0 AND reason = @reason
           ORDER BY ts_created DESC`
        );
      const lastSubReward = lastSubRes.recordset[0] ? Number(lastSubRes.recordset[0].delta) : 0;
      baseDelta = -lastSubReward;
    }

    const nextSubBonusDate = bonusDelta > 0 ? today : found.sub_last_bonus_date;
    const updateRes = await tx.request()
      .input('id', sql.UniqueIdentifier, subtaskId)
      .input('done', sql.Bit, done ? 1 : 0)
      .input('lastBonusDate', sql.Date, nextSubBonusDate)
      .query<Subtask & { done_bit: number }>(
        `UPDATE quest_subtasks
         SET done = @done,
             ts_completed = CASE WHEN @done = 1 THEN GETDATE() ELSE NULL END,
             last_bonus_date = @lastBonusDate
         OUTPUT INSERTED.id, INSERTED.task_id, INSERTED.title, CAST(INSERTED.done AS BIT) AS done, INSERTED.position,
                CONVERT(VARCHAR(10), INSERTED.last_bonus_date, 23) AS last_bonus_date
         WHERE id = @id`
      );

    if (baseDelta !== 0) {
      await tx.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('delta', sql.Decimal(10, 2), baseDelta)
        .input('reason', sql.NVarChar(500), `${baseDelta > 0 ? 'Subtask' : 'Un-subtask'}: ${found.title}`)
        .input('refId', sql.UniqueIdentifier, taskId)
        .query(
          `INSERT INTO quest_ledger (user_id, delta, reason, ref_type, ref_id)
           VALUES (@userId, @delta, @reason, 'task', @refId)`
        );
    }
    if (bonusDelta > 0) {
      await tx.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('delta', sql.Decimal(10, 2), bonusDelta)
        .input('reason', sql.NVarChar(500), `Subtask streak bonus: ${found.title}`)
        .input('refId', sql.UniqueIdentifier, taskId)
        .query(
          `INSERT INTO quest_ledger (user_id, delta, reason, ref_type, ref_id)
           VALUES (@userId, @delta, @reason, 'task', @refId)`
        );
    }
    const delta = baseDelta + bonusDelta;

    await tx.commit();
    const row = updateRes.recordset[0];
    return {
      subtask: {
        id: row.id,
        task_id: row.task_id,
        title: row.title,
        done: !!row.done,
        position: row.position,
        last_bonus_date: row.last_bonus_date,
      },
      delta,
    };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function deleteSubtask(userId: string, taskId: string, subtaskId: string): Promise<boolean> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('taskId', sql.UniqueIdentifier, taskId)
    .input('id', sql.UniqueIdentifier, subtaskId)
    .query(
      `DELETE s FROM dbo.quest_subtasks s
       INNER JOIN dbo.quest_tasks t ON t.id = s.task_id
       WHERE s.id = @id AND s.task_id = @taskId AND t.user_id = @userId`
    );
  return (res.rowsAffected[0] ?? 0) > 0;
}
