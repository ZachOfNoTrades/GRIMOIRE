import sql from 'mssql';
import { ModuleBadge } from '@/types/dashboardBadge';
import { getQuestConnection } from './db';
import { getCurrentDate } from './settingsFunctions';
import { resolveTodayBonus } from './taskFunctions';
import { listPassedRemindersForUser, isTaskActiveToday } from './reminderFunctions';

// Homepage badges for the Quest card:
//   - "Bonus task" — today's deterministic aged-todo bonus landed on a todo that's still open.
//     Uses resolveTodayBonus, the same roll listTasks/completions use, so the badge can never
//     point at a different todo than the one actually paying the multiplier.
//   - "N past reminder" — a task whose reminder time has already passed today and that is still
//     active (open todo / daily scheduled today and not yet satisfied). Unlike the notification
//     scheduler this ignores the already-fired stamp and the late-fire window: the badge is a
//     standing "still outstanding" signal for the rest of the day, not a one-shot ping.

// Server-local HH:MM, matching the reminder scheduler's clock.
function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Title + status of the todo carrying today's bonus, or null when it no longer exists.
async function getBonusTask(taskId: string): Promise<{ title: string; status: 'open' | 'done' } | null> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('id', sql.UniqueIdentifier, taskId)
    .query<{ title: string; status: 'open' | 'done' }>(
      `SELECT title, status FROM dbo.quest_tasks WHERE id = @id`
    );
  return res.recordset[0] ?? null;
}

export async function getQuestBadges(userId: string): Promise<ModuleBadge[]> {
  const badges: ModuleBadge[] = [];
  const today = await getCurrentDate(userId);

  const [bonus, passed] = await Promise.all([
    resolveTodayBonus(userId, today),
    listPassedRemindersForUser(userId, today, nowHHMM()),
  ]);

  // BONUS TASK — skip once it's been completed; the multiplier is already banked.
  if (bonus.taskId) {
    const task = await getBonusTask(bonus.taskId);
    if (task && task.status === 'open') {
      badges.push({
        key: 'quest-bonus',
        label: `${Number(bonus.multiplier).toFixed(bonus.multiplier % 1 === 0 ? 0 : 2)}x bonus`,
        tone: 'green',
        detail: `Today's bonus task: ${task.title}`,
      });
    }
  }

  // PAST REMINDER — one badge for the whole set; the count is what matters at a glance.
  const outstanding = passed.filter((r) => isTaskActiveToday(r, today));
  if (outstanding.length > 0) {
    const earliest = outstanding.reduce((a, b) => (a.fireTime <= b.fireTime ? a : b));
    badges.push({
      key: 'quest-past-reminder',
      label: outstanding.length === 1 ? 'Past reminder' : `${outstanding.length} past reminders`,
      tone: 'red',
      detail:
        outstanding.length === 1
          ? `${earliest.taskTitle} was due at ${earliest.fireTime}.`
          : `${outstanding.length} tasks are past their reminder time (earliest ${earliest.fireTime}).`,
    });
  }

  return badges;
}
