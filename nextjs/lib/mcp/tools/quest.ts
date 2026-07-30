import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '@/lib/mcp/context';
import { json, text } from '@/lib/mcp/format';

import {
  listTasks,
  createTask,
  completeTask,
  uncompleteTask,
  deleteTask,
} from '@/app/modules/quest/lib/taskFunctions';
import { listHabits, tapHabit } from '@/app/modules/quest/lib/habitFunctions';
import { listRewards, spendOnReward } from '@/app/modules/quest/lib/rewardFunctions';
import { getBalance, getLedger } from '@/app/modules/quest/lib/ledgerFunctions';
import { getUserState } from '@/app/modules/quest/lib/userStateFunctions';
import { DIFFICULTY_ORDER, TASK_KINDS, FREQUENCIES, WEEKDAY_KEYS } from '@/app/modules/quest/types/task';

const Difficulty = z.enum(DIFFICULTY_ORDER as [string, ...string[]]);
const Kind = z.enum(TASK_KINDS as [string, ...string[]]);
const Frequency = z.enum(FREQUENCIES as [string, ...string[]]);

// days_of_week is stored as a comma-separated list of lowercase weekday keys (e.g. "sat,sun"),
// the same representation the web UI and HTTP API use. Normalize a free-form input to that form,
// dropping blanks/unknown tokens; returns null when nothing valid remains.
const VALID_DOW = new Set<string>(WEEKDAY_KEYS);
function normalizeDaysOfWeek(value: string | null | undefined): string | null {
  if (!value) return null;
  const keys = value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => VALID_DOW.has(s));
  return keys.length > 0 ? keys.join(',') : null;
}

const Reminder = z.object({
  fire_time: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/)
    .describe('HH:MM in 24-hour local time, e.g. "17:30"'),
  fire_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .describe(
      'YYYY-MM-DD if this reminder is one-shot for a specific date (e.g. "today" or "tomorrow"). Omit/null for a recurring reminder that fires whenever the task is active.',
    ),
});

export function registerQuestTools(server: McpServer, ctx: McpContext) {
  const userId = ctx.user.id;

  server.registerTool(
    'quest_list_tasks',
    {
      description: 'All of the user\'s active quest tasks (todos and recurring dailies) with subtasks, reminders, and reward state.',
      inputSchema: {},
    },
    async () => json(await listTasks(userId)),
  );

  server.registerTool(
    'quest_create_task',
    {
      description:
        'Create a new quest task. Use kind="todo" for one-off items ("clean airpods") and kind="daily" for recurring habits. ' +
        'For reminders, convert any relative time the user mentioned ("later today", "tomorrow morning") into a concrete fire_time and, if one-shot, fire_date — DO NOT pass through phrases. ' +
        'For todos with a date-specific reminder, set fire_date to that date. For recurring dailies, leave fire_date null so the reminder fires whenever the task is scheduled. ' +
        'Set window_days > 1 to give a recurring task a completion grace window: each scheduled occurrence stays completable for that many days and a single completion anywhere in the span counts once (e.g. a weekend chore = frequency="weekly", start_date on a Saturday, window_days=2 → completable Sat OR Sun).',
      inputSchema: {
        title: z.string().min(1).max(500),
        description: z
          .string()
          .nullable()
          .optional()
          .describe('Optional free-text notes/details for the task. title is the short label; description holds longer context. Omit or null for none.'),
        difficulty: Difficulty.default('easy'),
        kind: Kind.default('todo'),
        subtasks: z.array(z.string()).default([]),
        frequency: Frequency.default('daily').describe('Only meaningful for kind="daily"'),
        every_n: z.number().int().min(1).default(1),
        days_of_week: z
          .string()
          .nullable()
          .optional()
          .describe('Only for frequency="daily": comma-separated lowercase weekday keys from sun,mon,tue,wed,thu,fri,sat — each listed day is independently required (e.g. "mon,tue,wed,thu,fri" = weekdays, "sat,sun" = both weekend days). Omit/null = every day. To instead let a task be completed ONCE anywhere within a range of days, use window_days (see below).'),
        start_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional()
          .describe('YYYY-MM-DD anchor date for recurrence calculations'),
        window_days: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Completion grace window in days for a recurring task (default 1 = must complete on the scheduled day). Each occurrence stays completable for this many days from its scheduled date and one completion in that span counts once. E.g. weekly anchored on Saturday + window_days=2 = completable Sat OR Sun.'),
        manual_reward_override: z
          .number()
          .min(0)
          .nullable()
          .optional()
          .describe('Manual coin reward override. When set, this value REPLACES the difficulty-derived base reward for the task (streak / age bonuses still build on top of it). Omit or null to use the per-difficulty factor.'),
        reminders: z.array(Reminder).default([]),
      },
    },
    async (args) => {
      const task = await createTask(
        userId,
        args.title,
        args.difficulty as 'easy' | 'medium' | 'hard' | 'max',
        args.kind as 'todo' | 'daily',
        args.subtasks,
        {
          description: args.description ?? null,
          frequency: args.frequency as 'daily' | 'weekly' | 'monthly' | 'yearly',
          days_of_week: normalizeDaysOfWeek(args.days_of_week),
          every_n: args.every_n,
          start_date: args.start_date ?? null,
          window_days: args.window_days ?? 1,
          manual_reward_override: args.manual_reward_override ?? null,
          reminders: args.reminders,
        },
      );
      return json(task);
    },
  );

  server.registerTool(
    'quest_complete_task',
    {
      description: 'Mark a task complete and award coins. For dailies, optionally backdate via forDate.',
      inputSchema: {
        taskId: z.string(),
        forDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('YYYY-MM-DD; only valid for daily tasks'),
      },
    },
    async ({ taskId, forDate }) => {
      const result = await completeTask(userId, taskId, forDate ? { forDate } : undefined);
      if (!result) return text(`No task found for id '${taskId}'`);
      return json(result);
    },
  );

  server.registerTool(
    'quest_uncomplete_task',
    {
      description: 'Undo a task completion. Reverses the coin award.',
      inputSchema: { taskId: z.string() },
    },
    async ({ taskId }) => {
      const result = await uncompleteTask(userId, taskId);
      if (!result) return text(`No task found for id '${taskId}'`);
      return json(result);
    },
  );

  server.registerTool(
    'quest_delete_task',
    {
      description: 'Permanently delete a task. Coin awards already earned from it are NOT refunded.',
      inputSchema: { taskId: z.string() },
    },
    async ({ taskId }) => {
      const ok = await deleteTask(userId, taskId);
      return text(ok ? `Deleted task ${taskId}.` : `No task found for id '${taskId}'`);
    },
  );

  server.registerTool(
    'quest_get_balance',
    {
      description: 'Current coin balance and a recent slice of the ledger.',
      inputSchema: {
        ledgerLimit: z.number().int().min(0).max(200).default(20),
      },
    },
    async ({ ledgerLimit }) => {
      const [balance, ledger] = await Promise.all([getBalance(userId), getLedger(userId, ledgerLimit)]);
      return json({ balance, ledger });
    },
  );

  server.registerTool(
    'quest_get_state',
    {
      description: 'User health/max_health state — the survival-mode HP bar.',
      inputSchema: {},
    },
    async () => json(await getUserState(userId)),
  );

  server.registerTool(
    'quest_list_habits',
    {
      description: 'All habit counters (positive and negative) the user is tracking.',
      inputSchema: {},
    },
    async () => json(await listHabits(userId)),
  );

  server.registerTool(
    'quest_tap_habit',
    {
      description: 'Increment a habit in the positive or negative direction. Mirrors the +/− tap in the app.',
      inputSchema: {
        habitId: z.string(),
        direction: z.enum(['positive', 'negative']),
      },
    },
    async ({ habitId, direction }) => {
      const result = await tapHabit(userId, habitId, direction);
      if (!result) return text(`Habit '${habitId}' not found or does not allow ${direction} taps.`);
      return json(result);
    },
  );

  server.registerTool(
    'quest_list_rewards',
    {
      description: 'All rewards the user has defined and their costs.',
      inputSchema: {},
    },
    async () => json(await listRewards(userId)),
  );

  server.registerTool(
    'quest_spend_reward',
    {
      description: 'Spend coins on a reward. Fails if balance is insufficient or reward is not found.',
      inputSchema: { rewardId: z.string() },
    },
    async ({ rewardId }) => json(await spendOnReward(userId, rewardId)),
  );
}
