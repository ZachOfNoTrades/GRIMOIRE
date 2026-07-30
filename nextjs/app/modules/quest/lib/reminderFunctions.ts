import sql from 'mssql';
import { getQuestConnection } from './db';
import { TaskReminder, Task } from '../types/task';
import { isOccurrenceOn, isWindowSatisfied } from './taskFunctions';
import { Frequency } from '../types/task';
import { sendAppEmail, isEmailConfigured } from '@/lib/email';
import { appBaseUrl } from '@/lib/appUrl';
import { getUserContact } from '@/lib/userContact';

// Reasonable late-fire window. If the server was down (or HMR was busy) when a reminder was due,
// we still want to deliver it once the next tick catches up — but not hours later, which would be
// noise (the user has either already completed the task or has moved on).
const LATE_FIRE_WINDOW_MIN = 30;

export interface DueReminder {
  reminderId: string;
  taskId: string;
  userId: string;
  taskTitle: string;
  taskKind: 'todo' | 'daily';
  fireTime: string;
  // When set, the reminder is one-shot and only fires when today === fire_date. Null means
  // "fire whenever the parent task is active today".
  fireDate: string | null;
  // Joined task fields needed to decide "is this task active today?" without a second query per row.
  frequency: Frequency;
  daysOfWeek: string | null;
  everyN: number;
  startDate: string | null;
  windowDays: number;
  deferredToDate: string | null;
  lastCompletedDate: string | null;
  status: 'open' | 'done';
}

interface DueReminderRow {
  id: string;
  task_id: string;
  user_id: string;
  title: string;
  kind: 'todo' | 'daily';
  fire_time: string;
  fire_date: string | null;
  frequency: Frequency;
  days_of_week: string | null;
  every_n: number;
  start_date: string | null;
  window_days: number;
  deferred_to_date: string | null;
  last_completed_date: string | null;
  status: 'open' | 'done';
}

// Shared projection + joins for "a reminder whose fire_time has arrived today". Callers append
// their own extra predicates (the scheduler adds the not-yet-fired gate; the dashboard badge
// doesn't care whether the notification already went out). A reminder pinned to a specific
// fire_date is excluded outright once we're past that date — it would otherwise show up forever
// as "due" and be filtered later in TS. Reminders with NULL fire_date pass through and get the
// active-today gate applied in TS.
const PASSED_REMINDER_SELECT = `SELECT r.id, r.task_id, t.user_id, t.title, t.kind,
              CONVERT(VARCHAR(5), r.fire_time, 108) AS fire_time,
              CONVERT(VARCHAR(10), r.fire_date, 23) AS fire_date,
              t.frequency, t.days_of_week, t.every_n,
              CONVERT(VARCHAR(10), t.start_date, 23) AS start_date,
              t.window_days,
              CONVERT(VARCHAR(10), t.deferred_to_date, 23) AS deferred_to_date,
              CONVERT(VARCHAR(10), t.last_completed_date, 23) AS last_completed_date,
              t.status
       FROM dbo.quest_task_reminders r
       INNER JOIN dbo.quest_tasks t ON t.id = r.task_id
       WHERE CONVERT(VARCHAR(5), r.fire_time, 108) <= @nowHHMM
         AND (r.fire_date IS NULL OR r.fire_date >= @today)
         AND NOT EXISTS (
           SELECT 1 FROM dbo.quest_frozen_days f
           WHERE f.user_id = t.user_id AND f.frozen_date = @today
         )`;

function mapDueReminder(r: DueReminderRow): DueReminder {
  return {
    reminderId: r.id,
    taskId: r.task_id,
    userId: r.user_id,
    taskTitle: r.title,
    taskKind: r.kind,
    fireTime: r.fire_time,
    fireDate: r.fire_date,
    frequency: r.frequency,
    daysOfWeek: r.days_of_week,
    everyN: r.every_n,
    startDate: r.start_date,
    windowDays: r.window_days,
    deferredToDate: r.deferred_to_date,
    lastCompletedDate: r.last_completed_date,
    status: r.status,
  };
}

// Every reminder for ONE user whose fire_time has already passed today, regardless of whether the
// notification was sent. The scheduler's not-yet-fired gate and late-fire window are deliberately
// omitted: the dashboard badge answers "is something still sitting past its reminder right now?",
// which stays true for the rest of the day. Callers still apply isTaskActiveToday to drop
// reminders whose task is done or not scheduled today.
export async function listPassedRemindersForUser(
  userId: string,
  today: string,
  nowHHMM: string,
): Promise<DueReminder[]> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('today', sql.Date, today)
    .input('nowHHMM', sql.VarChar(5), nowHHMM)
    .query<DueReminderRow>(`${PASSED_REMINDER_SELECT} AND t.user_id = @userId`);
  return res.recordset.map(mapDueReminder);
}

// All reminders whose fire_time has arrived (within the late-fire window) and that haven't been
// fired yet today. Freeze and "scheduled today" filters happen in TS — `isOccurrenceOn` already
// encapsulates the cadence rules, and joining against quest_frozen_days lets us drop frozen users
// in the same query.
export async function listDueReminders(today: string, nowHHMM: string): Promise<DueReminder[]> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('today', sql.Date, today)
    .input('nowHHMM', sql.VarChar(5), nowHHMM)
    .query<DueReminderRow>(
      // reminders_enabled gates the *email* only, so it lives here rather than in the shared
      // projection — listPassedRemindersForUser drives the in-app dashboard badge, and
      // unsubscribing from reminder emails shouldn't blank an on-screen indicator. A user with
      // no settings row has never opted out, hence the ISNULL default of 1.
      `${PASSED_REMINDER_SELECT}
         AND (r.last_fired_date IS NULL OR r.last_fired_date < @today)
         AND ISNULL((SELECT qs.reminders_enabled FROM dbo.quest_settings qs
                     WHERE qs.user_id = t.user_id), 1) = 1`
    );
  return res.recordset.map(mapDueReminder);
}

// "Active today" predicate that mirrors what the home page renders. Todos: still open and not
// completed today. Dailies: scheduled today by cadence (or by deferred_to_date override) and not
// already completed today.
export function isTaskActiveToday(r: DueReminder, today: string): boolean {
  // Pinned-date reminders: only fire on that exact date, and only if the task is still completable.
  if (r.fireDate !== null) {
    if (r.fireDate !== today) return false;
    if (r.taskKind === 'todo') return r.status === 'open' && r.lastCompletedDate !== today;
    return r.lastCompletedDate !== today;
  }
  if (r.taskKind === 'todo') {
    if (r.lastCompletedDate === today) return false;
    return r.status === 'open';
  }
  const occ = {
    frequency: r.frequency,
    days_of_week: r.daysOfWeek,
    every_n: r.everyN,
    start_date: r.startDate,
    window_days: r.windowDays,
    deferred_to_date: r.deferredToDate,
  };
  // A grace-window occurrence is "done" once completed anywhere in its window, so an early
  // completion suppresses later reminders in the same window — check window satisfaction, not
  // same-day equality. (window_days=1 ⇒ same as the legacy "completed today" check.)
  if (r.lastCompletedDate === today || isWindowSatisfied(occ, r.lastCompletedDate, today)) return false;
  return isOccurrenceOn(occ, today);
}

// Drop reminders whose fire_time was more than LATE_FIRE_WINDOW_MIN minutes ago. Keeps a 9am
// reminder from pinging at 2pm if the server was down.
export function isWithinLateFireWindow(fireHHMM: string, now: Date): boolean {
  const [h, m] = fireHHMM.split(':').map((s) => Number(s));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
  const fire = new Date(now);
  fire.setHours(h, m, 0, 0);
  const diffMin = (now.getTime() - fire.getTime()) / 60000;
  return diffMin >= 0 && diffMin <= LATE_FIRE_WINDOW_MIN;
}

export async function markFired(reminderId: string, today: string): Promise<void> {
  const pool = await getQuestConnection();
  await pool.request()
    .input('id', sql.UniqueIdentifier, reminderId)
    .input('today', sql.Date, today)
    .query(
      `UPDATE dbo.quest_task_reminders SET last_fired_date = @today WHERE id = @id`
    );
}

export async function listRemindersForTasks(taskIds: string[]): Promise<Map<string, TaskReminder[]>> {
  const byTask = new Map<string, TaskReminder[]>();
  if (taskIds.length === 0) return byTask;
  const pool = await getQuestConnection();
  // mssql doesn't support array-binding; use a comma-list table-valued split via OPENJSON.
  const res = await pool.request()
    .input('ids', sql.NVarChar(sql.MAX), JSON.stringify(taskIds))
    .query<{ id: string; task_id: string; fire_time: string; fire_date: string | null; last_fired_date: string | null }>(
      `SELECT r.id, r.task_id,
              CONVERT(VARCHAR(5), r.fire_time, 108) AS fire_time,
              CONVERT(VARCHAR(10), r.fire_date, 23) AS fire_date,
              CONVERT(VARCHAR(10), r.last_fired_date, 23) AS last_fired_date
       FROM dbo.quest_task_reminders r
       INNER JOIN OPENJSON(@ids) j ON j.value = CAST(r.task_id AS NVARCHAR(36))
       ORDER BY r.fire_date, r.fire_time`
    );
  for (const row of res.recordset) {
    const list = byTask.get(row.task_id) ?? [];
    list.push({
      id: row.id,
      task_id: row.task_id,
      fire_time: row.fire_time,
      fire_date: row.fire_date,
      last_fired_date: row.last_fired_date,
    });
    byTask.set(row.task_id, list);
  }
  return byTask;
}

export async function listRemindersForTask(taskId: string): Promise<TaskReminder[]> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('taskId', sql.UniqueIdentifier, taskId)
    .query<{ id: string; task_id: string; fire_time: string; fire_date: string | null; last_fired_date: string | null }>(
      `SELECT id, task_id,
              CONVERT(VARCHAR(5), fire_time, 108) AS fire_time,
              CONVERT(VARCHAR(10), fire_date, 23) AS fire_date,
              CONVERT(VARCHAR(10), last_fired_date, 23) AS last_fired_date
       FROM dbo.quest_task_reminders
       WHERE task_id = @taskId
       ORDER BY fire_date, fire_time`
    );
  return res.recordset.map((r) => ({
    id: r.id,
    task_id: r.task_id,
    fire_time: r.fire_time,
    fire_date: r.fire_date,
    last_fired_date: r.last_fired_date,
  }));
}

export interface ReminderInput {
  fire_time: string;
  fire_date: string | null;
}

// Validates and normalizes a list of reminder inputs. Accepts both `string` (legacy bare HH:MM,
// fire_date defaults to null) and `{ fire_time, fire_date }` shapes for forward-compat with the
// UI's structured payload. Drops invalid entries; dedupes on (fire_date, fire_time).
export function normalizeReminders(input: unknown): ReminderInput[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: ReminderInput[] = [];
  for (const raw of input) {
    let time: string | undefined;
    let date: string | null = null;
    if (typeof raw === 'string') {
      time = raw;
    } else if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>;
      if (typeof r.fire_time === 'string') time = r.fire_time;
      if (typeof r.fire_date === 'string' && r.fire_date.trim()) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(r.fire_date.trim())) date = r.fire_date.trim();
      }
    }
    if (!time) continue;
    const m = time.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const h = Number(m[1]);
    const mm = Number(m[2]);
    if (h < 0 || h > 23 || mm < 0 || mm > 59) continue;
    const normalized = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const key = `${date ?? ''}|${normalized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fire_time: normalized, fire_date: date });
  }
  // Stable order: dated entries first by date, then undated, all by time.
  return out.sort((a, b) => {
    if (a.fire_date && !b.fire_date) return -1;
    if (!a.fire_date && b.fire_date) return 1;
    if (a.fire_date && b.fire_date && a.fire_date !== b.fire_date) {
      return a.fire_date < b.fire_date ? -1 : 1;
    }
    return a.fire_time.localeCompare(b.fire_time);
  });
}

// Diff-and-apply: replace this task's reminders with exactly the given set. Insertions and
// deletions only — we never UPDATE an existing row (key changes are insert+delete) because
// last_fired_date should reset when a user re-times a reminder.
export async function replaceReminders(taskId: string, reminders: ReminderInput[]): Promise<TaskReminder[]> {
  const pool = await getQuestConnection();
  const tx = pool.transaction();
  await tx.begin();
  try {
    const existingRes = await tx.request()
      .input('taskId', sql.UniqueIdentifier, taskId)
      .query<{ id: string; fire_time: string; fire_date: string | null }>(
        `SELECT id,
                CONVERT(VARCHAR(5), fire_time, 108) AS fire_time,
                CONVERT(VARCHAR(10), fire_date, 23) AS fire_date
         FROM dbo.quest_task_reminders WHERE task_id = @taskId`
      );
    const existing = existingRes.recordset;
    const keyOf = (d: string | null, t: string) => `${d ?? ''}|${t}`;
    const want = new Set(reminders.map((r) => keyOf(r.fire_date, r.fire_time)));
    const have = new Set(existing.map((r) => keyOf(r.fire_date, r.fire_time)));
    for (const row of existing) {
      if (!want.has(keyOf(row.fire_date, row.fire_time))) {
        await tx.request()
          .input('id', sql.UniqueIdentifier, row.id)
          .query(`DELETE FROM dbo.quest_task_reminders WHERE id = @id`);
      }
    }
    for (const r of reminders) {
      if (!have.has(keyOf(r.fire_date, r.fire_time))) {
        await tx.request()
          .input('taskId', sql.UniqueIdentifier, taskId)
          .input('fireTime', sql.VarChar(5), r.fire_time)
          .input('fireDate', sql.Date, r.fire_date)
          .query(
            `INSERT INTO dbo.quest_task_reminders (task_id, fire_time, fire_date)
             VALUES (@taskId, CAST(@fireTime AS TIME(0)), @fireDate)`
          );
      }
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
  return listRemindersForTask(taskId);
}

// Send one reminder as an email to the task's owner. Soft-fails (returns false) when email is
// unconfigured, the user has no address on file, or the send fails — the scheduler treats `false`
// as "don't stamp last_fired_date, retry next minute (until the late-fire window closes)".
export async function sendReminderNotification(opts: {
  userId: string;
  taskTitle: string;
  taskKind: 'todo' | 'daily';
  fireTime: string;
}): Promise<boolean> {
  if (!isEmailConfigured()) return false;

  // Reminders are driven off per-task rows, so unlike the digest legs there is no candidate
  // query that already carries the address — always resolve it here.
  const contact = await getUserContact(opts.userId);
  if (!contact?.email) return false;

  const res = await sendAppEmail({
    userId: opts.userId,
    to: contact.email,
    toName: contact.name,
    kind: 'quest-reminder',
    subject: `Quest reminder — ${opts.taskTitle}`,
    heading: 'Quest reminder',
    intro: `**${opts.taskTitle}**`,
    fields: [
      { name: 'Kind', value: opts.taskKind === 'daily' ? 'Daily' : 'Todo', inline: true },
      { name: 'Scheduled', value: opts.fireTime, inline: true },
    ],
    ctaUrl: `${appBaseUrl()}/modules/quest/ui/home`,
    ctaLabel: 'Open Quest',
    footerNote: 'grimoire · quest',
  });
  return res.ok;
}
