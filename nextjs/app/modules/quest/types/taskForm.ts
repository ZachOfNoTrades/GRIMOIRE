import { Difficulty, Frequency, RepeatMode, TaskKind } from "./task";

// The shape of the task create/edit form, shared by the pages that can open the editor
// (components/QuestTaskModal.tsx). Every field is the INPUT's own representation — numbers are
// strings so a half-typed value round-trips — and is normalised on save by whoever owns the submit.

export const DIFF_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  max: "Max",
};

export const FREQ_LABELS: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

// Difficulty → how many sparks the picker draws for it.
export const DIFF_SPARKS: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  max: 4,
};

// Local wall-clock today as YYYY-MM-DD.
export function localTodayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface ReminderDraft {
  fire_time: string;
  fire_date: string | null;
}

export interface DraftSubtask {
  id: string;
  title: string;
  done: boolean;
  isNew?: boolean;
}

export interface TaskFormState {
  kind: TaskKind;
  title: string;
  // Optional free-text notes/details for the task (empty string = no description).
  description: string;
  difficulty: Difficulty;
  frequency: Frequency;
  repeat_mode: RepeatMode;
  every_n: string;
  days_of_week: string[];
  start_date: string;
  // Completion grace window in days, as a string for the input ("1" = scheduled day only).
  window_days: string;
  // Whether the override toggle is on. Tracked separately from the value so clearing the input
  // (backspacing to "") doesn't untick the toggle and unmount the field mid-edit.
  reward_override_enabled: boolean;
  // Manual reward override as a string for the input. Ignored unless enabled; empty = no override.
  reward_override: string;
  subtasksDraft: DraftSubtask[];
  originalSubtasks: { id: string; done: boolean }[];
  newSubtaskInput: string;
  reminders: ReminderDraft[];
}

// Coin amounts are always shown to 2 decimals — typing "0.10" must not settle back to "0.1" when
// the field is re-rendered from state. Empty / unparseable input is left alone so the user can keep
// editing (and an emptied field still means "no override").
export function normalizeCoinInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : value;
}

// The task fields the editor reads. Structural so each page can keep its own Task interface.
export interface EditableTask {
  kind: TaskKind;
  title: string;
  description?: string | null;
  difficulty: Difficulty;
  frequency: Frequency;
  repeat_mode?: RepeatMode | null;
  every_n?: number;
  days_of_week?: string | null;
  start_date?: string | null;
  window_days?: number;
  manual_reward_override?: number | null;
  subtasks?: { id: string; title: string; done: boolean }[];
  reminders?: { fire_time: string; fire_date: string | null }[];
}

// A task → the editor's draft state.
export function taskToForm(t: EditableTask): TaskFormState {
  const subtasks = t.subtasks ?? [];
  return {
    kind: t.kind,
    title: t.title,
    description: t.description ?? "",
    difficulty: t.difficulty,
    frequency: t.frequency,
    repeat_mode: t.repeat_mode ?? "day_of_month",
    every_n: String(t.every_n ?? 1),
    days_of_week: t.days_of_week ? t.days_of_week.split(",").filter(Boolean) : [],
    start_date: t.start_date ?? "",
    window_days: String(t.window_days ?? 1),
    reward_override_enabled: t.manual_reward_override != null,
    reward_override: t.manual_reward_override != null ? t.manual_reward_override.toFixed(2) : "",
    subtasksDraft: subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done })),
    originalSubtasks: subtasks.map((s) => ({ id: s.id, done: s.done })),
    newSubtaskInput: "",
    reminders: (t.reminders ?? []).map((r) => ({ fire_time: r.fire_time, fire_date: r.fire_date })),
  };
}
