export type Difficulty = 'easy' | 'medium' | 'hard' | 'max';

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'max'];

export type TaskKind = 'todo' | 'daily';

export const TASK_KINDS: TaskKind[] = ['todo', 'daily'];

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
  last_bonus_date: string | null;
}

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly', 'yearly'];

export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export interface TaskReminder {
  id: string;
  task_id: string;
  // HH:MM, server-local (America/Chicago) wall-clock time the reminder fires.
  fire_time: string;
  // YYYY-MM-DD or null. When set, the reminder only fires on this exact date (intended for
  // todos). When null, the reminder fires on every day the parent task is "active today".
  fire_date: string | null;
  last_fired_date: string | null;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  // Optional free-text notes/details. title is the short label; description holds longer context
  // rendered as a muted sub-line on the task row. Null = none.
  description: string | null;
  difficulty: Difficulty;
  reward_value: number;
  // Manual reward override (persisted). When non-null it replaces the difficulty-derived base
  // reward — streak / age / bonus multipliers still build on it. Null = use the difficulty factor.
  manual_reward_override: number | null;
  streak_bonus: number;
  status: 'open' | 'done';
  kind: TaskKind;
  last_completed_date: string | null;
  done_today: boolean;
  frequency: Frequency;
  days_of_week: string | null;
  every_n: number;
  start_date: string | null;
  // Completion grace window in days: each scheduled occurrence stays completable for window_days
  // days from the occurrence date (1 = the scheduled day only). Applies to any frequency.
  window_days: number;
  // One-shot override: when set, this daily counts as scheduled for that date even if the
  // weekly cadence wouldn't otherwise include it. Used by the "carry to today" picker on freeze.
  deferred_to_date: string | null;
  subtasks: Subtask[];
  subtask_total: number;
  subtask_done: number;
  reminders: TaskReminder[];
  sort_order: number;
  streak_count: number;
  streak_last_date: string | null;
  last_bonus_date: string | null;
  neglect_count: number;
  neglect_last_date: string | null;
  ts_created: Date;
  ts_completed: Date | null;
  // Transient — set by server when this todo is today's random bonus task. Not persisted.
  todo_bonus_today?: boolean;
  todo_bonus_multiplier?: number;
}
