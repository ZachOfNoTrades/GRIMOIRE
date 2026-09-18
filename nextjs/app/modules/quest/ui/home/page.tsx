"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import toast, { Toaster } from "@/components/Toaster";
import {
  Coins,
  Plus,
  Check,
  Trash2,
  Target,
  Gift,
  Wallet,
  Settings,
  Sparkles,
  Heart,
  X,
  Minus,
  Repeat,
  ListTodo,
  GripVertical,
  Flame,
  Skull,
  SlidersHorizontal,
  Bell,
  Banknote,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CalendarClock,
  Snowflake,
  Dices,
  Quote,
  EllipsisVertical,
} from "lucide-react";
import {
  Difficulty,
  DIFFICULTY_ORDER,
  TaskKind,
  Frequency,
  FREQUENCIES,
  RepeatMode,
  repeatModeApplies,
  WEEKDAY_LETTERS,
  WEEKDAY_KEYS,
} from "../../types/task";
import {
  DEFAULT_FACTORS,
  DEFAULT_STREAK_FACTOR,
  DEFAULT_STREAK_CAP,
  DEFAULT_DAMAGE_FACTOR,
  DEFAULT_HEALTH_DAMAGE,
  DEFAULT_NEGLECT_FACTOR,
  DEFAULT_NEGLECT_CAP,
  QuestFactors,
  DifficultyMap,
} from "../../types/settings";
import { Habit } from "../../types/habit";
import { selectOnFocus, focusOnEnter, submitOnEnter } from "@/lib/inputBehavior";
import QuestCalendarWidget from "../../components/QuestCalendarWidget";
import QuestTaskModal from "../../components/QuestTaskModal";
import PopoverMenu from "@/components/PopoverMenu";
import QuestCalendarMenu from "../../components/QuestCalendarMenu";
import { CALENDAR_PREF_DEFAULTS, CalendarView, readCalendarPrefs, writeCalendarPrefs } from "../../lib/calendarPrefs";
import {
  DIFF_LABELS,
  FREQ_LABELS,
  DraftSubtask,
  ReminderDraft,
  TaskFormState,
  normalizeCoinInput,
  taskToForm,
} from "../../types/taskForm";
import { Debt } from "../../types/debt";
import { Mantra } from "../../types/mantra";
import { evaluateFormula } from "../../lib/formulaEvaluator";
import { DEFAULT_GAMBLE_WEEK_START_DAY, GAMBLE_COST_STEP, GAMBLE_DIE_SIDES, gambleCostForRoll, weekStartDayName } from "../../lib/gambleConfig";
import HelpButton from "@/components/ui/HelpButton";
import {
  addDays,
  parseYMD,
  isOccurrenceOn,
  activeOccurrenceStart,
  occurrenceWindowEnd,
} from "../../lib/scheduleClient";

interface Task {
  id: string;
  title: string;
  // Optional free-text notes/details, shown as a muted sub-line on the task row.
  description: string | null;
  difficulty: Difficulty;
  reward_value: number;
  // Manual reward override (persisted). Non-null replaces the difficulty-based base reward; null
  // means use the per-difficulty factor.
  manual_reward_override?: number | null;
  streak_bonus: number;
  status: "open" | "done";
  kind: TaskKind;
  sort_order: number;
  last_completed_date: string | null;
  done_today: boolean;
  frequency: Frequency;
  days_of_week: string | null;
  every_n: number;
  start_date: string | null;
  // Monthly / yearly calendar anchor. null = 'day_of_month' (every pre-existing task).
  repeat_mode: RepeatMode | null;
  // Completion grace window in days (1 = scheduled day only); applies to any frequency.
  window_days: number;
  deferred_to_date: string | null;
  subtasks: Subtask[];
  subtask_total: number;
  subtask_done: number;
  reminders: TaskReminder[];
  streak_count: number;
  streak_last_date: string | null;
  last_bonus_date: string | null;
  neglect_count: number;
  neglect_last_date: string | null;
  ts_created: string;
  ts_completed: string | null;
  todo_bonus_today?: boolean;
  todo_bonus_multiplier?: number;
}

interface Subtask {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
  last_bonus_date: string | null;
}

interface TaskReminder {
  id: string;
  task_id: string;
  fire_time: string;
  fire_date: string | null;
  last_fired_date: string | null;
}

interface Reward {
  id: string;
  name: string;
  cost: number;
}

interface UserState {
  health: number;
  max_health: number;
  last_damage_check_date: string | null;
}

interface DamageOutcome {
  state: UserState;
  damage_taken: number;
  died: boolean;
  coins_lost: number;
}

// ── Day-navigation (forage-timeline-style) types/helpers ─────────────────────────────────────
// A dated completion record from /api/tasks/completions — drives the day-view overlay when the
// user steps the home date stepper off today.
interface DayCompletion {
  task_id: string;
  completed_on: string;
  awarded: number;
  late: boolean;
}

// Per-occurrence state for a daily on the viewed day. Mirrors the calendar page's DayState.
type DayState = "done" | "missed" | "pending" | "upcoming" | "frozen";

const DAY_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Whole-day delta between two YYYY-MM-DD strings (toYMD − fromYMD).
function dayDeltaYMD(fromYMD: string, toYMD: string): number {
  return Math.round((parseYMD(toYMD).getTime() - parseYMD(fromYMD).getTime()) / 86400000);
}

// Forage-style relative label for the date stepper: a primary line (Today / Yesterday / Tomorrow
// or weekday) plus a secondary "Mon D" line for any non-today day.
function dayStepperLabel(today: string, date: string): { primary: string; secondary: string | null } {
  const d = parseYMD(date);
  const delta = dayDeltaYMD(today, date);
  const full = `${DAY_MONTH_LABELS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
  if (delta === 0) return { primary: "Today", secondary: null };
  if (delta === -1) return { primary: "Yesterday", secondary: full };
  if (delta === 1) return { primary: "Tomorrow", secondary: full };
  return { primary: DAY_WEEKDAY_LABELS[d.getDay()], secondary: full };
}

const DIFF_SPARKS: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  max: 4,
};

type TaskFilter = "all" | "daily" | "todo";

// User view preferences for the task list — which filter chip is selected and how the
// view-options popover toggles are set. Persisted per browser in localStorage so the list comes
// back the way the user left it instead of resetting to the "Dailies" default on every visit.
const QUEST_VIEW_PREFERENCES_KEY = "quest_view_prefs";

interface QuestViewPreferences {
  filter: TaskFilter;
  showCompletedDailies: boolean;
  showCompletedTodos: boolean;
  showAllDailies: boolean;
  moveCompletedToBottom: boolean;
  // Calendar: drop every-day tasks from the day cells so the weekly/monthly/yearly ones stand out.
  hideDailyTasksInCalendar: boolean;
}

const DEFAULT_VIEW_PREFERENCES: QuestViewPreferences = {
  filter: "daily",
  showCompletedDailies: true,
  showCompletedTodos: false,
  showAllDailies: false,
  moveCompletedToBottom: true,
  hideDailyTasksInCalendar: true,
};

// Read the saved preferences, falling back to the defaults for anything missing or malformed.
// Returns the defaults unchanged on the server (no localStorage) — the page renders its loading
// placeholder until the client has mounted, so this never causes a hydration mismatch.
function readViewPreferences(): QuestViewPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_VIEW_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(QUEST_VIEW_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_VIEW_PREFERENCES };
    const saved = JSON.parse(raw) as Partial<QuestViewPreferences>;
    const isValidFilter = (value: unknown): value is TaskFilter =>
      value === "all" || value === "daily" || value === "todo";
    const booleanOrDefault = (value: unknown, fallback: boolean) =>
      typeof value === "boolean" ? value : fallback;
    return {
      filter: isValidFilter(saved.filter) ? saved.filter : DEFAULT_VIEW_PREFERENCES.filter,
      showCompletedDailies: booleanOrDefault(saved.showCompletedDailies, DEFAULT_VIEW_PREFERENCES.showCompletedDailies),
      showCompletedTodos: booleanOrDefault(saved.showCompletedTodos, DEFAULT_VIEW_PREFERENCES.showCompletedTodos),
      showAllDailies: booleanOrDefault(saved.showAllDailies, DEFAULT_VIEW_PREFERENCES.showAllDailies),
      moveCompletedToBottom: booleanOrDefault(saved.moveCompletedToBottom, DEFAULT_VIEW_PREFERENCES.moveCompletedToBottom),
      hideDailyTasksInCalendar: booleanOrDefault(saved.hideDailyTasksInCalendar, DEFAULT_VIEW_PREFERENCES.hideDailyTasksInCalendar),
    };
  } catch {
    // ignore — invalid JSON just falls back to the defaults
    return { ...DEFAULT_VIEW_PREFERENCES };
  }
}

function localTodayYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Calendar yesterday relative to a given YYYY-MM-DD. Used by the previous-day review modal so
// the date math doesn't depend on the system clock once the page has resolved its effective today.
function previousYMD(ymd: string): string {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Calendar tomorrow relative to a given YYYY-MM-DD. Mirrors previousYMD; used by the freeze
// carry-over checklist to know which day a deferred task lands on (the server stamps
// deferred_to_date = freezeDate + 1, see freezeDayFunctions.ts), so we can hide tasks already
// scheduled on that target day instead of offering a redundant carry-over.
function nextYMD(ymd: string): string {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Grace-window scheduling helpers ──────────────────────────────────────────────────────────
// Mirror lib/taskFunctions.ts (isOccurrence / activeOccurrenceStart / isWindowSatisfied /
// occurrenceWindowEndingOn). Each scheduled occurrence stays completable for window_days days; one
// completion in that span satisfies it. Keep the two copies in sync (the client recomputes
// scheduling locally for instant filtering).
function fmtYMD(x: Date): string {
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function windowDaysClient(t: Task): number {
  const n = t.window_days ?? 1;
  return n >= 1 ? n : 1;
}

// Base-cadence occurrence test (no grace window, no deferred override). Mirrors lib isOccurrence.
function isOccurrenceRawClient(t: Task, ymd: string): boolean {
  const date = new Date(ymd + "T00:00:00");
  const everyN = t.every_n || 1;
  const startD = t.start_date ? new Date(t.start_date + "T00:00:00") : null;
  if (t.frequency === "daily") {
    if (t.days_of_week) {
      const wd = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getDay()];
      const allowed = t.days_of_week.split(",").map((s) => s.trim()).filter(Boolean);
      if (!allowed.includes(wd)) return false;
    }
    if (everyN > 1 && startD) {
      const days = Math.round((date.getTime() - startD.getTime()) / 86400000);
      return days >= 0 && days % everyN === 0;
    }
    return startD ? date >= startD : true;
  }
  if (t.frequency === "weekly") {
    if (!startD) return false;
    const days = Math.round((date.getTime() - startD.getTime()) / 86400000);
    return days >= 0 && days % (7 * everyN) === 0;
  }
  if (t.frequency === "monthly") {
    if (!startD) return false;
    if (date.getDate() !== startD.getDate()) return false;
    const monthsDiff = (date.getFullYear() - startD.getFullYear()) * 12 + (date.getMonth() - startD.getMonth());
    return monthsDiff >= 0 && monthsDiff % everyN === 0;
  }
  if (t.frequency === "yearly") {
    if (!startD) return false;
    if (date.getDate() !== startD.getDate() || date.getMonth() !== startD.getMonth()) return false;
    const yearsDiff = date.getFullYear() - startD.getFullYear();
    return yearsDiff >= 0 && yearsDiff % everyN === 0;
  }
  return true;
}

// Occurrence date whose grace window covers ymd, or null. Mirrors lib activeOccurrenceStart.
function activeOccurrenceStartClient(t: Task, ymd: string): string | null {
  const n = windowDaysClient(t);
  const base = new Date(ymd + "T00:00:00");
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const s = fmtYMD(d);
    if (isOccurrenceRawClient(t, s)) return s;
  }
  return null;
}

// True when a completion satisfies the grace window active on ymd (completed on/after its start).
function isWindowSatisfiedClient(t: Task, ymd: string): boolean {
  if (!t.last_completed_date) return false;
  const start = activeOccurrenceStartClient(t, ymd);
  return start !== null && t.last_completed_date >= start;
}

// Occurrence whose grace window ENDS on ymd (start = ymd-(window_days-1)), or null. Mirrors lib
// occurrenceWindowEndingOn — used by the review to surface a miss only on the window's final day.
function occurrenceWindowEndingOnClient(t: Task, ymd: string): string | null {
  const start = new Date(ymd + "T00:00:00");
  start.setDate(start.getDate() - (windowDaysClient(t) - 1));
  const s = fmtYMD(start);
  return isOccurrenceRawClient(t, s) ? s : null;
}

// sortRewards — mirrors listRewards()'s `ORDER BY cost ASC, name ASC`. The rewards list renders in
// array order, so an optimistic stand-in has to be inserted in the same slot the server row will
// occupy or the row visibly jumps when the background sync reconciles it.
function sortRewards(list: Reward[]): Reward[] {
  return [...list].sort(
    (a, b) => a.cost - b.cost || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

function blankTaskForm(kind: TaskKind): TaskFormState {
  return {
    kind,
    title: "",
    description: "",
    difficulty: "easy",
    frequency: kind === "daily" ? "daily" : "daily",
    repeat_mode: "day_of_month",
    every_n: "1",
    days_of_week: [],
    start_date: "",
    window_days: "1",
    reward_override_enabled: false,
    reward_override: "",
    subtasksDraft: [],
    originalSubtasks: [],
    newSubtaskInput: "",
    reminders: [],
  };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINAL_WORDS = ["first", "second", "third", "fourth", "fifth"];

// "3rd", "21st" — for the day-of-month label.
function ordinalNumber(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${n % 10 <= 3 ? suffix : "th"}`;
}

// Plain-English labels for the two calendar anchors, derived from the chosen start date so the
// options read as the actual schedule ("Repeats on the first Monday of every month") rather than
// abstract modes. Null start date = nothing to anchor to yet.
function repeatModeLabels(frequency: Frequency, startYMD: string): { day_of_month: string; nth_weekday: string } | null {
  if (!startYMD) return null;
  const d = new Date(`${startYMD}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const nth = ORDINAL_WORDS[Math.ceil(d.getDate() / 7) - 1] ?? "last";
  const weekday = WEEKDAY_NAMES[d.getDay()];
  if (frequency === "yearly") {
    const month = MONTH_NAMES[d.getMonth()];
    return {
      day_of_month: `On ${month} ${d.getDate()} every year`,
      nth_weekday: `On the ${nth} ${weekday} of ${month} every year`,
    };
  }
  return {
    day_of_month: `On the ${ordinalNumber(d.getDate())} of every month`,
    nth_weekday: `On the ${nth} ${weekday} of every month`,
  };
}

export default function QuestHomePage() {

  // DATA
  const [balance, setBalance] = useState<number>(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  // Visual-only daily streak counter per habit (localStorage-backed). Not persisted server-side
  // and has no effect on coins / health — purely a UI nudge.
  const [habitStreaks, setHabitStreaks] = useState<Record<string, { count: number; last_date: string }>>({});
  const [debts, setDebts] = useState<Debt[]>([]);
  // The one mantra picked for today (server-side, deterministic per user + date). Null when the
  // user hasn't added any mantras in settings.
  const [mantraOfDay, setMantraOfDay] = useState<Mantra | null>(null);
  // INPUT — debt creation form
  const [newDebtName, setNewDebtName] = useState("");
  const [newDebtAmount, setNewDebtAmount] = useState("");
  const [factors, setFactors] = useState<QuestFactors>({ ...DEFAULT_FACTORS });
  const [streakFactor, setStreakFactor] = useState<number>(DEFAULT_STREAK_FACTOR);
  const [streakCap, setStreakCap] = useState<number>(DEFAULT_STREAK_CAP);
  const [damageFactor, setDamageFactor] = useState<number>(DEFAULT_DAMAGE_FACTOR);
  const [healthDamage, setHealthDamage] = useState<DifficultyMap>({ ...DEFAULT_HEALTH_DAMAGE });
  const [neglectFactor, setNeglectFactor] = useState<number>(DEFAULT_NEGLECT_FACTOR);
  const [neglectCap, setNeglectCap] = useState<number>(DEFAULT_NEGLECT_CAP);
  const [advancedMode, setAdvancedMode] = useState<boolean>(false);
  const [dailyRewardFormula, setDailyRewardFormula] = useState<string | null>(null);
  const [todoRewardFormula, setTodoRewardFormula] = useState<string | null>(null);
  const [damageFormula, setDamageFormula] = useState<string | null>(null);
  const [simulationDate, setSimulationDate] = useState<string | null>(null);
  // Retro (late) completion settings — used by the day-view stepper to price/label past-day completes.
  const [retroEnabled, setRetroEnabled] = useState<boolean>(true);
  const [retroMultiplier, setRetroMultiplier] = useState<number>(0.5);
  const [retroLookbackDays, setRetroLookbackDays] = useState<number>(14);
  const [state, setState] = useState<UserState>({ health: 50, max_health: 50, last_damage_check_date: null });
  // The calendar's completion overlay, fetched with the initial batch and handed to the widget.
  const [calendarOverlay, setCalendarOverlay] = useState<{
    completions: { task_id: string; completed_on: string }[];
    frozenDays: Set<string>;
    from: string;
    to: string;
  } | null>(null);
  // The month the widget is showing, so we only hand it the overlay while it actually covers that
  // month — step outside the window and the widget goes back to fetching for itself.
  const [calendarAnchor, setCalendarAnchor] = useState<string>(() => localTodayYMD());

  // OPTIMISTIC CALENDAR OVERLAY — the widget draws done/missed from these dated completions, and it
  // does NOT fetch for itself while we supply them (see its `overlay` prop). Ticking a task off in
  // the list therefore has to write the same row here, or the calendar keeps showing the task as due
  // (and a todo, which only ever reaches a day cell as a completion, never shows up at all) until a
  // full page reload. Both helpers are no-ops before the first fetch lands or for a day outside the
  // loaded window — the widget falls back to its own fetch in that case.
  function addOverlayCompletion(taskId: string, day: string) {
    setCalendarOverlay((prev) => {
      if (!prev || day < prev.from || day > prev.to) return prev;
      if (prev.completions.some((c) => c.task_id === taskId && c.completed_on === day)) return prev;
      return { ...prev, completions: [...prev.completions, { task_id: taskId, completed_on: day }] };
    });
  }

  function removeOverlayCompletion(taskId: string, day: string) {
    setCalendarOverlay((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        completions: prev.completions.filter((c) => !(c.task_id === taskId && c.completed_on === day)),
      };
    });
  }

  // INPUT — the task-list view preferences seed from localStorage on first render (see
  // readViewPreferences) so the user's last selection is already applied before the first paint.
  const [filter, setFilter] = useState<TaskFilter>(() => readViewPreferences().filter);
  const [showCompletedDailies, setShowCompletedDailies] = useState(() => readViewPreferences().showCompletedDailies);
  const [showCompletedTodos, setShowCompletedTodos] = useState(() => readViewPreferences().showCompletedTodos);
  const [showAllDailies, setShowAllDailies] = useState(() => readViewPreferences().showAllDailies);
  const [moveCompletedToBottom, setMoveCompletedToBottom] = useState(() => readViewPreferences().moveCompletedToBottom);
  const [hideDailyTasksInCalendar, setHideDailyTasksInCalendar] = useState(() => readViewPreferences().hideDailyTasksInCalendar);
  // The calendar card's ⋮ view menu, and the view settings it drives — all persisted and shared
  // with the calendar page (see lib/calendarPrefs).
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false);
  const calendarMenuAnchor = useRef<HTMLButtonElement>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>(CALENDAR_PREF_DEFAULTS.calendarView);
  const [calendarWeekStart, setCalendarWeekStart] = useState<number>(CALENDAR_PREF_DEFAULTS.calendarWeekStart);

  // Restore them on mount (localStorage isn't readable during the server render).
  useEffect(() => {
    const prefs = readCalendarPrefs();
    setCalendarView(prefs.calendarView);
    setCalendarWeekStart(prefs.calendarWeekStart);
  }, []);

  function changeCalendarView(value: CalendarView) {
    setCalendarView(value);
    writeCalendarPrefs({ calendarView: value });
  }

  function changeCalendarWeekStart(value: number) {
    setCalendarWeekStart(value);
    writeCalendarPrefs({ calendarWeekStart: value });
  }

  function changeHideDailyTasksInCalendar(value: boolean) {
    setHideDailyTasksInCalendar(value);
    writeCalendarPrefs({ hideDailyTasksInCalendar: value });
  }
  const [taskForm, setTaskForm] = useState<TaskFormState | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  // Whether the task modal's collapsible "Advanced" scheduling section is expanded.
  const [taskAdvancedOpen, setTaskAdvancedOpen] = useState(false);
  const [newRewardName, setNewRewardName] = useState("");
  const [newRewardCost, setNewRewardCost] = useState<string>("");
  const [adhocAmount, setAdhocAmount] = useState<string>("");
  const [adhocNote, setAdhocNote] = useState("");

  // HABIT MODAL INPUT
  const [habitModalOpen, setHabitModalOpen] = useState(false);
  const [habitTitle, setHabitTitle] = useState("");
  const [habitDifficulty, setHabitDifficulty] = useState<Difficulty>("easy");
  const [habitAllowPositive, setHabitAllowPositive] = useState(true);
  const [habitAllowNegative, setHabitAllowNegative] = useState(true);
  // Manual reward override as a string for the input. Empty string = no override (use difficulty).
  const [habitRewardOverride, setHabitRewardOverride] = useState("");
  // Override toggle, kept apart from the value so backspacing the input to "" doesn't untick it.
  const [habitRewardOverrideEnabled, setHabitRewardOverrideEnabled] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);

  // STATE
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deathInfo, setDeathInfo] = useState<{ reason: string; coins_lost: number } | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"tasks" | "habits" | "rewards">("tasks");
  const [taskModalClosing, setTaskModalClosing] = useState(false);
  const [habitModalClosing, setHabitModalClosing] = useState(false);
  const [deathModalClosing, setDeathModalClosing] = useState(false);
  // GAMBLE-FOR-HEALTH (short rest) OVERLAY — pay coins to roll a d20 and recover HP.
  const [gambleOpen, setGambleOpen] = useState(false);
  const [gambleClosing, setGambleClosing] = useState(false);
  const [gambleRolling, setGambleRolling] = useState(false);
  // The number shown on the die — cycles randomly while rolling, then lands on the server's roll.
  const [gambleFace, setGambleFace] = useState<number>(GAMBLE_DIE_SIDES);
  // Result of the latest settled roll (null before the first roll of a session). roll = die value,
  // healed = HP actually restored (capped at the missing amount).
  const [gambleResult, setGambleResult] = useState<{ roll: number; healed: number } | null>(null);
  // Bumped on each roll so the die wrapper remounts and replays its settle animation every time,
  // even when two rolls land on the same number.
  const [gambleRollSeq, setGambleRollSeq] = useState(0);
  // Short rests already rolled this quest week — the server is authoritative (it resets on the
  // user's week-start day). Each one makes the next roll cost GAMBLE_COST_STEP more.
  const [gambleRollsThisWeek, setGambleRollsThisWeek] = useState(0);
  // Weekday the escalation resets on (0 = Sunday ... 6 = Saturday), from quest settings.
  const [gambleWeekStartDay, setGambleWeekStartDay] = useState(DEFAULT_GAMBLE_WEEK_START_DAY);
  const gambleCost = gambleCostForRoll(gambleRollsThisWeek);
  // Holds the face-cycling interval so it can be cleared if the component unmounts mid-roll.
  const gambleCycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [rewardTipHoverId, setRewardTipHoverId] = useState<string | null>(null);
  const [rewardTipPinnedId, setRewardTipPinnedId] = useState<string | null>(null);
  // Sum of costs for reward spends that are in flight (request sent, response not yet back).
  // A ref because it must be read synchronously inside spendReward, ahead of the next render —
  // the `disabled` prop alone can't stop two clicks fired before React re-renders in between.
  const pendingRewardSpendRef = useRef<number>(0);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  // DAY NAVIGATION (forage-timeline-style) — the date the Tasks card is showing. null == follow
  // today; an explicit YYYY-MM-DD pins the day-view. Stepping off today swaps the live task list
  // for a read/complete day-view backed by the dated completions API.
  const [viewDate, setViewDate] = useState<string | null>(null);
  const [dayCompletions, setDayCompletions] = useState<DayCompletion[]>([]);
  const [dayFrozen, setDayFrozen] = useState<boolean>(false);
  const [dayLoading, setDayLoading] = useState<boolean>(false);
  const [dayBusyId, setDayBusyId] = useState<string | null>(null);
  const [reviewDate, setReviewDate] = useState<string | null>(null);
  const [reviewClosing, setReviewClosing] = useState(false);
  // Snapshot of task ids that were incomplete-for-reviewDate when the modal opened. The modal
  // shows ONLY these — tasks completed on the previous day stay out of the review entirely.
  const [reviewInitialIds, setReviewInitialIds] = useState<Set<string> | null>(null);
  // Local-only checkbox state. Nothing is persisted until Done is clicked.
  const [reviewCheckedIds, setReviewCheckedIds] = useState<Set<string>>(new Set());
  // Subtasks ticked inside the review modal. Stored as `${taskId}:${subId}` for set semantics.
  const [reviewCheckedSubtaskIds, setReviewCheckedSubtaskIds] = useState<Set<string>>(new Set());
  // Currently expanded task in the review modal (one at a time, mirrors home page behavior).
  const [reviewExpandedTaskId, setReviewExpandedTaskId] = useState<string | null>(null);
  // Review date already auto-acknowledged because nothing carried over. The snapshot effect below
  // re-runs whenever `tasks` changes, so this guards against firing a second ack for the same day.
  const autoAckedReviewDateRef = useRef<string | null>(null);
  // Cache of the user's prior review submission keyed by review date. When clearTodayReview
  // re-pops the modal, this lets the checkboxes re-show as the user last left them so they can
  // simply re-acknowledge without re-ticking everything.
  const [reviewPriorSelections, setReviewPriorSelections] = useState<{
    date: string;
    taskIds: string[];
    subtasks: { taskId: string; subtaskId: string }[];
  } | null>(null);

  function animateCloseTaskModal() {
    if (submitting) return;
    setTaskModalClosing(true);
    setTimeout(() => {
      setTaskForm(null);
      setEditingTaskId(null);
      setTaskModalClosing(false);
    }, 180);
  }

  function animateCloseHabitModal() {
    if (submitting) return;
    setHabitModalClosing(true);
    setTimeout(() => {
      setHabitModalOpen(false);
      setEditingHabitId(null);
      setHabitModalClosing(false);
    }, 180);
  }

  function animateCloseDeathModal() {
    setDeathModalClosing(true);
    setTimeout(() => {
      setDeathInfo(null);
      setDeathModalClosing(false);
    }, 180);
  }

  // kind === 'habit' picks the daily formula at streak=0 (habits have no streak / age concept,
  // and the server reward for habits is the raw base — this just keeps the picker preview honest
  // about the "base" portion of a task with the same difficulty).
  function computedReward(d: Difficulty, kind: "daily" | "todo" | "habit" = "daily", age: number = 0): number {
    const baseStatic = Math.max(0, factors[d] ?? 0);
    if (!advancedMode) return baseStatic;
    if (kind === "todo") {
      if (!todoRewardFormula) return baseStatic;
      const v = evaluateFormula(todoRewardFormula, { base: baseStatic, streak: 0, neglect: 0, age, coins: balance });
      return v ?? baseStatic;
    }
    // daily + habit: total at streak=0 is just `base` for the canonical default; we still evaluate
    // so a user formula that uses `coins` etc. picks up the right baseline.
    if (!dailyRewardFormula) return baseStatic;
    const v = evaluateFormula(dailyRewardFormula, { base: baseStatic, streak: 0, neglect: 0, age: 0, coins: balance });
    return v ?? baseStatic;
  }

  function computedStreakBonus(base: number, streak: number): number {
    if (advancedMode && dailyRewardFormula) {
      const atZero = evaluateFormula(dailyRewardFormula, { base, streak: 0, neglect: 0, age: 0, coins: balance });
      const atCurrent = evaluateFormula(dailyRewardFormula, { base, streak, neglect: 0, age: 0, coins: balance });
      if (atZero !== null && atCurrent !== null) return Math.max(0, atCurrent - atZero);
    }
    if (streak <= 0 || streakFactor <= 0) return 0;
    return Math.max(0, base * Math.min(streak, streakCap) * streakFactor);
  }

  function isScheduledOn(t: Task, ymd: string): boolean {
    // Mirrors lib/taskFunctions.ts isOccurrenceOn(). Todos are not "scheduled" — return true so
    // they pass through this filter unchanged (kind filtering handles todos separately).
    if (t.kind !== "daily") return true;
    // One-shot carry-over: if the freeze flow stamped deferred_to_date for this YMD, treat it
    // as scheduled regardless of the regular cadence. Cleared on completion by completeTask.
    if (t.deferred_to_date === ymd) return true;
    // "Active" = ymd lies within some occurrence's grace window (window_days=1 ⇒ exactly the
    // base-cadence occurrence days).
    return activeOccurrenceStartClient(t, ymd) !== null;
  }

  async function refresh() {
    try {
      // The calendar's completion overlay only needs a date range, so it rides along with this batch
      // rather than waiting for the widget to mount after the page's loading placeholder clears —
      // that serialisation was a whole round trip before any task chip could render.
      const overlayFrom = addDays(localTodayYMD(), -100);
      const overlayTo = addDays(localTodayYMD(), 100);
      const [bRes, tRes, rRes, sRes, hRes, stRes, dRes, mRes, cRes] = await Promise.all([
        fetch("/modules/quest/api/balance"),
        fetch("/modules/quest/api/tasks"),
        fetch("/modules/quest/api/rewards"),
        fetch("/modules/quest/api/settings"),
        fetch("/modules/quest/api/habits"),
        fetch("/modules/quest/api/state"),
        fetch("/modules/quest/api/debts"),
        fetch("/modules/quest/api/mantras/today"),
        fetch(`/modules/quest/api/tasks/completions?from=${overlayFrom}&to=${overlayTo}`),
      ]);
      if (cRes.ok) {
        const c = await cRes.json();
        setCalendarOverlay({
          completions: Array.isArray(c?.completions) ? c.completions : [],
          frozenDays: new Set<string>(Array.isArray(c?.frozenDays) ? c.frozenDays : []),
          from: overlayFrom,
          to: overlayTo,
        });
      }
      if (bRes.ok) {
        const b = await bRes.json();
        setBalance(b.balance);
      }
      if (tRes.ok) setTasks(await tRes.json());
      if (rRes.ok) setRewards(await rRes.json());
      if (sRes.ok) {
        const s = await sRes.json();
        if (s.factors) setFactors(s.factors);
        if (typeof s.streakFactor === "number") setStreakFactor(s.streakFactor);
        if (typeof s.streakCap === "number") setStreakCap(s.streakCap);
        if (typeof s.damageFactor === "number") setDamageFactor(s.damageFactor);
        if (s.healthDamage) setHealthDamage(s.healthDamage);
        if (typeof s.neglectFactor === "number") setNeglectFactor(s.neglectFactor);
        if (typeof s.neglectCap === "number") setNeglectCap(s.neglectCap);
        setAdvancedMode(Boolean(s.advancedMode));
        setDailyRewardFormula(typeof s.dailyRewardFormula === "string" && s.dailyRewardFormula ? s.dailyRewardFormula : null);
        setTodoRewardFormula(typeof s.todoRewardFormula === "string" && s.todoRewardFormula ? s.todoRewardFormula : null);
        setDamageFormula(typeof s.damageFormula === "string" && s.damageFormula ? s.damageFormula : null);
        setSimulationDate(s.simulationDate ?? null);
        setRetroEnabled(Boolean(s.retroCompletionEnabled ?? true));
        setRetroMultiplier(Number(s.retroCompletionMultiplier ?? 0.5));
        setRetroLookbackDays(Number(s.retroLookbackDays ?? 14));
      }
      if (hRes.ok) setHabits(await hRes.json());
      if (dRes.ok) setDebts(await dRes.json());
      if (mRes.ok) {
        const m = await mRes.json();
        setMantraOfDay(m.mantra ?? null);
      }
      if (stRes.ok) {
        const data = await stRes.json();
        setState(data.state);
        // Short-rest price escalates per roll and resets with the quest week — always take the
        // server's count rather than assuming it's still whatever this tab last saw.
        setGambleRollsThisWeek(Number(data.gambleRollsThisWeek ?? 0));
        setGambleWeekStartDay(Number(data.gambleWeekStartDay ?? DEFAULT_GAMBLE_WEEK_START_DAY));
        // The state endpoint no longer applies damage inline — damage now runs when the user
        // acknowledges the previous-day review. The reviewPending flag drives the modal below.
        if (data.reviewPending && typeof data.today === "string") {
          setReviewDate(previousYMD(data.today));
        }
        // Pre-fill cache for the modal: only meaningful when the date matches, which the
        // snapshot effect below checks. Stored as-is so we don't lose subtask shape.
        if (data.reviewCompletion && typeof data.reviewCompletion.date === "string") {
          setReviewPriorSelections({
            date: data.reviewCompletion.date,
            taskIds: Array.isArray(data.reviewCompletion.taskIds) ? data.reviewCompletion.taskIds : [],
            subtasks: Array.isArray(data.reviewCompletion.subtasks) ? data.reviewCompletion.subtasks : [],
          });
        } else {
          setReviewPriorSelections(null);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // Hydrate visual habit streaks from localStorage.
    try {
      const raw = localStorage.getItem("quest_habit_streaks");
      if (raw) setHabitStreaks(JSON.parse(raw));
    } catch {
      // ignore — invalid JSON just starts empty
    }
  }, []);

  // Persist the task-list view preferences whenever the user changes a filter chip or a
  // view-options toggle, so the next visit restores the same selection.
  useEffect(() => {
    try {
      const preferences: QuestViewPreferences = {
        filter,
        showCompletedDailies,
        showCompletedTodos,
        showAllDailies,
        moveCompletedToBottom,
        hideDailyTasksInCalendar,
      };
      localStorage.setItem(QUEST_VIEW_PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      // ignore — a full/blocked localStorage just means preferences aren't remembered
    }
  }, [filter, showCompletedDailies, showCompletedTodos, showAllDailies, moveCompletedToBottom, hideDailyTasksInCalendar]);

  // Effective visual streak for a habit: shows the stored count only if the stored date is today.
  // Anything older renders as 0 — the count is a within-day tally that clears on the next day.
  function visualHabitStreak(habitId: string): number {
    const today = simulationDate ?? localTodayYMD();
    const s = habitStreaks[habitId];
    if (!s) return 0;
    if (s.last_date === today) return s.count;
    return 0;
  }

  // Finalize a review day that has nothing to review, without ever showing the modal. Hits the
  // same endpoint the Done button does, minus any backdated completions. Damage should always come
  // back null here (no missed occurrences); we still surface it if the server disagrees rather
  // than let HP drop unexplained. A failed ack clears the guard so a later render can retry.
  async function autoAcknowledgeEmptyReview(forDate: string) {
    try {
      const res = await fetch("/modules/quest/api/state/acknowledge-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forDate, completedTaskIds: [], completedSubtasks: [] }),
      });
      if (!res.ok) {
        autoAckedReviewDateRef.current = null;
        return;
      }
      const data = await res.json();
      if (data.state) setState(data.state);
      const dmg = Number(data.damage?.damage_taken ?? 0);
      if (dmg > 0 && !data.damage?.died) {
        toast.error(`−${dmg} HP from missed dailies`);
      }
      if (data.damage?.died) {
        setDeathInfo({ reason: "missed dailies", coins_lost: data.damage.coins_lost });
      }
      setReviewDate(null);
    } catch {
      autoAckedReviewDateRef.current = null;
    }
  }

  // Snapshot the set of tasks that were incomplete-for-reviewDate at the moment the modal opens.
  // Subsequent re-renders of the modal use this frozen list so completed-yesterday tasks never
  // appear, and items the user toggles inside the modal don't get re-filtered out.
  useEffect(() => {
    if (!reviewDate || reviewInitialIds || loading) return;
    const ids = new Set(
      tasks
        .filter((t) => {
          if (t.kind !== "daily") return false;
          // A grace-window occurrence should only surface as "missed" on its FINAL day (the last
          // chance to complete it) and only if nothing satisfied the window. The occurrence whose
          // window ends on reviewDate starts at reviewDate-(window_days-1); for window_days=1 this
          // is exactly "scheduled on reviewDate and not completed by then".
          const occStart = occurrenceWindowEndingOnClient(t, reviewDate);
          if (occStart === null) return false;
          return (t.last_completed_date ?? "") < occStart;
        })
        .map((t) => t.id)
    );
    // NOTHING CARRIED OVER — every daily scheduled for the review day was already complete, so the
    // modal would render an empty list whose only action is "Done". Acknowledge it silently instead
    // of forcing the user to dismiss an empty dialog. Safe: the server's damage check counts the
    // same occurrences this snapshot just found none of, so no HP can be lost unseen (and
    // autoAcknowledgeEmptyReview still surfaces damage if the server ever disagrees).
    if (ids.size === 0) {
      if (autoAckedReviewDateRef.current !== reviewDate) {
        autoAckedReviewDateRef.current = reviewDate;
        void autoAcknowledgeEmptyReview(reviewDate);
      }
      return;
    }
    setReviewInitialIds(ids);
    // Pre-fill the checkbox sets from the prior review submission when the cached date
    // matches this modal's review date — i.e. when a debug clearTodayReview just re-popped the
    // modal for the same yesterday. We intersect with `ids` so deleted-since tasks don't leave
    // phantom IDs in the set. Outside this initial snapshot, the user's in-modal toggles win.
    if (reviewPriorSelections && reviewPriorSelections.date === reviewDate) {
      const taskIds = new Set(reviewPriorSelections.taskIds.filter((id) => ids.has(id)));
      setReviewCheckedIds(taskIds);
      const subKeys = new Set(
        reviewPriorSelections.subtasks
          .filter((s) => ids.has(s.taskId))
          .map((s) => `${s.taskId}:${s.subtaskId}`)
      );
      setReviewCheckedSubtaskIds(subKeys);
    }
  }, [reviewDate, reviewInitialIds, loading, tasks, reviewPriorSelections]);

  const { visibleTasks, offScheduleIds } = useMemo(() => {
    const todayStr = simulationDate ?? localTodayYMD();
    // Precompute off-schedule daily set so we only call isScheduledOn once per task
    const offSchedule = new Set<string>();
    for (const t of tasks) {
      if (t.kind === "daily" && !isScheduledOn(t, todayStr)) offSchedule.add(t.id);
    }
    let list = tasks.slice().sort((a, b) => a.sort_order - b.sort_order);
    if (filter === "daily") list = list.filter((t) => t.kind === "daily");
    else if (filter === "todo") list = list.filter((t) => t.kind === "todo");
    // Schedule filter: when showAllDailies is off, hide off-schedule dailies entirely. When on,
    // off-schedule dailies remain visible but get sorted to the bottom and muted in render.
    if (!showAllDailies) {
      list = list.filter((t) => !offSchedule.has(t.id));
    }
    // Per-kind completed filters: dailies and todos each have their own toggle. Completed todos
    // are always restricted to ones finished on the current (local) day — anything completed
    // before today is filtered out regardless of the toggle.
    list = list.filter((t) => {
      if (t.kind === "todo") {
        if (t.status !== "done") return true;
        const completedOn = t.ts_completed ? t.ts_completed.slice(0, 10) : null;
        if (completedOn !== todayStr) return false;
        return true;
      }
      // daily
      if (!t.done_today) return true;
      return showCompletedDailies;
    });
    // Sort buckets: off-schedule always at bottom. Completed-vs-incomplete bucketing is gated
    // by `moveCompletedToBottom` — when off, checked items stay inline at their sort_order.
    list.sort((a, b) => {
      const aOff = offSchedule.has(a.id) ? 1 : 0;
      const bOff = offSchedule.has(b.id) ? 1 : 0;
      if (aOff !== bOff) return aOff - bOff;
      const aDone = a.kind === "daily" ? (a.done_today ? 1 : 0) : (a.status === "done" ? 1 : 0);
      const bDone = b.kind === "daily" ? (b.done_today ? 1 : 0) : (b.status === "done" ? 1 : 0);
      if (filter === "all") {
        // Bucket: 0 = incomplete daily, 1 = incomplete todo, 2 = completed daily, 3 = completed todo
        const aBucket = aDone ? (a.kind === "daily" ? 2 : 3) : (a.kind === "daily" ? 0 : 1);
        const bBucket = bDone ? (b.kind === "daily" ? 2 : 3) : (b.kind === "daily" ? 0 : 1);
        if (aBucket !== bBucket) return aBucket - bBucket;
      } else if (moveCompletedToBottom) {
        if (aDone !== bDone) return aDone - bDone;
      }
      return a.sort_order - b.sort_order;
    });
    return { visibleTasks: list, offScheduleIds: offSchedule };
  }, [tasks, filter, showCompletedDailies, showCompletedTodos, showAllDailies, simulationDate, moveCompletedToBottom]);

  // ── DAY NAVIGATION derived state ──────────────────────────────────────────────────────────────
  // The effective "today" (honors the debug simulation date) and the day the stepper is showing.
  // While viewing today the existing live task list renders unchanged; any other day swaps in the
  // read/complete day-view below.
  const effectiveToday = simulationDate ?? localTodayYMD();
  const effectiveViewDate = viewDate ?? effectiveToday;
  const isViewingToday = effectiveViewDate === effectiveToday;
  const viewDateLabel = dayStepperLabel(effectiveToday, effectiveViewDate);

  // Fetch the dated completion overlay (and frozen flag) for the viewed day whenever it changes off
  // today. Today needs no fetch — the live tasks already carry done_today.
  useEffect(() => {
    if (isViewingToday) {
      setDayCompletions([]);
      setDayFrozen(false);
      return;
    }
    let cancelled = false;
    setDayLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/modules/quest/api/tasks/completions?from=${effectiveViewDate}&to=${effectiveViewDate}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setDayCompletions(Array.isArray(data?.completions) ? data.completions : []);
        setDayFrozen(Array.isArray(data?.frozenDays) ? data.frozenDays.includes(effectiveViewDate) : false);
      } catch {
        // best-effort — the day-view still renders the schedule without the overlay
      } finally {
        if (!cancelled) setDayLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveViewDate, isViewingToday]);

  // The dailies scheduled on the viewed day, each tagged with its occurrence state (done/missed/
  // pending/upcoming/frozen) and any recorded award. Mirrors the calendar page's dailiesForDay.
  const dayDailies = useMemo(() => {
    if (isViewingToday) return [];
    const day = effectiveViewDate;
    const byTask = new Map<string, DayCompletion[]>();
    for (const c of dayCompletions) {
      const list = byTask.get(c.task_id) ?? [];
      list.push(c);
      byTask.set(c.task_id, list);
    }
    const out: { task: Task; state: DayState; awarded: number | null; late: boolean }[] = [];
    for (const t of tasks) {
      if (t.kind !== "daily") continue;
      if (!isOccurrenceOn(t, day)) continue;
      const occStart = activeOccurrenceStart(t, day) ?? day;
      const windowEnd = occurrenceWindowEnd(t, day) ?? day;
      const recs = byTask.get(t.id) ?? [];
      const doneRec = recs.find((c) => c.completed_on >= occStart && c.completed_on <= windowEnd);
      let dayState: DayState;
      if (doneRec) dayState = "done";
      else if (dayFrozen) dayState = "frozen";
      else if (windowEnd < effectiveToday) dayState = "missed";
      else if (day > effectiveToday) dayState = "upcoming";
      else dayState = "pending";
      out.push({ task: t, state: dayState, awarded: doneRec ? doneRec.awarded : null, late: doneRec ? doneRec.late : false });
    }
    // Stable order: incomplete first, then by sort_order — keeps the day's outstanding work on top.
    return out.sort((a, b) => {
      const aDone = a.state === "done" ? 1 : 0;
      const bDone = b.state === "done" ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return a.task.sort_order - b.task.sort_order;
    });
  }, [isViewingToday, effectiveViewDate, effectiveToday, dayCompletions, dayFrozen, tasks]);

  // Todos completed on the viewed day (read-only history — todos carry no schedule of their own).
  const dayTodos = useMemo(() => {
    if (isViewingToday) return [];
    const byId = new Map(tasks.map((t) => [t.id, t]));
    return dayCompletions
      .filter((c) => c.completed_on === effectiveViewDate && byId.get(c.task_id)?.kind === "todo")
      .map((c) => ({ title: byId.get(c.task_id)?.title ?? "Todo", awarded: c.awarded }));
  }, [isViewingToday, effectiveViewDate, dayCompletions, tasks]);

  // Whether a past-day missed daily can still be credited (retro on + within the lookback window).
  const withinRetroLookback = (day: string) => day >= addDays(effectiveToday, -retroLookbackDays);

  // Step the viewed day by ±1. Stepping back onto today collapses to the live list (viewDate=null).
  function stepViewDate(delta: number) {
    const next = addDays(effectiveViewDate, delta);
    setViewDate(next === effectiveToday ? null : next);
  }

  // Complete a daily for the viewed (non-today) day. The server prices it — full when still on-time,
  // reduced when its grace window has closed — and records the dated completion. Then refetch the
  // overlay plus the live balance/tasks so today's HUD and streaks stay consistent.
  async function completeForViewDate(task: Task, day: string) {
    setDayBusyId(task.id);
    try {
      const res = await fetch(`/modules/quest/api/tasks/${task.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: day }),
      });
      if (!res.ok) throw new Error("Failed to complete");
      const data = await res.json();
      const awarded = Number(data?.awarded ?? 0);
      if (awarded > 0) {
        toast.success(`+${awarded.toFixed(2)} coins`);
        setBalance((b) => b + awarded);
      } else {
        toast("Already credited", { icon: "✓" });
      }
      // Refetch the day overlay so the row flips to done, and resync the rest of the page.
      try {
        const ovRes = await fetch(`/modules/quest/api/tasks/completions?from=${day}&to=${day}`);
        if (ovRes.ok) {
          const ov = await ovRes.json();
          setDayCompletions(Array.isArray(ov?.completions) ? ov.completions : []);
          setDayFrozen(Array.isArray(ov?.frozenDays) ? ov.frozenDays.includes(day) : false);
        }
      } catch {
        // overlay refresh is best-effort
      }
      refresh();
    } catch {
      toast.error("Could not complete");
    } finally {
      setDayBusyId(null);
    }
  }

  // DRAG STATE
  const [dragId, setDragId] = useState<string | null>(null);
  // `insertAt` is the index in the "visibleTasks with source removed" list where the source
  // would land if released. Computed from the dragged center vs fixed snapshot of row centers,
  // not from pointer position vs current (animating) rects — that's what causes the glitch.
  const [insertAt, setInsertAt] = useState<number>(-1);

  async function commitReorder(orderedIds: string[]) {
    setTasks((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]));
      const updated = orderedIds
        .map((id, i) => {
          const t = byId.get(id);
          return t ? { ...t, sort_order: (i + 1) * 10 } : null;
        })
        .filter((t): t is Task => t !== null);
      const visibleSet = new Set(orderedIds);
      const untouched = prev.filter((t) => !visibleSet.has(t.id));
      return [...updated, ...untouched];
    });
    try {
      await fetch("/modules/quest/api/tasks/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: orderedIds }),
      });
    } catch (e) {
      console.error(e);
      refresh();
    }
  }

  // Pointer Events-based drag so reorder works on mobile (touch) as well as desktop (mouse). The
  // native HTML5 DnD API does not fire on touch devices. `touch-action: none` on the handle keeps
  // the browser from hijacking the gesture for scroll.
  const dragIdRef = useRef<string | null>(null);
  const insertAtRef = useRef<number>(-1);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragBoundsRef = useRef<{ minY: number; maxY: number } | null>(null);
  // Snapshot of each row's untransformed center Y + bucket at drag-start. `group` is 0 for
  // on-schedule incomplete, 1 for on-schedule done, 2 for off-schedule. While dragging we
  // clamp insertAt to the source's group so the reorder animation never visually crosses
  // a bucket boundary the sort comparator would just snap back.
  const positionsRef = useRef<Array<{ id: string; centerY: number; group: number }>>([]);
  const dragGroupRangeRef = useRef<{ min: number; max: number } | null>(null);
  const ulRef = useRef<HTMLUListElement | null>(null);
  const [sourceHeight, setSourceHeight] = useState<number>(0);
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  function onHandlePointerDown(e: React.PointerEvent, id: string) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const li = (e.currentTarget as HTMLElement).closest("[data-task-id]") as HTMLElement | null;
    const ul = ulRef.current;
    if (li && ul) {
      const liRect = li.getBoundingClientRect();
      const ulRect = ul.getBoundingClientRect();
      dragBoundsRef.current = {
        minY: ulRect.top - liRect.top,
        maxY: ulRect.bottom - liRect.bottom,
      };
      setSourceHeight(liRect.height + 8);
      // Snapshot all visible row centers in viewport coords, in DOM order, with bucket tag.
      // Mirrors the `visibleTasks` comparator exactly — a clamp that disagrees with the render
      // order lets a row be dropped in a slot the comparator immediately snaps back, committing a
      // persisted move the user never sees. Off-schedule is the outermost key (always bottom);
      // under the "all" filter dailies and todos are separate bands as well.
      const groupOf = (task: Task | undefined): number => {
        if (!task) return 0;
        if (offScheduleIds.has(task.id)) return 9;
        const done = task.kind === "daily" ? task.done_today : task.status === "done";
        if (filter === "all") return (done ? 2 : 0) + (task.kind === "daily" ? 0 : 1);
        if (!moveCompletedToBottom) return 0;
        return done ? 1 : 0;
      };
      const lis = ul.querySelectorAll<HTMLElement>("[data-task-id]");
      positionsRef.current = Array.from(lis).map((el) => {
        const r = el.getBoundingClientRect();
        const tid = el.dataset.taskId ?? "";
        return { id: tid, centerY: r.top + r.height / 2, group: groupOf(tasks.find((t) => t.id === tid)) };
      });
      // Compute the source's allowed insertAt range so we can clamp the gesture to its bucket.
      // Off-schedule always clamps (separate concept); completed/incomplete clamps only when
      // the toggle is on (handled via groupOf above).
      const withoutSource = positionsRef.current.filter((p) => p.id !== id);
      const sourceGroup = positionsRef.current.find((p) => p.id === id)?.group ?? 0;
      let minIdx = 0;
      let maxIdx = withoutSource.length;
      for (let i = 0; i < withoutSource.length; i++) {
        if (withoutSource[i].group < sourceGroup) minIdx = i + 1;
        if (withoutSource[i].group > sourceGroup && i < maxIdx) maxIdx = i;
      }
      dragGroupRangeRef.current = { min: minIdx, max: maxIdx };
    } else {
      dragBoundsRef.current = null;
      positionsRef.current = [];
      dragGroupRangeRef.current = null;
      setSourceHeight(0);
    }
    dragIdRef.current = id;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setDragDelta({ x: 0, y: 0 });
    setDragId(id);
    // Initialize insertAt to the source's own position so no neighbor shift on grab.
    const sourceIdxInWithoutSource = positionsRef.current.findIndex((p) => p.id === id);
    insertAtRef.current = sourceIdxInWithoutSource;
    setInsertAt(sourceIdxInWithoutSource);

    const recomputeInsertAt = (dy: number) => {
      const positions = positionsRef.current;
      const sourcePos = positions.find((p) => p.id === dragIdRef.current);
      if (!sourcePos) return;
      const draggedCenterY = sourcePos.centerY + dy;
      let count = 0;
      for (const p of positions) {
        if (p.id === dragIdRef.current) continue;
        if (p.centerY < draggedCenterY) count++;
      }
      const range = dragGroupRangeRef.current;
      if (range) count = Math.max(range.min, Math.min(range.max, count));
      if (count !== insertAtRef.current) {
        insertAtRef.current = count;
        setInsertAt(count);
      }
    };

    const onMove = (ev: PointerEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const rawDy = ev.clientY - start.y;
      const b = dragBoundsRef.current;
      const dy = b ? Math.max(b.minY, Math.min(b.maxY, rawDy)) : rawDy;
      setDragDelta({ x: 0, y: dy });
      // Use the unclamped delta for insertion math — the visual clamp keeps the floater inside
      // the container, but the user's intent (overshoot down to drop at the very end, or
      // overshoot up to drop at the very start) should still register.
      recomputeInsertAt(rawDy);
    };
    const finish = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      const sourceId = dragIdRef.current;
      const finalInsertAt = insertAtRef.current;
      const positions = positionsRef.current;
      dragIdRef.current = null;
      insertAtRef.current = -1;
      dragStartRef.current = null;
      dragBoundsRef.current = null;
      positionsRef.current = [];
      dragGroupRangeRef.current = null;
      setDragId(null);
      setInsertAt(-1);
      setSourceHeight(0);
      setDragDelta({ x: 0, y: 0 });
      if (!sourceId || finalInsertAt < 0) return;
      const sourceOriginalIdx = positions.findIndex((p) => p.id === sourceId);
      if (sourceOriginalIdx === -1) return;
      if (finalInsertAt === sourceOriginalIdx) return;
      // The visible list is a RE-BUCKETED projection of the persisted order, not a subsequence of
      // it: completed rows sink to the bottom, off-schedule dailies below those, and under the
      // "all" filter dailies band above todos. Weaving the whole visible list back into the
      // sort_order slots therefore rewrote EVERY task's rank to match today's transient
      // completion/schedule state — so dragging one daily silently re-ranked the others and the
      // list came back shuffled the next day. Move only the task the user actually dragged:
      // anchor it to the neighbour it was dropped next to and splice it in beside that same
      // neighbour in the persisted order, leaving every other rank untouched.
      // Anchor against same-KIND neighbours only. The visible list also HIDES rows — off-schedule
      // dailies, dailies already done today, todos completed before today — and every hidden row
      // keeps its persisted rank. Anchoring to the nearest visible row of any kind therefore left
      // hidden rows sitting above the drop point: dropping a daily at the top of the list only
      // lifted it above the first *visible* daily, so the next time an off-schedule daily came
      // back around it resurfaced ABOVE the task the user had just moved up and the same tasks
      // sank again — the list looked like it kept re-indexing itself. Kind is the only band that
      // survives the day; completion and schedule state are transient.
      const visibleIds = positions.map((p) => p.id);
      const withoutSource = visibleIds.filter((vid) => vid !== sourceId);
      const taskById = new Map(tasks.map((t) => [t.id, t]));
      const sourceKind = taskById.get(sourceId)?.kind;
      if (!sourceKind) return;
      const isSameKind = (id: string) => taskById.get(id)?.kind === sourceKind;
      // Nearest visible task of the same kind above / below the drop point.
      let prevSameKindId: string | null = null;
      for (let i = finalInsertAt - 1; i >= 0; i--) {
        if (isSameKind(withoutSource[i])) { prevSameKindId = withoutSource[i]; break; }
      }
      let nextSameKindId: string | null = null;
      for (let i = finalInsertAt; i < withoutSource.length; i++) {
        if (isSameKind(withoutSource[i])) { nextSameKindId = withoutSource[i]; break; }
      }
      const newAllIds = tasks
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((t) => t.id)
        .filter((id) => id !== sourceId);
      let insertIdx: number;
      if (prevSameKindId) {
        // Sits directly below the nearest visible task of its kind, leaving every other rank alone.
        insertIdx = newAllIds.indexOf(prevSameKindId) + 1;
        if (insertIdx === 0) return;
      } else if (nextSameKindId) {
        // Dropped at the top of its band — go above EVERY task of its kind, hidden ones included,
        // not merely above the first one that happens to be visible today.
        insertIdx = newAllIds.findIndex(isSameKind);
        if (insertIdx === -1) return;
      } else {
        // Nothing of this kind to sit beside — leave the persisted order alone rather than
        // arbitrarily sending it to the end.
        return;
      }
      newAllIds.splice(insertIdx, 0, sourceId);
      commitReorder(newAllIds);
    };
    const cancel = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      dragIdRef.current = null;
      insertAtRef.current = -1;
      dragStartRef.current = null;
      dragBoundsRef.current = null;
      positionsRef.current = [];
      dragGroupRangeRef.current = null;
      setDragId(null);
      setInsertAt(-1);
      setSourceHeight(0);
      setDragDelta({ x: 0, y: 0 });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
  }

  function openCreateTaskModal(kind: TaskKind) {
    setError(null);
    setEditingTaskId(null);
    setTaskAdvancedOpen(false);
    setTaskForm(blankTaskForm(kind));
  }

  function openEditTaskModal(t: Task) {
    setError(null);
    setEditingTaskId(t.id);
    // Auto-expand Advanced when the task already uses a non-default value there.
    setTaskAdvancedOpen((t.window_days ?? 1) > 1);
    setTaskForm(taskToForm(t));
  }

  // Blank task form scheduled on a calendar day (double-click on a day cell). Opens as a daily —
  // the modal's kind toggle switches it to a todo, which keeps the same start date as its scheduled
  // day rather than a cadence.
  function openCreateTaskModalOnDate(date: string) {
    setError(null);
    setEditingTaskId(null);
    setTaskAdvancedOpen(false);
    setTaskForm({ ...blankTaskForm("daily"), start_date: date });
  }

  // Same edit modal as the Tasks card, addressed by id — the calendar hands back a task id from a
  // day cell rather than the task object.
  function openEditTaskModalById(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    openEditTaskModal(task);
  }

  function closeTaskModal() {
    animateCloseTaskModal();
  }

  async function submitTaskForm() {
    if (!taskForm) return;
    const title = taskForm.title.trim();
    if (!title) return;
    setError(null);
    // Grace window: at least 1 day (1 = must complete on the scheduled day).
    const windowDays = Math.max(1, Number(taskForm.window_days) || 1);
    // Manual reward override: empty input = null (use difficulty); a finite >=0 number sets it.
    const overrideTrimmed = taskForm.reward_override_enabled ? taskForm.reward_override.trim() : "";
    const overrideNum = overrideTrimmed === "" ? null : Number(overrideTrimmed);
    const manualReward = overrideNum != null && Number.isFinite(overrideNum) && overrideNum >= 0 ? overrideNum : null;
    // Description: trim; empty string sends null (no description).
    const descriptionTrimmed = taskForm.description.trim();
    const description = descriptionTrimmed === "" ? null : descriptionTrimmed;
    const payload: Record<string, unknown> = {
      title,
      description,
      difficulty: taskForm.difficulty,
      kind: taskForm.kind,
      frequency: taskForm.frequency,
      every_n: Number(taskForm.every_n) || 1,
      days_of_week: taskForm.days_of_week.length > 0 ? taskForm.days_of_week.join(",") : null,
      start_date: taskForm.start_date || null,
      // Only monthly / yearly carry a calendar anchor; the API stores NULL for the rest.
      repeat_mode: repeatModeApplies(taskForm.frequency) ? taskForm.repeat_mode : null,
      window_days: windowDays,
      manual_reward_override: manualReward,
      reminders: taskForm.reminders,
    };

    if (editingTaskId) {
      // OPTIMISTIC EDIT — apply locally, close modal, sync in background
      const targetId = editingTaskId;
      const draft = taskForm.subtasksDraft;
      const original = taskForm.originalSubtasks;
      const newSubs: Subtask[] = draft.map((s, i) => ({
        id: s.id,
        task_id: targetId,
        title: s.title,
        done: s.done,
        position: i,
        last_bonus_date: null,
      }));
      // Override (when set) replaces the difficulty-derived base reward in the optimistic view.
      const reward = manualReward != null ? manualReward : computedReward(taskForm.difficulty, taskForm.kind);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === targetId
            ? {
                ...t,
                title,
                description,
                difficulty: taskForm.difficulty,
                kind: taskForm.kind,
                frequency: taskForm.frequency,
                every_n: Number(taskForm.every_n) || 1,
                days_of_week: payload.days_of_week as string | null,
                start_date: (payload.start_date as string | null) ?? null,
                repeat_mode: payload.repeat_mode as RepeatMode | null,
                window_days: windowDays,
                manual_reward_override: manualReward,
                reward_value: reward,
                subtasks: newSubs,
                subtask_total: newSubs.length,
                subtask_done: newSubs.filter((s) => s.done).length,
              }
            : t,
        ),
      );
      animateCloseTaskModal();
      // BACKGROUND SYNC
      (async () => {
        try {
          const res = await fetch(`/modules/quest/api/tasks/${targetId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error();
          const draftIds = new Set(draft.filter((s) => !s.isNew).map((s) => s.id));
          const removed = original.filter((o) => !draftIds.has(o.id));
          const added = draft.filter((s) => s.isNew);
          const toggled = draft.filter((s) => {
            if (s.isNew) return false;
            const orig = original.find((o) => o.id === s.id);
            return orig && orig.done !== s.done;
          });
          // Deletes/toggles have stable ids and run in parallel. Adds return server ids we need to
          // map back to their temp draft ids so the reorder call below can place them correctly.
          const [, , addedResults] = await Promise.all([
            Promise.all(
              removed.map((s) =>
                fetch(`/modules/quest/api/tasks/${targetId}/subtasks/${s.id}`, { method: "DELETE" }),
              ),
            ),
            Promise.all(
              toggled.map((s) =>
                fetch(`/modules/quest/api/tasks/${targetId}/subtasks/${s.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ done: s.done }),
                }),
              ),
            ),
            Promise.all(
              added.map(async (s) => {
                const r = await fetch(`/modules/quest/api/tasks/${targetId}/subtasks`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: s.title }),
                });
                if (!r.ok) return null;
                const created = await r.json();
                return { temp: s.id, real: created.id as string };
              }),
            ),
          ]);
          // PERSIST CHECKLIST ORDER — build the full ordered id list from the draft (temp ids swapped
          // for their created server ids) so drag-reordering of both existing and new items sticks.
          const tempToReal = new Map<string, string>();
          for (const x of addedResults) if (x) tempToReal.set(x.temp, x.real);
          const orderedIds = draft
            .map((s) => (s.isNew ? tempToReal.get(s.id) : s.id))
            .filter((x): x is string => typeof x === "string");
          if (orderedIds.length > 0) {
            await fetch(`/modules/quest/api/tasks/${targetId}/subtasks/reorder`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: orderedIds }),
            });
          }
          refresh();
        } catch {
          refresh();
        }
      })();
      return;
    }

    // OPTIMISTIC CREATE — paint the new task and close the modal now, POST in the background.
    // Mirrors addSubtaskInline: a `tmp-` row stands in until the server row replaces it, and a
    // failed POST pulls the row back out (see the background sync below).
    payload.subtasks = taskForm.subtasksDraft.map((s) => s.title);
    const tempId = `tmp-${Date.now()}-${Math.random()}`;
    const kind = taskForm.kind;
    // Mirrors createTask()'s placement: todos prepend (MIN - 10), dailies append (MAX + 10).
    const orders = tasks.map((t) => t.sort_order);
    const optimisticOrder = kind === "todo"
      ? (orders.length > 0 ? Math.min(...orders) : 0) - 10
      : (orders.length > 0 ? Math.max(...orders) : 0) + 10;
    // Override (when set) replaces the difficulty-derived base reward in the optimistic view.
    const optimisticReward = manualReward != null ? manualReward : computedReward(taskForm.difficulty, kind);
    const optimisticSubtasks: Subtask[] = taskForm.subtasksDraft.map((s, i) => ({
      id: `${tempId}-sub-${i}`,
      task_id: tempId,
      title: s.title,
      done: false,
      position: i,
      last_bonus_date: null,
    }));
    const optimisticTask: Task = {
      id: tempId,
      title,
      description,
      difficulty: taskForm.difficulty,
      reward_value: optimisticReward,
      manual_reward_override: manualReward,
      streak_bonus: 0,
      status: "open",
      kind,
      sort_order: optimisticOrder,
      last_completed_date: null,
      done_today: false,
      frequency: taskForm.frequency,
      days_of_week: payload.days_of_week as string | null,
      every_n: Number(taskForm.every_n) || 1,
      start_date: (payload.start_date as string | null) ?? null,
      repeat_mode: payload.repeat_mode as RepeatMode | null,
      window_days: windowDays,
      deferred_to_date: null,
      subtasks: optimisticSubtasks,
      subtask_total: optimisticSubtasks.length,
      subtask_done: 0,
      // Reminders get their real ids from the server row; the stand-ins only need to render.
      reminders: taskForm.reminders.map((r, i) => ({
        id: `${tempId}-rem-${i}`,
        task_id: tempId,
        fire_time: r.fire_time,
        fire_date: r.fire_date,
        last_fired_date: null,
      })),
      streak_count: 0,
      streak_last_date: null,
      last_bonus_date: null,
      neglect_count: 0,
      neglect_last_date: null,
      ts_created: new Date().toISOString(),
      ts_completed: null,
    };
    setTasks((prev) => [...prev, optimisticTask]);
    animateCloseTaskModal();

    // BACKGROUND SYNC — swap the stand-in for the server row, or roll it back on failure.
    (async () => {
      try {
        const res = await fetch("/modules/quest/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? "Failed to save task");
        }
        const created: Task = await res.json();
        setTasks((prev) => prev.map((t) => (t.id === tempId ? created : t)));
      } catch (e) {
        setTasks((prev) => prev.filter((t) => t.id !== tempId));
        toast.error(e instanceof Error && e.message ? e.message : "Failed to save task");
        refresh();
      }
    })();
  }

  async function completeTask(id: string) {
    setError(null);
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const isDaily = t.kind === "daily";
    const oldStreak = t.streak_count;
    const newStreak = isDaily ? oldStreak + 1 : oldStreak;
    const baseReward = Number(t.reward_value ?? 0);
    // Bonus earned on THIS completion uses preStreak (the streak coming in).
    const hasSubs = t.subtask_total > 0;
    const todayStr = simulationDate ?? localTodayYMD();
    // Once-per-day bonus gate (mirrors server): if today's bonus was already paid (e.g. user
    // un-checked then re-checked the same day), don't double-credit optimistically.
    const bonusAlreadyPaidToday = isDaily && t.last_bonus_date === todayStr;
    const earnedBonus = isDaily && !hasSubs && !bonusAlreadyPaidToday
      ? computedStreakBonus(baseReward, oldStreak)
      : 0;
    // Displayed bonus after completion = what next would earn (carrying newStreak in).
    const displayedBonus = isDaily ? computedStreakBonus(baseReward, newStreak) : 0;
    // Subtasks are the increments; parent complete awards nothing when subtasks exist
    const baseAward = hasSubs ? 0 : baseReward;
    const awarded = baseAward + earnedBonus;
    // OPTIMISTIC UPDATE
    setTasks((prev) =>
      prev.map((x) =>
        x.id === id
          ? {
              ...x,
              done_today: isDaily ? true : x.done_today,
              status: x.kind === "todo" ? "done" : x.status,
              ts_completed: x.kind === "todo" ? todayStr : x.ts_completed,
              streak_count: newStreak,
              streak_bonus: isDaily ? displayedBonus : x.streak_bonus,
              last_bonus_date: isDaily && earnedBonus > 0 ? todayStr : x.last_bonus_date,
              neglect_count: isDaily ? 0 : x.neglect_count,
            }
          : x,
      ),
    );
    // Keep the calendar in step — the server records a dated completion for dailies AND todos.
    addOverlayCompletion(id, todayStr);
    if (awarded > 0) {
      setBalance((b) => b + awarded);
      toast.success(`+${awarded.toFixed(2)} coins`);
    }
    try {
      const res = await fetch(`/modules/quest/api/tasks/${id}/complete`, { method: "POST" });
      if (!res.ok) throw new Error("complete failed");
      // All-dailies bonus is server-computed (depends on every daily's state, not just this one) —
      // there's no client-side optimistic equivalent, so it's only surfaced once the response lands.
      const data = await res.json().catch(() => null);
      const allDailiesBonus = Number(data?.allDailiesBonusAwarded ?? 0);
      if (allDailiesBonus > 0) {
        setBalance((b) => b + allDailiesBonus);
        toast.success(`🏆 All dailies bonus: +${allDailiesBonus.toFixed(2)} coins`);
      }
    } catch {
      refresh();
    }
  }

  // Toggle a task's checked state inside the review modal. No DB write happens here — the user's
  // selections are committed when Done is clicked (acknowledgeReview).
  function toggleReviewItem(id: string) {
    setReviewCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Toggle a subtask inside the review modal. Independent of the parent toggle — but if all
  // not-yet-done subtasks are checked, the parent is auto-included on submit (see acknowledgeReview).
  function toggleReviewSubtask(taskId: string, subId: string) {
    const key = `${taskId}:${subId}`;
    setReviewCheckedSubtaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  // FREEZE-YESTERDAY ACTION on the review modal: lets the user skip the day instead of
  // acknowledging. `freezeConfirmOpen` swaps the freeze button for an inline confirm prompt
  // because freezing forfeits any rewards the user did credit for that day.
  const [freezingDay, setFreezingDay] = useState(false);
  const [freezeConfirmOpen, setFreezeConfirmOpen] = useState(false);
  // Carry-over checklist: when the user expands the freeze prompt, they can tick which of
  // yesterday's scheduled dailies should slide forward to today (deferred_to_date = today).
  // Default empty — the user has to opt each task in.
  const [freezeDeferIds, setFreezeDeferIds] = useState<Set<string>>(new Set());

  function toggleFreezeDeferId(id: string) {
    setFreezeDeferIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Done button: posts the user's committed picks. The server backdates each selected task with
  // forDate=reviewDate, then records the ack and runs the damage check — so HP loss reflects only
  // tasks the user did NOT credit themselves for during the review.
  async function acknowledgeReview() {
    if (reviewSubmitting || !reviewDate) return;
    setReviewSubmitting(true);
    try {
      // Subtask completions to send to the server (we exclude any that were already done — those
      // were marked complete on an earlier day and have nothing to apply here). Parent completion
      // is independent: the user must tick the parent checkbox explicitly to credit the daily.
      const completedSubtasks: { taskId: string; subtaskId: string }[] = [];
      for (const t of tasks) {
        if (!reviewInitialIds?.has(t.id)) continue;
        if (t.subtask_total === 0) continue;
        for (const s of t.subtasks) {
          if (s.done) continue;
          if (reviewCheckedSubtaskIds.has(`${t.id}:${s.id}`)) {
            completedSubtasks.push({ taskId: t.id, subtaskId: s.id });
          }
        }
      }
      const completedTaskIds = [...reviewCheckedIds];
      const res = await fetch("/modules/quest/api/state/acknowledge-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forDate: reviewDate,
          completedTaskIds,
          completedSubtasks,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setState(data.state);
        const awarded = Number(data.totalAwarded ?? 0);
        if (awarded > 0) {
          setBalance((b) => b + awarded);
          toast.success(`+${awarded.toFixed(2)} coins`);
        }
        const dmg = Number(data.damage?.damage_taken ?? 0);
        if (dmg > 0 && !data.damage?.died) {
          toast.error(`−${dmg} HP from missed dailies`);
        }
        if (data.damage?.died) {
          setDeathInfo({ reason: "missed dailies", coins_lost: data.damage.coins_lost });
        }
      } else {
        toast.error("Could not finalize review");
      }
    } catch {
      toast.error("Could not finalize review");
    } finally {
      setReviewClosing(true);
      setTimeout(() => {
        setReviewDate(null);
        setReviewClosing(false);
        setReviewSubmitting(false);
        setReviewInitialIds(null);
        setReviewCheckedIds(new Set());
        refresh();
      }, 180);
    }
  }

  // Freeze button: marks reviewDate as a frozen day on the server. Reverses any rewards
  // already credited for that day and prevents the next damage check from punishing missed
  // dailies. Server also stamps last_review_ack_date so the modal stays closed.
  async function freezeReviewDay() {
    if (freezingDay || !reviewDate) return;
    setFreezingDay(true);
    try {
      const res = await fetch("/modules/quest/api/freeze-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: reviewDate, deferTaskIds: [...freezeDeferIds] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof body?.error === "string" ? body.error : "Could not freeze day");
        setFreezingDay(false);
        return;
      }
      if (body.alreadyFrozen) {
        toast(`${reviewDate} was already frozen.`, { icon: "❄" });
      } else {
        const parts: string[] = [];
        const coinsLost = Number(body.reversedCoins ?? 0);
        if (coinsLost > 0) parts.push(`−${coinsLost.toFixed(2)} coins forfeited`);
        const hp = Number(body.restoredHealth ?? 0);
        if (hp > 0) parts.push(`+${hp} HP restored`);
        const deferred = Number(body.deferredTaskCount ?? 0);
        if (deferred > 0) parts.push(`${deferred} carried to today`);
        toast.success(parts.length > 0 ? `Day frozen — ${parts.join(", ")}` : "Day frozen — no damage applied");
      }
      setReviewClosing(true);
      setTimeout(() => {
        setReviewDate(null);
        setReviewClosing(false);
        setReviewInitialIds(null);
        setReviewCheckedIds(new Set());
        setReviewCheckedSubtaskIds(new Set());
        setFreezeConfirmOpen(false);
        setFreezingDay(false);
        setFreezeDeferIds(new Set());
        refresh();
      }, 180);
    } catch {
      toast.error("Could not freeze day");
      setFreezingDay(false);
    }
  }

  async function uncompleteTask(id: string) {
    setError(null);
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const isDaily = t.kind === "daily";
    const newStreak = isDaily ? Math.max(0, t.streak_count - 1) : t.streak_count;
    const newBonus = isDaily ? computedStreakBonus(Number(t.reward_value ?? 0), newStreak) : 0;
    // OPTIMISTIC UPDATE — task state only; balance is reconciled from the server below because
    // the server reverses the HISTORIC awarded amount (which may differ from the current reward).
    setTasks((prev) =>
      prev.map((x) =>
        x.id === id
          ? {
              ...x,
              done_today: isDaily ? false : x.done_today,
              status: x.kind === "todo" ? "open" : x.status,
              streak_count: newStreak,
              streak_bonus: isDaily ? newBonus : x.streak_bonus,
            }
          : x,
      ),
    );
    // Mirror the server, which deletes exactly today's dated completion — so the calendar drops the
    // chip's done styling (and an unscheduled todo's chip) at the same moment the row unchecks.
    removeOverlayCompletion(id, simulationDate ?? localTodayYMD());
    const balanceBefore = balance;
    try {
      const res = await fetch(`/modules/quest/api/tasks/${id}/uncomplete`, { method: "POST" });
      if (!res.ok) throw new Error("uncomplete failed");
      const bRes = await fetch("/modules/quest/api/balance");
      if (bRes.ok) {
        const { balance: newBalance } = await bRes.json();
        setBalance(newBalance);
        const delta = newBalance - balanceBefore;
        if (delta < 0) toast(`${delta.toFixed(2)} coins`, { icon: "↩" });
      }
    } catch {
      refresh();
    }
  }

  async function deleteTask(id: string) {
    setError(null);
    // OPTIMISTIC
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      const res = await fetch(`/modules/quest/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      refresh();
    }
  }

  function patchTaskSubtasks(taskId: string, mutate: (subs: Subtask[]) => Subtask[]) {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const subs = mutate(t.subtasks);
        return {
          ...t,
          subtasks: subs,
          subtask_total: subs.length,
          subtask_done: subs.filter((s) => s.done).length,
        };
      }),
    );
  }

  async function toggleSubtask(taskId: string, subId: string, currentDone: boolean) {
    const parent = tasks.find((t) => t.id === taskId);
    const reward = parent ? Number(parent.reward_value ?? 0) : 0;
    const todayStr = simulationDate ?? localTodayYMD();
    const preStreak = parent && parent.kind === "daily"
      ? parent.streak_last_date === todayStr
        ? Math.max(0, parent.streak_count - 1)
        : parent.streak_count
      : 0;
    const bonus = parent ? computedStreakBonus(reward, preStreak) : 0;
    const sub = parent?.subtasks.find((s) => s.id === subId);
    // Once-per-day bonus gate per subtask (mirrors server).
    const subBonusAlreadyPaidToday = sub?.last_bonus_date === todayStr;
    const effectiveBonus = subBonusAlreadyPaidToday ? 0 : bonus;
    const perTick = reward + effectiveBonus;
    const willBeDone = !currentDone;
    // OPTIMISTIC — flip subtask + bump balance + toast.
    // Checking ON awards base + streak bonus (gated to once/day); checking OFF reverses ONLY
    // the base — the streak bonus is sticky (matches server uncomplete behavior).
    const optimisticDelta = willBeDone ? perTick : -reward;
    patchTaskSubtasks(taskId, (subs) =>
      subs.map((s) =>
        s.id === subId
          ? {
              ...s,
              done: willBeDone,
              last_bonus_date: willBeDone && effectiveBonus > 0 ? todayStr : s.last_bonus_date,
            }
          : s,
      ),
    );
    if (optimisticDelta !== 0) {
      setBalance((b) => b + optimisticDelta);
      const display = Math.abs(optimisticDelta).toFixed(2);
      if (willBeDone) toast.success(`+${display} coins`);
      else toast(`−${display} coins`, { icon: "↩" });
    }
    try {
      const res = await fetch(`/modules/quest/api/tasks/${taskId}/subtasks/${subId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: willBeDone }),
      });
      if (!res.ok) throw new Error();
      // The server refuses to check a subtask back on once its parent daily is already complete
      // (that completion zeroed the subtasks for the next cycle). That's the losing side of a
      // rapid tick-then-complete race, so reconcile: undo the optimistic tick and the coins.
      const data = await res.json().catch(() => null);
      if (data?.subtask && data.subtask.done !== willBeDone) {
        patchTaskSubtasks(taskId, (subs) =>
          subs.map((s) => (s.id === subId ? { ...s, ...data.subtask } : s)),
        );
        if (optimisticDelta !== 0) setBalance((b) => b - optimisticDelta);
      }
    } catch {
      refresh();
    }
  }

  async function addSubtaskInline(taskId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    const tempId = `tmp-${Date.now()}-${Math.random()}`;
    // OPTIMISTIC
    patchTaskSubtasks(taskId, (subs) => [
      ...subs,
      { id: tempId, task_id: taskId, title: trimmed, done: false, position: subs.length, last_bonus_date: null },
    ]);
    try {
      const res = await fetch(`/modules/quest/api/tasks/${taskId}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) throw new Error();
      const real: Subtask = await res.json();
      patchTaskSubtasks(taskId, (subs) => subs.map((s) => (s.id === tempId ? real : s)));
    } catch {
      patchTaskSubtasks(taskId, (subs) => subs.filter((s) => s.id !== tempId));
      refresh();
    }
  }

  async function deleteSubtaskInline(taskId: string, subId: string) {
    // OPTIMISTIC
    patchTaskSubtasks(taskId, (subs) => subs.filter((s) => s.id !== subId));
    try {
      const res = await fetch(`/modules/quest/api/tasks/${taskId}/subtasks/${subId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      refresh();
    }
  }

  async function addReward() {
    setError(null);
    const name = newRewardName.trim();
    const cost = Number(newRewardCost);
    if (!name || !Number.isInteger(cost) || cost <= 0) {
      setError("Reward needs a name and positive integer cost");
      return;
    }

    // OPTIMISTIC CREATE — paint the reward row and clear the form now, POST in the background.
    // Mirrors submitTaskForm: a `tmp-` row stands in until the server row replaces it, and a
    // failed POST pulls the row back out with a loud toast (see the background sync below).
    const tempId = `tmp-${Date.now()}-${Math.random()}`;
    const optimisticReward: Reward = { id: tempId, name, cost };
    setRewards((prev) => sortRewards([...prev, optimisticReward]));
    setNewRewardName("");
    setNewRewardCost("");

    // BACKGROUND SYNC — swap the stand-in for the server row, or roll it back on failure.
    try {
      const res = await fetch("/modules/quest/api/rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cost }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed to add reward");
      }
      const created: Reward = await res.json();
      setRewards((prev) => sortRewards(prev.map((r) => (r.id === tempId ? created : r))));
    } catch (e) {
      setRewards((prev) => prev.filter((r) => r.id !== tempId));
      toast.error(e instanceof Error && e.message ? e.message : "Failed to add reward");
      refresh();
    }
  }

  async function spendReward(id: string) {
    setError(null);
    const r = rewards.find((x) => x.id === id);
    if (!r) return;
    // Guard against a double-tap / two-tab race: two clicks fired before React re-renders the
    // disabled state would otherwise both pass the (now stale) canAfford check. Check against
    // balance minus what's already been optimistically committed but not yet confirmed.
    if (balance - pendingRewardSpendRef.current < r.cost) {
      toast.error("Insufficient balance");
      return;
    }
    pendingRewardSpendRef.current += r.cost;
    // OPTIMISTIC
    setBalance((b) => b - r.cost);
    toast(`−${r.cost} coins · ${r.name}`, { icon: "🎁" });
    try {
      const res = await fetch(`/modules/quest/api/rewards/${id}/spend`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Could not spend on reward");
        throw new Error();
      }
    } catch {
      refresh();
    } finally {
      pendingRewardSpendRef.current -= r.cost;
    }
  }

  // Open the short-rest overlay fresh (no stale result, die showing its max face).
  function openGamble() {
    setGambleResult(null);
    setGambleFace(GAMBLE_DIE_SIDES);
    setGambleRolling(false);
    setGambleClosing(false);
    setGambleOpen(true);
  }

  // Animated close — mirrors the death modal's fade/scale-out before unmounting.
  function closeGamble() {
    if (gambleRolling) return; // don't yank the overlay out from under an in-flight roll
    setGambleClosing(true);
    setTimeout(() => {
      setGambleOpen(false);
      setGambleClosing(false);
      setGambleResult(null);
    }, 150);
  }

  // Spend coins, roll the d20 server-side, then animate the die landing on the returned value and
  // apply the heal. The server is authoritative for both the roll and the coin debit; the on-screen
  // cycling is purely cosmetic and we hold it up for a beat so it reads as a real roll.
  async function rollGamble() {
    if (gambleRolling) return;
    if (state.health >= state.max_health) {
      toast("Already at full health", { icon: "❤️" });
      return;
    }
    if (balance < gambleCost) {
      toast.error(`Not enough coins — this short rest costs ${gambleCost}`);
      return;
    }
    setError(null);
    setGambleResult(null);
    setGambleRollSeq((n) => n + 1);
    setGambleRolling(true);
    gambleCycleRef.current = setInterval(
      () => setGambleFace(1 + Math.floor(Math.random() * GAMBLE_DIE_SIDES)),
      80,
    );
    const stopCycle = () => {
      if (gambleCycleRef.current) {
        clearInterval(gambleCycleRef.current);
        gambleCycleRef.current = null;
      }
    };
    try {
      const [res] = await Promise.all([
        fetch("/modules/quest/api/gamble", { method: "POST" }),
        new Promise((resolve) => setTimeout(resolve, 1100)),
      ]);
      stopCycle();
      if (!res.ok) {
        setGambleRolling(false);
        const body = await res.json().catch(() => ({}));
        if (typeof body.balance === "number") setBalance(body.balance);
        // A rejection still tells us today's roll count (e.g. another tab rolled), so resync the price.
        if (typeof body.rollsThisWeek === "number") setGambleRollsThisWeek(body.rollsThisWeek);
        toast.error(body.error ?? "Roll failed");
        return;
      }
      const data = await res.json();
      setGambleFace(data.roll);
      setGambleResult({ roll: data.roll, healed: data.healed });
      setBalance(data.balance);
      setState(data.state);
      setGambleRollsThisWeek(Number(data.rollsThisWeek ?? gambleRollsThisWeek + 1));
      setGambleRolling(false);
      toast(`Rolled ${data.roll} · +${data.healed} HP · −${data.spent}`, { icon: "🎲" });
    } catch {
      stopCycle();
      setGambleRolling(false);
      toast.error("Roll failed");
      refresh();
    }
  }

  async function deleteReward(id: string) {
    setError(null);
    // OPTIMISTIC
    setRewards((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/modules/quest/api/rewards/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      refresh();
    }
  }

  async function addDebt() {
    setError(null);
    const name = newDebtName.trim();
    const amount = Number(newDebtAmount);
    if (!name) {
      setError("Debt name required");
      return;
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      setError("Debt amount must be a positive integer");
      return;
    }
    try {
      const res = await fetch("/modules/quest/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, amount }),
      });
      if (!res.ok) throw new Error();
      const debt: Debt = await res.json();
      setDebts((prev) => [...prev, debt]);
      setNewDebtName("");
      setNewDebtAmount("");
    } catch {
      setError("Failed to add debt");
    }
  }

  async function deleteDebt(id: string) {
    setError(null);
    // OPTIMISTIC
    setDebts((prev) => prev.filter((d) => d.id !== id));
    try {
      const res = await fetch(`/modules/quest/api/debts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      refresh();
    }
  }

  // Sweep available coin balance against a debt. Server determines the exact amount based on the
  // current balance and remaining debt — we just call and reconcile from the response.
  async function payDebt(id: string) {
    setError(null);
    try {
      const res = await fetch(`/modules/quest/api/debts/${id}/pay`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? "Failed to pay debt");
        return;
      }
      const data: { paid: number; debt_remaining: number; balance: number; cleared: boolean } = await res.json();
      toast.success(`Paid ${data.paid} coins`);
      setBalance(data.balance);
      if (data.cleared) {
        setDebts((prev) => prev.filter((d) => d.id !== id));
      } else {
        setDebts((prev) => prev.map((d) => (d.id === id ? { ...d, amount_remaining: data.debt_remaining } : d)));
      }
    } catch {
      refresh();
    }
  }

  async function spendAdhoc() {
    setError(null);
    const amount = Number(adhocAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      setError("Amount must be a positive integer");
      return;
    }
    // OPTIMISTIC
    setBalance((b) => b - amount);
    toast(`−${amount} coins · ${adhocNote || "ad-hoc"}`, { icon: "💸" });
    const note = adhocNote;
    setAdhocAmount("");
    setAdhocNote("");
    try {
      const res = await fetch("/modules/quest/api/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, note }),
      });
      if (!res.ok) throw new Error();
    } catch {
      refresh();
    }
  }

  function openCreateHabitModal() {
    setEditingHabitId(null);
    setHabitTitle("");
    setHabitDifficulty("easy");
    setHabitAllowPositive(true);
    setHabitAllowNegative(true);
    setHabitRewardOverride("");
    setHabitRewardOverrideEnabled(false);
    setHabitModalOpen(true);
  }

  function openEditHabitModal(h: Habit) {
    setEditingHabitId(h.id);
    setHabitTitle(h.title);
    setHabitDifficulty(h.difficulty);
    setHabitAllowPositive(h.allow_positive);
    setHabitAllowNegative(h.allow_negative);
    setHabitRewardOverride(h.manual_reward_override != null ? h.manual_reward_override.toFixed(2) : "");
    setHabitRewardOverrideEnabled(h.manual_reward_override != null);
    setHabitModalOpen(true);
  }

  async function submitHabit() {
    const title = habitTitle.trim();
    if (!title) return;
    if (!habitAllowPositive && !habitAllowNegative) {
      setError("Habit must allow at least one direction");
      return;
    }
    setSubmitting(true);
    try {
      // Manual reward override: empty input = null (use difficulty); a finite >=0 number sets it.
      const overrideTrimmed = habitRewardOverrideEnabled ? habitRewardOverride.trim() : "";
      const overrideNum = overrideTrimmed === "" ? null : Number(overrideTrimmed);
      const manualReward =
        overrideNum != null && Number.isFinite(overrideNum) && overrideNum >= 0 ? overrideNum : null;
      const payload = {
        title,
        difficulty: habitDifficulty,
        allow_positive: habitAllowPositive,
        allow_negative: habitAllowNegative,
        manual_reward_override: manualReward,
      };
      const url = editingHabitId
        ? `/modules/quest/api/habits/${editingHabitId}`
        : "/modules/quest/api/habits";
      const method = editingHabitId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        animateCloseHabitModal();
        refresh();
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Failed to save habit");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteHabit(id: string) {
    // OPTIMISTIC
    setHabits((prev) => prev.filter((h) => h.id !== id));
    try {
      const res = await fetch(`/modules/quest/api/habits/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      refresh();
    }
  }

  async function tapHabit(id: string, direction: "positive" | "negative") {
    const h = habits.find((x) => x.id === id);
    if (h) {
      // A manual override replaces the difficulty-derived reward on the positive tap only; the
      // negative tap's coin damage stays difficulty-driven (mirrors lib/habitFunctions tapHabit).
      const mag =
        direction === "positive" && h.manual_reward_override != null
          ? Math.max(0, h.manual_reward_override)
          : computedReward(h.difficulty, "habit");
      if (direction === "positive" && h.allow_positive) {
        setBalance((b) => b + mag);
        // Bump the visual-only streak. Within today: each positive tap increments. Stale (any
        // other date) → restart at 1. The count resets on the next day because visualHabitStreak
        // only honors entries dated to today; the stored row gets overwritten on the next tap.
        const today = simulationDate ?? localTodayYMD();
        setHabitStreaks((prev) => {
          const cur = prev[id];
          const sameDay = cur?.last_date === today;
          const nextCount = sameDay ? cur.count + 1 : 1;
          const next = { ...prev, [id]: { count: nextCount, last_date: today } };
          try {
            localStorage.setItem("quest_habit_streaks", JSON.stringify(next));
          } catch {
            // ignore quota errors
          }
          return next;
        });
      } else if (direction === "negative" && h.allow_negative) {
        setBalance((b) => b - mag);
      }
    }
    const res = await fetch(`/modules/quest/api/habits/${id}/tap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    if (res.ok) {
      const data = await res.json();
      const delta = Number(data?.delta ?? 0);
      const dmg = Number(data?.damage?.damage_taken ?? 0);
      if (direction === "positive" && delta > 0) {
        toast.success(`+${delta.toFixed(2)} coins`);
      } else if (direction === "negative") {
        const parts: string[] = [];
        if (delta < 0) parts.push(`−${Math.abs(delta).toFixed(2)} coins`);
        if (dmg > 0) parts.push(`−${dmg} HP`);
        if (parts.length) toast.error(parts.join(" · "));
      }
      if (data?.damage?.died) {
        const habit = habits.find((h) => h.id === id);
        setDeathInfo({ reason: `negative habit: ${habit?.title ?? ""}`, coins_lost: data.damage.coins_lost });
      }
      refresh();
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-container">
          <div className="loading-container">
            <div className="loading-spinner" />
          </div>
        </div>
      </div>
    );
  }

  const hpPercent = Math.max(0, Math.min(100, (state.health / Math.max(1, state.max_health)) * 100));
  // Colour the gamble die by outcome: blue while tumbling, green on a high/crit roll, red on a low one.
  const gambleDieColor = gambleRolling
    ? "text-blue-400"
    : gambleResult
      ? gambleResult.roll >= Math.ceil(GAMBLE_DIE_SIDES * 0.7)
        ? "text-green-400"
        : gambleResult.roll <= 3
          ? "text-red-400"
          : "text-yellow-400"
      : "text-secondary";

  return (
    <div className="page">
      <Toaster position="bottom-center" />
      {/* HOVER SUPPRESSION OVERLAY — intercepts pointer hover on underlying elements while
          dragging so checkboxes/buttons don't light up under the floating row. */}
      {dragId && (
        <div
          aria-hidden
          className="fixed inset-0"
          style={{ zIndex: 40, cursor: "grabbing", background: "transparent" }}
        />
      )}
      {/* quest-home-container: wider measure + trimmed padding on desktop so the full-width
          calendar row gets the horizontal room (see globals.css). */}
      <div className="page-container quest-home-container">

        {/* HEADER */}
        <div className="mb-6 flex items-center justify-between gap-2">
          {/* !mb-0 — .text-page-title carries margin-bottom:0.5rem and is UNLAYERED in
              globals.css, so it beats a plain `mb-0` utility. As a flex item the row
              centres its *margin* box, so that stray 8px shoves the module icon 4px
              above the optical centre of the header. The row's own mb-6 owns the gap. */}
          <h1 className="text-page-title !mb-0 flex items-center gap-2 truncate">
            <Target className="w-6 h-6 sm:w-8 sm:h-8 shrink-0" />
            <span className="hidden sm:inline">Quest</span>
          </h1>
          <div className="flex items-stretch gap-2 sm:gap-3 flex-wrap justify-end">

            {/* HEALTH BAR */}
            <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 p-1.5 sm:p-2 rounded-lg bg-red-500/10 border border-red-500/30">
              <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-red-500 shrink-0" />
              <div className="flex items-center gap-1 text-xs sm:text-sm tabular-nums">
                <span className="text-red-400 font-semibold">{state.health}</span>
                <span className="text-secondary">/</span>
                <span className="text-secondary">{state.max_health}</span>
              </div>
              <div className="hidden sm:block w-20 h-1.5 quest-track rounded overflow-hidden">
                <div className="h-full bg-red-500 transition-all" style={{ width: `${hpPercent}%` }} />
              </div>

              {/* SHORT REST (GAMBLE FOR HEALTH) BUTTON — rolls a d20 to recover HP for coins */}
              <button
                onClick={openGamble}
                title={`Short rest — gamble ${gambleCost} coins to roll for HP`}
                className="ml-0.5 p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-500/20 cursor-pointer shrink-0"
              >
                <Dices className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* COIN BALANCE */}
            <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 p-1.5 sm:p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <Coins className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500 shrink-0" />
              <span className="text-xs sm:text-sm font-semibold text-yellow-500 tabular-nums">{Number(balance).toFixed(2)}</span>
            </div>

            {/* CALENDAR LINK — items-center/justify-center are load-bearing: the cluster is
                items-stretch, so this control is stretched to the taller HP pill's height and
                its fixed-size icon would otherwise sit at flex-start with the slack all below it. */}
            <Link
              href="/modules/quest/ui/calendar"
              title="Calendar"
              className="inline-flex items-center justify-center p-1.5 sm:p-2 rounded border quest-control quest-hover text-secondary hover:text-primary cursor-pointer shrink-0"
            >
              <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5" />
            </Link>

            {/* SETTINGS LINK — same stretch caveat as the calendar link above. */}
            <Link
              href="/modules/quest/ui/settings"
              title="Settings"
              className="inline-flex items-center justify-center p-1.5 sm:p-2 rounded border quest-control quest-hover text-secondary hover:text-primary cursor-pointer shrink-0"
            >
              <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
            </Link>

            {/* HELP */}
            <HelpButton
              title="Quest"
              className="btn-link shrink-0"
              sections={[
                { heading: "The loop", body: "Complete tasks and tap habits to earn coins — the coin chip on each row shows what it pays. Spend coins on rewards. Overdue or neglected work chips away at your health." },
                { heading: "Health & coins", body: "The header tracks your HP and coin balance. A short rest gambles coins on a die roll to recover health when you're low. Each rest costs more than the last, and the price resets at the start of your quest week (set the day in Quest settings)." },
                { heading: "Organize", body: "Add tasks with difficulties, due dates, and subtasks; recurring habits surface each day they're scheduled. Calendar and Settings live in the header icons." },
                { heading: "Spending shortcuts", body: "In the Rewards tab you can add a reward, debt, or ad-hoc spend without leaving the keyboard: Enter moves from the name to the amount, and Enter on the last field submits the row." },
              ]}
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500">
            {error}
          </div>
        )}

        {/* MANTRA OF THE DAY BANNER — one of the user's mantras, picked deterministically for today */}
        {mantraOfDay && (
          <div className="mb-4 flex items-start gap-2 sm:gap-3 px-3 sm:px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <Quote className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 shrink-0 mt-0.5" />
            {/* text-primary, not a raw blue-100 — the app has a light theme, where a near-white
                quote on the pale blue banner is invisible. */}
            <p className="min-w-0 italic text-primary break-words">{mantraOfDay.text}</p>
          </div>
        )}

        {/* MOBILE TAB BAR — "calendar" isn't a tab: a phone can't show a month grid AND this page's
            chrome usefully, so it navigates to the dedicated calendar page, which owns the whole
            viewport. The other three switch cards in place as before. */}
        <div className="lg:hidden flex border-b quest-divider mb-4">
          {(["tasks", "habits", "rewards"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setMobileTab(t)}
              className={`flex-1 py-2 text-sm font-semibold capitalize cursor-pointer border-b-2 transition-colors ${
                mobileTab === t ? "border-blue-500 text-primary" : "border-transparent text-secondary"
              }`}
            >
              {t}
            </button>
          ))}

          {/* CALENDAR — navigates instead of switching */}
          <Link
            href="/modules/quest/ui/calendar"
            className="flex-1 py-2 text-sm font-semibold capitalize cursor-pointer border-b-2 border-transparent text-secondary text-center"
          >
            calendar
          </Link>
        </div>

        {/* CARD GRID — one row of three on desktop (tasks / habits / spending) with the calendar
            spanning the full width beneath them. One column, tab-switched, on mobile. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* TASKS CARD */}
          <section className={`card ${mobileTab === "tasks" ? "" : "!hidden"} lg:!block`}>

            {/* TASKS HEADER */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-card-title">
                <Target className="w-5 h-5" />
                Tasks
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openCreateTaskModal("daily")}
                  className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Daily
                </button>
                <button
                  onClick={() => openCreateTaskModal("todo")}
                  className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Todo
                </button>
              </div>
            </div>

            {/* DATE STEPPER — forage-timeline-style day navigation. Stepping off today swaps the
                live task list for a read/complete view of that day's dailies. */}
            <div className="flex items-center justify-center gap-3 mb-4">

              {/* PREVIOUS DAY */}
              <button
                onClick={() => stepViewDate(-1)}
                aria-label="Previous day"
                className="p-1.5 rounded border quest-control quest-hover text-secondary hover:text-primary cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              {/* DAY LABEL — tap to jump back to today when viewing another day */}
              <button
                onClick={() => setViewDate(null)}
                disabled={isViewingToday}
                title={isViewingToday ? undefined : "Back to today"}
                className={`text-center leading-tight tabular-nums min-w-[6.5rem] px-2 py-1 rounded ${
                  isViewingToday ? "cursor-default" : "cursor-pointer quest-hover"
                }`}
              >
                <div className={`text-sm font-semibold ${isViewingToday ? "text-primary" : "text-blue-400"}`}>
                  {viewDateLabel.primary}
                </div>
                {viewDateLabel.secondary && <div className="text-xs text-secondary">{viewDateLabel.secondary}</div>}
              </button>

              {/* NEXT DAY */}
              <button
                onClick={() => stepViewDate(1)}
                aria-label="Next day"
                className="p-1.5 rounded border quest-control quest-hover text-secondary hover:text-primary cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* FILTER CHIPS — today only; the day-view has its own (read/complete) layout. */}
            <div className={`flex items-center gap-2 flex-wrap mb-3 ${isViewingToday ? "" : "hidden"}`}>
              {(["all", "daily", "todo"] as TaskFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs cursor-pointer ${
                    filter === f
                      ? "bg-blue-600 text-white"
                      : "border quest-control text-secondary quest-hover"
                  }`}
                >
                  {f === "all" ? "All" : f === "daily" ? "Dailies" : "Todos"}
                </button>
              ))}
              {/* VIEW OPTIONS POPOVER */}
              <div className="ml-auto relative">
                <button
                  onClick={() => setViewMenuOpen((v) => !v)}
                  title="View options"
                  className={`p-1.5 rounded border cursor-pointer ${
                    viewMenuOpen
                      ? "border-blue-500 bg-blue-600/20 text-primary"
                      : "quest-control quest-hover text-secondary"
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </button>
                {viewMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setViewMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 quest-surface shadow-lg p-3 min-w-[14rem] space-y-2">

                      {/* DAILY-ONLY TOGGLES */}
                      {(filter === "all" || filter === "daily") && (
                        <>
                          <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showAllDailies}
                              onChange={(e) => setShowAllDailies(e.target.checked)}
                              className="cursor-pointer"
                            />
                            Show all dailies
                          </label>
                          <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
                            <input
                              type="checkbox"
                              checked={showCompletedDailies}
                              onChange={(e) => setShowCompletedDailies(e.target.checked)}
                              className="cursor-pointer"
                            />
                            Show completed dailies
                          </label>
                        </>
                      )}

                      {/* TODO-ONLY TOGGLE */}
                      {(filter === "all" || filter === "todo") && (
                        <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showCompletedTodos}
                            onChange={(e) => setShowCompletedTodos(e.target.checked)}
                            className="cursor-pointer"
                          />
                          Show completed todos
                        </label>
                      )}

                      {/* SORT TOGGLE */}
                      <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
                        <input
                          type="checkbox"
                          checked={moveCompletedToBottom}
                          onChange={(e) => setMoveCompletedToBottom(e.target.checked)}
                          className="cursor-pointer"
                        />
                        Move completed to bottom
                      </label>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* TASK LIST — live, today-only; hidden (kept mounted) while viewing another day. */}
            <ul ref={ulRef} className={`space-y-2 relative ${isViewingToday ? "" : "hidden"}`}>
              {visibleTasks.length === 0 && (
                <li className="text-secondary text-sm">No tasks to show — add a Daily or Todo above.</li>
              )}
              {visibleTasks.map((t, idx) => {
                const isDaily = t.kind === "daily";
                const isDone = isDaily ? t.done_today : t.status === "done";
                const isOffSchedule = offScheduleIds.has(t.id);
                const expanded = expandedTaskId === t.id;
                // FLIP-style neighbor shift, computed from `insertAt` (index in the "source
                // removed" list). Rows below the source shift up when the source would land
                // at or after them; rows above the source shift down when the source would
                // land at or before them. Discrete states → smooth CSS transitions.
                const sourceIdx = dragId ? visibleTasks.findIndex((v) => v.id === dragId) : -1;
                const withoutSourceLen = sourceIdx === -1 ? visibleTasks.length : visibleTasks.length - 1;
                const isInsertNatural = insertAt === sourceIdx;
                let neighborShift = 0;
                if (dragId && dragId !== t.id && insertAt >= 0 && sourceIdx >= 0 && !isInsertNatural) {
                  if (idx < sourceIdx && idx >= insertAt) neighborShift = sourceHeight;
                  else if (idx > sourceIdx && idx <= insertAt) neighborShift = -sourceHeight;
                }
                // Drop indicator anchors: line ABOVE the row whose without-source index == insertAt;
                // line BELOW the last non-source row when insertAt equals the without-source length.
                const withoutSourceIdx = sourceIdx >= 0 && idx > sourceIdx ? idx - 1 : idx;
                const showLineAbove = dragId !== null && dragId !== t.id && !isInsertNatural && withoutSourceIdx === insertAt && insertAt < withoutSourceLen;
                const showLineBelow = dragId !== null && dragId !== t.id && !isInsertNatural && withoutSourceIdx === withoutSourceLen - 1 && insertAt === withoutSourceLen;
                const base = Number(t.reward_value ?? 0);
                const rawBonus = Number(t.streak_bonus ?? 0);
                const todayStr = simulationDate ?? localTodayYMD();
                // GRACE WINDOW — a daily with window_days > 1 whose current occurrence's grace
                // window runs past today can still be completed on a later day, so missing it
                // today isn't a miss yet. Resolve the last day it stays completable (null when
                // there's no grace remaining beyond today) and label "tomorrow" when adjacent.
                const graceThrough = (() => {
                  if (!isDaily || isDone) return null;
                  if (windowDaysClient(t) <= 1) return null;
                  const start = activeOccurrenceStartClient(t, todayStr);
                  if (!start) return null;
                  const end = new Date(start + "T00:00:00");
                  end.setDate(end.getDate() + windowDaysClient(t) - 1);
                  const endStr = fmtYMD(end);
                  if (endStr <= todayStr) return null;
                  const tomorrow = new Date(todayStr + "T00:00:00");
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  return endStr === fmtYMD(tomorrow) ? "tomorrow" : endStr;
                })();
                const ticks = Math.max(1, t.subtask_total);
                // Bonus is gated to once-per-day. For a task with subtasks, each subtask carries
                // its own bonus eligibility; sum across the remaining-unpaid subtasks.
                // For a task without subtasks, the parent's last_bonus_date is the gate.
                const eligibleBonusCount = t.subtask_total === 0
                  ? (isDaily && t.last_bonus_date === todayStr ? 0 : 1)
                  : t.subtasks.filter((s) => s.last_bonus_date !== todayStr).length;
                const bonus = rawBonus;
                const totalBonusEligible = rawBonus * eligibleBonusCount;
                const showTip =
                  rawBonus > 0 && (rewardTipHoverId === t.id || rewardTipPinnedId === t.id);
                const streakShade =
                  t.streak_count <= 0
                    ? "text-yellow-500"
                    : t.streak_count < 5
                      ? "text-yellow-400"
                      : t.streak_count < 10
                        ? "text-orange-400"
                        : t.streak_count < 20
                          ? "text-orange-300"
                          : "text-amber-300";
                return (
                  <li
                    key={t.id}
                    data-task-id={t.id}
                    className="relative"
                    style={
                      dragId === t.id
                        ? {
                            transform: `translate(0px, ${dragDelta.y}px) scale(1.03)`,
                            zIndex: 50,
                            pointerEvents: "none",
                            boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
                            transition: "box-shadow 120ms ease, transform 0ms",
                          }
                        : {
                            transform: neighborShift ? `translateY(${neighborShift}px)` : undefined,
                            transition: "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                          }
                    }
                  >
                    {/* DROP INDICATOR */}
                    {(showLineAbove || showLineBelow) && (
                      <span
                        aria-hidden
                        className="absolute left-0 right-0 h-0.5 bg-blue-400 rounded pointer-events-none"
                        style={{
                          top: showLineAbove ? -5 : undefined,
                          bottom: showLineBelow ? -5 : undefined,
                          boxShadow: "0 0 8px rgba(96,165,250,0.9)",
                        }}
                      />
                    )}

                    {/* TASK ROW */}
                    <div
                      className={`flex items-center gap-2 px-3 py-2.5 rounded border min-h-16 ${
                        isDone ? "quest-divider opacity-60" : "quest-control"
                      } ${isOffSchedule ? "quest-muted opacity-50" : ""} ${
                        dragId === t.id ? "ring-2 ring-blue-400" : ""
                      } ${
                        t.todo_bonus_today && !isDone && !isOffSchedule
                          ? "border-yellow-400/70 bg-yellow-400/20 shadow-[0_0_14px_rgba(250,204,21,0.35)]"
                          : ""
                      }`}
                      title={isOffSchedule ? "Not scheduled for today" : undefined}
                    >
                      <span
                        className="text-subtle cursor-grab active:cursor-grabbing shrink-0 select-none flex items-center justify-center min-w-11 min-h-11 -mx-2 sm:min-w-0 sm:min-h-0 sm:mx-0"
                        style={{ touchAction: "none" }}
                        title="Drag to reorder"
                        onPointerDown={(e) => onHandlePointerDown(e, t.id)}
                      >
                        <GripVertical className="w-5 h-5 sm:w-4 sm:h-4" />
                      </span>
                      <button
                        onClick={() => {
                          if (isOffSchedule) return;
                          if (isDone) uncompleteTask(t.id);
                          else completeTask(t.id);
                        }}
                        disabled={isOffSchedule}
                        title={
                          isOffSchedule
                            ? "Not scheduled for today"
                            : isDone
                              ? "Uncheck"
                              : "Complete"
                        }
                        className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                          isOffSchedule
                            ? "quest-divider cursor-not-allowed"
                            : isDone
                              ? "bg-green-500/20 border-green-500/40 text-green-500 hover:bg-green-500/30 cursor-pointer"
                              : "quest-control hover:border-green-500 hover:bg-green-500/10 cursor-pointer"
                        }`}
                      >
                        {isDone && <Check className="w-3 h-3" />}
                      </button>
                      {/* KIND ICON — vertically centered against full row height */}
                      {isDaily ? (
                        <Repeat className="w-4 h-4 text-blue-400 shrink-0" aria-label="Daily" />
                      ) : (
                        <ListTodo className="w-4 h-4 text-secondary shrink-0" aria-label="Todo" />
                      )}

                      {/* TITLE COLUMN — title on top, streak/neglect below */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between gap-1 self-stretch py-0.5">
                        <button
                          onClick={() => openEditTaskModal(t)}
                          className="text-left cursor-pointer min-w-0 text-sm"
                        >
                          <span className="flex items-center gap-1 min-w-0">
                            <span className={`truncate ${isDone ? "line-through" : ""}`}>{t.title}</span>
                            {/* Carried over to today from a frozen day — flag with a snowflake. */}
                            {t.deferred_to_date === todayStr && (
                              <Snowflake className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-label="Carried over from a frozen day" />
                            )}
                            {/* Has one or more reminders configured — flag with a bell so the row
                                signals it pings, without opening the edit modal. Tooltip lists the times. */}
                            {t.reminders.length > 0 && (
                              // Tooltip sits on a wrapping <span>: lucide-react's icon props
                              // don't include `title`, so passing it to the icon is a type error.
                              <span
                                className="inline-flex shrink-0"
                                title={`Reminder${t.reminders.length > 1 ? "s" : ""}: ${t.reminders
                                  .map((r) => (r.fire_date ? `${r.fire_date} ${r.fire_time}` : r.fire_time))
                                  .join(", ")}`}
                              >
                                <Bell
                                  className="w-3.5 h-3.5 text-blue-400 shrink-0"
                                  aria-label={`${t.reminders.length} reminder${t.reminders.length > 1 ? "s" : ""} set`}
                                />
                              </span>
                            )}
                            {/* GRACE WINDOW — still completable past today; flag with a
                                calendar-clock so a glance shows the miss can wait a day. */}
                            {graceThrough && (
                              // Tooltip on the wrapper, not the icon — see the Bell above.
                              <span
                                className="inline-flex shrink-0"
                                title={`Grace period — still completable ${graceThrough === "tomorrow" ? "through tomorrow" : `through ${graceThrough}`}`}
                              >
                                <CalendarClock
                                  className="w-3.5 h-3.5 text-emerald-400 shrink-0"
                                  aria-label={`Grace period — still completable ${graceThrough === "tomorrow" ? "through tomorrow" : `through ${graceThrough}`}`}
                                />
                              </span>
                            )}
                          </span>
                        </button>
                        {/* DESCRIPTION SUB-LINE — muted notes/details under the title; tap opens edit */}
                        {t.description && (
                          <button
                            onClick={() => openEditTaskModal(t)}
                            className="text-left cursor-pointer min-w-0 text-xs text-secondary truncate"
                            title={t.description}
                          >
                            {t.description}
                          </button>
                        )}
                        {isDaily && (t.streak_count > 0 || t.neglect_count > 0) && (
                          <div className="flex items-center gap-3">
                            {t.streak_count > 0 && (
                              <span
                                className="text-xs text-orange-400 flex items-center gap-0.5 shrink-0 tabular-nums"
                                title={`${t.streak_count}-day streak`}
                              >
                                <Flame className="w-3 h-3" />
                                {t.streak_count}
                              </span>
                            )}
                            {/* Streak and neglect are mutually exclusive — hide a stale neglect
                                counter (e.g. preserved across a freeze) while a streak is active. */}
                            {t.streak_count <= 0 && t.neglect_count > 0 && (
                              <span
                                className="text-xs text-red-400 flex items-center gap-0.5 shrink-0 tabular-nums"
                                title={`${t.neglect_count}-day neglect`}
                              >
                                <Skull className="w-3 h-3" />
                                {t.neglect_count}
                              </span>
                            )}
                            {/* PROJECTED DAMAGE IF MISSED — only shown alongside neglect (no streak) */}
                            {t.streak_count <= 0 && t.neglect_count > 0 && (() => {
                              const base = Number(healthDamage[t.difficulty] ?? 0);
                              let dmg: number;
                              if (advancedMode && damageFormula) {
                                // Advanced: damage formula returns total HP loss; neglect is the
                                // current consecutive-miss count (not yet incremented for today).
                                const v = evaluateFormula(damageFormula, { base, streak: 0, neglect: t.neglect_count + 1, age: 0, coins: balance });
                                dmg = v ?? base;
                              } else {
                                const eff = Math.min(t.neglect_count, neglectCap);
                                dmg = base * (1 + eff * neglectFactor) * damageFactor;
                              }
                              if (dmg <= 0) return null;
                              return (
                                <span
                                  className="text-xs text-red-400 flex items-center gap-0.5 shrink-0 tabular-nums"
                                  title="Damage if missed today"
                                >
                                  <Heart className="w-3 h-3" />
                                  -{dmg.toFixed(2)}
                                </span>
                              );
                            })()}
                          </div>
                        )}
                      </div>

                      {/* RIGHT COLUMN — reward top, subtask chip bottom */}
                      <div className="flex flex-col justify-between items-end shrink-0 self-stretch py-0.5">
                        <span
                          className="relative shrink-0"
                          onMouseEnter={() => setRewardTipHoverId(t.id)}
                          onMouseLeave={() => setRewardTipHoverId((curr) => (curr === t.id ? null : curr))}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (bonus <= 0) return;
                              setRewardTipPinnedId((curr) => (curr === t.id ? null : t.id));
                            }}
                            className={`text-xs tabular-nums flex flex-col items-end leading-tight cursor-pointer ${
                              t.todo_bonus_today
                                ? "px-1.5 py-0.5 rounded-full border border-yellow-400/60 bg-yellow-400/10 text-yellow-300 font-semibold shadow-[0_0_8px_rgba(250,204,21,0.35)]"
                                : streakShade + (t.streak_count > 0 ? " font-semibold" : "")
                            }`}
                            title={t.todo_bonus_today ? `Lucky today: ${(t.todo_bonus_multiplier ?? 1).toFixed(2)}× bonus` : bonus > 0 ? undefined : "Reward"}
                          >
                            {/* BASE REWARD */}
                            <span className="flex items-center gap-1">
                              {t.todo_bonus_today && (
                                <>
                                  <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                                  <span className="text-[10px] font-bold leading-none">
                                    {(t.todo_bonus_multiplier ?? 1).toFixed(t.todo_bonus_multiplier && t.todo_bonus_multiplier % 1 === 0 ? 0 : 1)}×
                                  </span>
                                </>
                              )}
                              <Coins className="w-3 h-3" />
                              {(base * ticks).toFixed(2)}
                            </span>

                            {/* STREAK BONUS — shown separately beneath the base */}
                            {totalBonusEligible > 0 && (
                              <span className="text-[10px] font-semibold leading-none text-orange-300">
                                +{totalBonusEligible.toFixed(2)}
                              </span>
                            )}
                          </button>
                          {showTip && (
                            <div className="absolute right-0 top-full mt-1 z-10 quest-surface px-2 py-1 text-xs whitespace-nowrap shadow-lg tabular-nums">
                              {(base * ticks).toFixed(2)} + {totalBonusEligible.toFixed(2)} streak bonus
                            </div>
                          )}
                        </span>
                        {t.subtask_total > 0 && (
                          <button
                            onClick={() => setExpandedTaskId(expanded ? null : t.id)}
                            className="badge-gray text-xs tabular-nums cursor-pointer shrink-0"
                            title="Toggle checklist"
                          >
                            {t.subtask_done}/{t.subtask_total}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* SUBTASK CHECKLIST */}
                    {expanded && (
                      <SubtaskChecklist
                        task={t}
                        onToggle={(subId, done) => toggleSubtask(t.id, subId, done)}
                        onAdd={(title) => addSubtaskInline(t.id, title)}
                        onDelete={(subId) => deleteSubtaskInline(t.id, subId)}
                        readOnly
                      />
                    )}
                  </li>
                );
              })}
            </ul>

            {/* DAY VIEW — shown when the stepper is off today. Lists the viewed day's scheduled
                dailies with their state + a Complete action (the server prices late completions),
                plus any todos completed that day. */}
            {!isViewingToday && (
              <div className="space-y-3">

                {/* FROZEN-DAY NOTE */}
                {dayFrozen && (
                  <div className="flex items-center gap-2 text-xs text-cyan-400 px-3 py-2 rounded border border-cyan-500/30 bg-cyan-500/10">
                    <Snowflake className="w-4 h-4 shrink-0" />
                    This day is frozen — its dailies are excused.
                  </div>
                )}

                {/* LOADING */}
                {dayLoading && dayDailies.length === 0 && dayTodos.length === 0 && (
                  <div className="text-secondary text-sm py-6 text-center">Loading…</div>
                )}

                {/* EMPTY */}
                {!dayLoading && dayDailies.length === 0 && dayTodos.length === 0 && (
                  <div className="text-secondary text-sm py-6 text-center">Nothing scheduled or completed on this day.</div>
                )}

                {/* DAILIES */}
                {dayDailies.length > 0 && (
                  <ul className="space-y-2">
                    {dayDailies.map(({ task, state: dayState, awarded, late }) => {
                      const locked = dayState === "frozen";
                      const canCompleteNow = !locked && dayState === "pending";
                      const canRetro =
                        !locked && dayState === "missed" && retroEnabled && withinRetroLookback(effectiveViewDate);
                      const busy = dayBusyId === task.id;
                      const dotClass =
                        dayState === "done" ? "bg-green-500"
                          : dayState === "missed" ? "bg-red-500"
                          : dayState === "pending" ? "bg-blue-500"
                          : dayState === "frozen" ? "bg-cyan-400"
                          : "quest-dot-idle";
                      return (
                        <li
                          key={task.id}
                          className="flex items-center justify-between gap-2 p-2.5 rounded border quest-control"
                        >

                          {/* TASK INFO */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 truncate">
                              <span className={`w-2.5 h-2.5 rounded-full inline-block shrink-0 ${dotClass}`} />
                              <span className={`truncate text-sm ${dayState === "frozen" ? "line-through text-subtle" : ""}`}>
                                {task.title}
                              </span>
                            </div>
                            <div className="text-xs text-secondary flex items-center gap-2 mt-0.5 flex-wrap">
                              {dayState !== "frozen" && dayState !== "upcoming" && (
                                <span className="capitalize">{dayState}</span>
                              )}
                              {dayState === "done" && awarded != null && (
                                <span className="flex items-center gap-0.5 text-yellow-500">
                                  <Coins className="w-3 h-3" />{awarded.toFixed(2)}{late ? " (late)" : ""}
                                </span>
                              )}
                              {task.streak_bonus > 0 && dayState !== "done" && dayState !== "upcoming" && !locked && (
                                <span className="flex items-center gap-0.5 text-orange-400">
                                  <Flame className="w-3 h-3" />+{task.streak_bonus.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* ACTION */}
                          {dayState === "done" ? (
                            <span className="shrink-0 text-green-500"><Check className="w-5 h-5" /></span>
                          ) : locked ? (
                            <span className="shrink-0 text-cyan-400" title="Frozen day"><Snowflake className="w-4 h-4" /></span>
                          ) : canCompleteNow ? (
                            <button
                              disabled={busy}
                              onClick={() => completeForViewDate(task, effectiveViewDate)}
                              className="shrink-0 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs cursor-pointer"
                            >
                              {busy ? "…" : "Complete"}
                            </button>
                          ) : canRetro ? (
                            <button
                              disabled={busy}
                              onClick={() => completeForViewDate(task, effectiveViewDate)}
                              title={`Late completion pays ${Math.round(retroMultiplier * 100)}% of normal coins`}
                              className="shrink-0 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs cursor-pointer"
                            >
                              {busy ? "…" : `Complete · ${Math.round(retroMultiplier * 100)}%`}
                            </button>
                          ) : (
                            <span className="shrink-0 text-xs text-secondary">{dayState === "missed" ? "—" : ""}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* TODOS COMPLETED */}
                {dayTodos.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-secondary mb-1">Todos completed</div>
                    <div className="flex flex-col gap-1">
                      {dayTodos.map((td, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 p-2 rounded border quest-control text-sm">
                          <span className="flex items-center gap-2 truncate"><Check className="w-4 h-4 text-green-500 shrink-0" />{td.title}</span>
                          <span className="flex items-center gap-0.5 text-yellow-500 text-xs shrink-0"><Coins className="w-3 h-3" />{td.awarded.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* RETRO NOTE — explain when a missed past day can't be credited. */}
                {effectiveViewDate < effectiveToday && !retroEnabled && dayDailies.some((d) => d.state === "missed") && (
                  <div className="text-xs text-secondary">Retroactive completion is turned off in settings.</div>
                )}
                {effectiveViewDate < effectiveToday && retroEnabled && !withinRetroLookback(effectiveViewDate) && dayDailies.some((d) => d.state === "missed") && (
                  <div className="text-xs text-secondary">Beyond the {retroLookbackDays}-day retro window.</div>
                )}
              </div>
            )}
          </section>

          {/* HABITS CARD */}
          <section className={`card ${mobileTab === "habits" ? "" : "!hidden"} lg:!block`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-card-title">
                <Repeat className="w-5 h-5" />
                Habits
              </h2>
              <button
                onClick={openCreateHabitModal}
                className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>

            <ul className="space-y-2">
              {habits.length === 0 && (
                <li className="text-secondary text-sm">No habits yet — tap Add to define one.</li>
              )}
              {habits.map((h) => {
                const streak = visualHabitStreak(h.id);
                return (
                <li
                  key={h.id}
                  className="flex items-center gap-2 px-3 py-2.5 rounded border quest-control"
                >
                  {/* DAMAGE TAP — leading (left) side */}
                  <button
                    onClick={() => tapHabit(h.id, "negative")}
                    disabled={!h.allow_negative}
                    title="Damage"
                    className="habit-tap habit-tap-damage w-6 h-6 rounded-full flex items-center justify-center cursor-pointer disabled:cursor-not-allowed shrink-0"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <Repeat className="w-4 h-4 text-pink-400 shrink-0" aria-label="Habit" />
                  <button
                    onClick={() => openEditHabitModal(h)}
                    className="flex-1 text-left cursor-pointer min-w-0 text-sm truncate"
                    title="Edit habit"
                  >
                    {h.title}
                  </button>
                  {/* STREAK CHIP — visual only, no coin/health effect */}
                  {streak > 0 && (
                    <span
                      className="text-xs text-orange-400 flex items-center gap-0.5 shrink-0 tabular-nums"
                      title={`${streak}-day streak`}
                    >
                      <Flame className="w-3 h-3" />
                      {streak}
                    </span>
                  )}
                  {/* REWARD CHIP — coins a positive tap pays, same element as the task row's reward.
                      Mirrors lib/habitFunctions tapHabit: the manual override, else the raw
                      per-difficulty factor (no formula/streak — habits have neither). */}
                  <span
                    data-habit-reward
                    className="text-xs tabular-nums flex items-center gap-1 shrink-0 text-yellow-500"
                    title={`Reward · ${DIFF_LABELS[h.difficulty]}${h.manual_reward_override != null ? " (custom)" : ""}`}
                  >
                    <Coins className="w-3 h-3" />
                    {(h.manual_reward_override != null
                      ? Math.max(0, h.manual_reward_override)
                      : Math.max(0, factors[h.difficulty] ?? 0)
                    ).toFixed(2)}
                  </span>
                  {/* REWARD TAP — trailing (right) side */}
                  <button
                    onClick={() => tapHabit(h.id, "positive")}
                    disabled={!h.allow_positive}
                    title="Reward"
                    className="habit-tap habit-tap-reward w-6 h-6 rounded-full flex items-center justify-center cursor-pointer disabled:cursor-not-allowed shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </li>
                );
              })}
            </ul>
          </section>

          {/* SPENDING CARD — merged Rewards / Debts / Ad-hoc */}
          <section className={`card ${mobileTab === "rewards" ? "" : "!hidden"} lg:!block`}>
            <h2 className="text-card-title mb-4">
              <Wallet className="w-5 h-5" />
              Spending
            </h2>

            {/* REWARDS SUBSECTION */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-secondary mb-2 flex items-center gap-1.5">
                <Gift className="w-4 h-4" />
                Rewards
              </h3>

              {/* REWARD CREATE FORM — wraps rather than squeezing the name field in a narrow column */}
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 mb-3">
                <input
                  id="quest-reward-name"
                  type="text"
                  placeholder="Reward name"
                  maxLength={255}
                  value={newRewardName}
                  onChange={(e) => setNewRewardName(e.target.value)}
                  onKeyDown={focusOnEnter("quest-reward-cost")}
                  className="flex-1 min-w-0 sm:min-w-[7.5rem] px-3 py-2 rounded border quest-control bg-transparent"
                />

                <input
                  id="quest-reward-cost"
                  type="number"
                  placeholder="Cost"
                  min={1}
                  value={newRewardCost}
                  onChange={(e) => setNewRewardCost(e.target.value)}
                  onFocus={selectOnFocus}
                  onKeyDown={submitOnEnter(addReward)}
                  className="w-28 shrink-0 min-w-0 px-3 py-2 rounded border quest-control bg-transparent"
                />

                <button
                  onClick={addReward}
                  className="shrink-0 px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>

              {/* REWARD LIST */}
              <ul className="space-y-2">
                {rewards.length === 0 && (
                  <li className="text-secondary text-sm">No rewards yet — define what you spend coins on.</li>
                )}
                {rewards.map((r) => {
                  // A `tmp-` id means the optimistic stand-in is still awaiting its server row —
                  // spend/delete would address an id the API has never seen, so hold them until
                  // the background sync swaps the real row in.
                  const isPending = r.id.startsWith("tmp-");
                  const canAfford = balance >= r.cost && !isPending;
                  return (
                    <li key={r.id} className="flex items-center gap-2 p-3 rounded border quest-control">
                      <span className="flex-1 min-w-0 truncate" title={r.name}>{r.name}</span>

                      <span className="text-yellow-500 flex items-center gap-1 tabular-nums">
                        <Coins className="w-4 h-4" />
                        {r.cost}
                      </span>

                      <button
                        onClick={() => spendReward(r.id)}
                        disabled={!canAfford}
                        className={`px-3 py-1 rounded text-sm ${
                          canAfford
                            ? "bg-yellow-600 hover:bg-yellow-700 text-white cursor-pointer"
                            : "quest-muted cursor-not-allowed"
                        }`}
                      >
                        Spend
                      </button>

                      <button
                        onClick={() => deleteReward(r.id)}
                        disabled={isPending}
                        className="p-1.5 rounded hover:bg-red-500/20 text-red-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* DEBTS SUBSECTION */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-secondary mb-2 flex items-center gap-1.5">
                <Banknote className="w-4 h-4" />
                Debts
              </h3>

              {/* DEBT CREATE FORM — wraps rather than squeezing the name field in a narrow column */}
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 mb-3">
                <input
                  id="quest-debt-name"
                  type="text"
                  placeholder="Debt name"
                  maxLength={255}
                  value={newDebtName}
                  onChange={(e) => setNewDebtName(e.target.value)}
                  onKeyDown={focusOnEnter("quest-debt-amount")}
                  className="flex-1 min-w-0 sm:min-w-[7.5rem] px-3 py-2 rounded border quest-control bg-transparent"
                />

                <input
                  id="quest-debt-amount"
                  type="number"
                  placeholder="Amount"
                  min={1}
                  value={newDebtAmount}
                  onChange={(e) => setNewDebtAmount(e.target.value)}
                  onFocus={selectOnFocus}
                  onKeyDown={submitOnEnter(addDebt)}
                  className="w-28 shrink-0 min-w-0 px-3 py-2 rounded border quest-control bg-transparent"
                />

                <button
                  onClick={addDebt}
                  className="shrink-0 px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>

              {/* DEBT LIST */}
              <ul className="space-y-2">
                {debts.length === 0 && (
                  <li className="text-secondary text-sm">No debts — money owed will live here.</li>
                )}
                {debts.map((d) => {
                  const canPay = balance > 0;
                  return (
                    <li key={d.id} className="flex items-center gap-2 p-3 rounded border quest-control">
                      <span className="flex-1 min-w-0 truncate" title={d.name}>{d.name}</span>

                      {/* REMAINING AMOUNT */}
                      <span className="text-red-400 flex items-center gap-1 tabular-nums">
                        <Coins className="w-4 h-4" />
                        {d.amount_remaining}
                      </span>

                      {/* PAY BUTTON — sweeps available coins toward this debt */}
                      <button
                        onClick={() => payDebt(d.id)}
                        disabled={!canPay}
                        className={`px-3 py-1 rounded text-sm ${
                          canPay
                            ? "bg-yellow-600 hover:bg-yellow-700 text-white cursor-pointer"
                            : "quest-muted cursor-not-allowed"
                        }`}
                        title={canPay ? `Apply up to ${Math.floor(balance)} coins` : "No coins to apply"}
                      >
                        Pay
                      </button>

                      <button
                        onClick={() => deleteDebt(d.id)}
                        className="p-1.5 rounded hover:bg-red-500/20 text-red-500 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* AD-HOC SUBSECTION */}
            <div>
              <h3 className="text-sm font-semibold text-secondary mb-2 flex items-center gap-1.5">
                <Coins className="w-4 h-4" />
                Ad-hoc Spend
              </h3>

              <p className="text-sm text-secondary mb-3">
                Deduct coins for IRL purchases that aren&apos;t on the menu.
              </p>

              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                <input
                  id="quest-adhoc-amount"
                  type="number"
                  placeholder="Amount"
                  min={1}
                  value={adhocAmount}
                  onChange={(e) => setAdhocAmount(e.target.value)}
                  onFocus={selectOnFocus}
                  onKeyDown={focusOnEnter("quest-adhoc-note", { select: false })}
                  className="w-28 shrink-0 min-w-0 px-3 py-2 rounded border quest-control bg-transparent"
                />

                <input
                  id="quest-adhoc-note"
                  type="text"
                  placeholder="What did you buy?"
                  maxLength={500}
                  value={adhocNote}
                  onChange={(e) => setAdhocNote(e.target.value)}
                  onKeyDown={submitOnEnter(spendAdhoc)}
                  className="flex-1 min-w-0 sm:min-w-[7.5rem] px-3 py-2 rounded border quest-control bg-transparent"
                />

                <button
                  onClick={spendAdhoc}
                  className="shrink-0 px-4 py-2 rounded bg-yellow-600 hover:bg-yellow-700 text-white cursor-pointer"
                >
                  Spend
                </button>
              </div>
            </div>
          </section>

          {/* CALENDAR WIDGET CARD — full-width row under the three cards on desktop (the width is
              what earns the per-day task detail); "calendar" tab on mobile. */}
          {/* CALENDAR — desktop only (mobile's calendar tab navigates to the full page instead).
              lg:!flex, not !block: the shell is a flex column so the month grid can stretch to the
              card's 95vh height. */}
          <section className="card quest-cal-shell lg:col-span-3 !hidden lg:!flex">
            <QuestCalendarWidget
              headerActions={
                <>
                  {/* VIEW OPTIONS — same ⋮ menu the calendar page carries, in the card's header. */}
                  <button
                    ref={calendarMenuAnchor}
                    onClick={() => setCalendarMenuOpen((v) => !v)}
                    title="View options"
                    className={`p-1.5 cursor-pointer ${calendarMenuOpen ? "text-primary" : "text-secondary hover:text-primary"}`}
                  >
                    <EllipsisVertical className="w-5 h-5" />
                  </button>

                  <PopoverMenu
                    open={calendarMenuOpen}
                    onClose={() => setCalendarMenuOpen(false)}
                    anchorRef={calendarMenuAnchor}
                    className="popover-menu--wide"
                  >
                    <QuestCalendarMenu
                      view={calendarView}
                      onViewChange={changeCalendarView}
                      weekStart={calendarWeekStart}
                      onWeekStartChange={changeCalendarWeekStart}
                      hideDailyTasks={hideDailyTasksInCalendar}
                      onHideDailyTasksChange={changeHideDailyTasksInCalendar}
                    />
                  </PopoverMenu>
                </>
              }
              tasks={tasks}
              today={simulationDate ?? localTodayYMD()}
              view={calendarView}
              weekStart={calendarWeekStart}
              hideDailyTasks={hideDailyTasksInCalendar}
              overlay={
                calendarOverlay
                  && calendarOverlay.from <= addDays(calendarAnchor, -7)
                  && calendarOverlay.to >= addDays(calendarAnchor, 38)
                  ? { completions: calendarOverlay.completions, frozenDays: calendarOverlay.frozenDays, ready: true }
                  : undefined
              }
              onMonthChange={setCalendarAnchor}
              onSelectTask={openEditTaskModalById}
              onCreateTask={openCreateTaskModalOnDate}
            />

          </section>

        </div>

      </div>

      {/* TASK CREATE/EDIT MODAL — the shared editor, also rendered by the calendar page. */}
      {taskForm && (
        <QuestTaskModal
          form={taskForm}
          setForm={setTaskForm}
          editingTaskId={editingTaskId}
          advancedOpen={taskAdvancedOpen}
          setAdvancedOpen={setTaskAdvancedOpen}
          submitting={submitting}
          onClose={closeTaskModal}
          onSubmit={submitTaskForm}
          onDelete={(id) => void deleteTask(id)}
          computedReward={computedReward}
        />
      )}

      {/* HABIT MODAL */}
      {habitModalOpen && (
        <div
          className={`quest-backdrop flex items-start justify-center p-4 overflow-y-auto transition-opacity duration-150 ${
            habitModalClosing ? "opacity-0" : "opacity-100"
          }`}
          onClick={animateCloseHabitModal}
        >
          <div
            className={`quest-surface w-full max-w-md mt-12 transition-all duration-150 origin-top ${
              habitModalClosing ? "opacity-0 scale-95" : "opacity-100 scale-100"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b quest-divider">
              <div className="flex items-center gap-2">
                <button
                  onClick={animateCloseHabitModal}
                  className="p-1 rounded quest-hover cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
                <h2 className="text-lg font-semibold">
                  {editingHabitId ? "Edit" : "Create"} Habit
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {editingHabitId && (
                  <button
                    onClick={() => {
                      if (!editingHabitId) return;
                      const id = editingHabitId;
                      animateCloseHabitModal();
                      void deleteHabit(id);
                    }}
                    title="Delete habit"
                    className="h-8 px-2 rounded border border-red-500/40 text-red-500 hover:bg-red-500/10 cursor-pointer inline-flex items-center gap-1 text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={submitHabit}
                  disabled={!habitTitle.trim() || submitting || (!habitAllowPositive && !habitAllowNegative)}
                  className="h-8 px-3 rounded border border-transparent bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center"
                >
                  {submitting ? "Saving..." : editingHabitId ? "Save" : "Create"}
                </button>
              </div>
            </div>
            <div className="px-5 py-5 space-y-5">
              <label className="block">
                <span className="text-sm text-secondary">Habit Title</span>
                <input
                  type="text"
                  autoFocus
                  value={habitTitle}
                  onChange={(e) => setHabitTitle(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded border quest-control bg-transparent"
                />
              </label>
              {/* DIFFICULTY */}
              <div>
                <span className="text-sm text-secondary block mb-2">Difficulty</span>
                <div className="grid grid-cols-4 gap-2">
                  {DIFFICULTY_ORDER.map((d) => {
                    const selected = habitDifficulty === d;
                    return (
                      <button
                        key={d}
                        onClick={() => setHabitDifficulty(d)}
                        className={`flex flex-col items-center gap-1 py-3 rounded border cursor-pointer ${
                          selected
                            ? "bg-blue-600/30 border-blue-500 text-primary"
                            : "quest-control text-secondary quest-hover"
                        }`}
                      >
                        <span className="flex gap-0.5">
                          {Array.from({ length: DIFF_SPARKS[d] }).map((_, i) => (
                            <Sparkles key={i} className="w-3 h-3" />
                          ))}
                        </span>
                        <span className="text-xs font-semibold">{DIFF_LABELS[d]}</span>
                        <span className="text-xs text-yellow-500 flex items-center gap-0.5 tabular-nums">
                          <Coins className="w-3 h-3" />
                          {computedReward(d, "habit").toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CUSTOM REWARD OVERRIDE */}
              <div>
                {/* OVERRIDE TOGGLE */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={habitRewardOverrideEnabled}
                    onChange={(e) => {
                      setHabitRewardOverrideEnabled(e.target.checked);
                      setHabitRewardOverride(
                        e.target.checked ? computedReward(habitDifficulty, "habit").toFixed(2) : ""
                      );
                    }}
                    className="w-4 h-4 accent-blue-500 cursor-pointer"
                  />
                  <span className="text-sm text-secondary">Custom reward override</span>
                </label>

                {/* OVERRIDE INPUT — only when enabled */}
                {habitRewardOverrideEnabled && (
                  <div className="mt-2">
                    {/* COINS INPUT */}
                    <div className="relative">
                      <Coins className="w-4 h-4 text-yellow-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />

                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={habitRewardOverride}
                        onChange={(e) => setHabitRewardOverride(e.target.value)}
                        onBlur={(e) => setHabitRewardOverride(normalizeCoinInput(e.target.value))}
                        className="mt-0 w-full pl-9 pr-3 py-2 rounded border quest-control bg-transparent tabular-nums"
                      />
                    </div>

                    {/* OVERRIDE HELP TEXT */}
                    <p className="text-xs text-secondary mt-1">
                      Replaces the difficulty-based coin reward on a (+) tap for this habit. The (−)
                      tap&apos;s coin and HP damage stay difficulty-based.
                    </p>
                  </div>
                )}
              </div>

              {/* DIRECTIONS */}
              <div>
                <span className="text-sm text-secondary block mb-2">Directions</span>
                <div className="flex gap-2">
                  <label className="flex items-center gap-2 px-3 py-2 rounded border quest-control cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={habitAllowPositive}
                      onChange={(e) => setHabitAllowPositive(e.target.checked)}
                      className="cursor-pointer"
                    />
                    <Plus className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm">Reward (+)</span>
                  </label>
                  <label className="flex items-center gap-2 px-3 py-2 rounded border quest-control cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={habitAllowNegative}
                      onChange={(e) => setHabitAllowNegative(e.target.checked)}
                      className="cursor-pointer"
                    />
                    <Minus className="w-4 h-4 text-red-400" />
                    <span className="text-sm">Damage (−)</span>
                  </label>
                </div>
              </div>

              <p className="text-xs text-secondary">
                Coin and HP damage values per difficulty are set globally in Settings → Difficulty.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* PREVIOUS DAY REVIEW MODAL */}
      {reviewDate && reviewInitialIds && (() => {
        // Only tasks that crossed into the new day still incomplete (snapshot from when the modal
        // opened) appear here. Anything already completed on the previous day is excluded.
        const reviewList = tasks
          .filter((t) => reviewInitialIds.has(t.id))
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order);
        // Carry-over checklist subset: a freeze defers each chosen task to freezeDate + 1
        // (the server's deferTarget). Drop any task already scheduled on that target day — its
        // own cadence (or an existing deferred_to_date) already puts it there, so offering to
        // "carry it forward" would create a redundant duplicate (e.g. a daily "brush teeth" that
        // lives on both the frozen day and the next day).
        const carryTargetYMD = nextYMD(reviewDate);
        const carryOverList = reviewList.filter((t) => !isScheduledOn(t, carryTargetYMD));
        return (
          <div
            className={`quest-backdrop flex items-start justify-center p-4 overflow-y-auto transition-opacity duration-150 ${
              reviewClosing ? "opacity-0" : "opacity-100"
            }`}
          >

            {/* MODAL CARD — forced review; no outside-click or X dismissal */}
            <div
              className={`quest-surface w-full max-w-md mt-12 mb-12 transition-all duration-150 origin-top ${
                reviewClosing ? "opacity-0 scale-95" : "opacity-100 scale-100"
              }`}
            >

              {/* HEADER */}
              <div className="flex items-center justify-between gap-2 px-5 py-4 border-b quest-divider">
                <div className="flex items-center gap-2">
                  <Repeat className="w-5 h-5 text-blue-400" />
                  <h2 className="text-lg font-semibold">Previous Day Review</h2>
                </div>
                {/* SETTINGS LINK — the review modal is forced (no outside-click close), so this
                    escape hatch keeps the settings page reachable while it's open. */}
                <Link
                  href="/modules/quest/ui/settings"
                  title="Quest settings"
                  className="inline-flex p-1.5 quest-hover text-secondary hover:text-primary cursor-pointer"
                >
                  <Settings className="w-4 h-4" />
                </Link>
              </div>

              {/* BODY */}
              <div className="px-5 py-4 space-y-3">

                {/* DATE SUBHEADER */}
                <p className="text-sm text-secondary">
                  Dailies scheduled for <span className="text-primary font-medium">{reviewDate}</span>.
                  Check off anything you completed but forgot to mark.
                </p>

                {/* REVIEW LIST — incomplete-at-rollover dailies; checkboxes are local until Done */}
                {reviewList.length === 0 ? (
                  <p className="text-sm text-secondary italic">Nothing carried over — every scheduled daily was already complete.</p>
                ) : (
                  <ul className="space-y-2">
                    {reviewList.map((t) => {
                      const hasSubs = t.subtask_total > 0;
                      // Parent completion is purely manual — ticking subtasks does not auto-complete it.
                      const parentChecked = reviewCheckedIds.has(t.id);
                      const tickedSubCount = t.subtasks.filter(
                        (s) => !s.done && reviewCheckedSubtaskIds.has(`${t.id}:${s.id}`)
                      ).length;

                      const expanded = reviewExpandedTaskId === t.id;
                      const tickedSubTotal = tickedSubCount + t.subtask_done;

                      return (
                        <li
                          key={t.id}
                          className={`rounded border ${parentChecked ? "quest-divider opacity-60" : "quest-control"}`}
                        >

                          {/* PARENT ROW */}
                          <div className="flex items-center gap-2 px-3 py-1.5">
                            <button
                              onClick={() => toggleReviewItem(t.id)}
                              disabled={reviewSubmitting}
                              title={parentChecked ? "Uncheck" : "Mark complete"}
                              className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 cursor-pointer ${
                                parentChecked
                                  ? "bg-green-500/20 border-green-500/40 text-green-500 hover:bg-green-500/30"
                                  : "quest-control hover:border-green-500 hover:bg-green-500/10"
                              } ${reviewSubmitting ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              {parentChecked && <Check className="w-3 h-3" />}
                            </button>
                            <span className={`flex-1 text-sm truncate ${parentChecked ? "line-through" : ""}`}>
                              {t.title}
                            </span>
                            {hasSubs && (
                              <button
                                onClick={() => setReviewExpandedTaskId(expanded ? null : t.id)}
                                disabled={reviewSubmitting}
                                className="badge-gray text-xs tabular-nums cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Toggle checklist"
                              >
                                {tickedSubTotal}/{t.subtask_total}
                              </button>
                            )}
                            {t.streak_count > 0 && (
                              <span className="text-xs text-orange-400 flex items-center gap-0.5 tabular-nums shrink-0">
                                <Flame className="w-3 h-3" />
                                {t.streak_count}
                              </span>
                            )}
                            {t.neglect_count > 0 && (
                              <span className="text-xs text-red-400 flex items-center gap-0.5 tabular-nums shrink-0">
                                <Skull className="w-3 h-3" />
                                {t.neglect_count}
                              </span>
                            )}
                          </div>

                          {/* SUBTASK CHECKLIST (expandable) */}
                          {hasSubs && expanded && (
                            <ul className="border-t quest-divider px-3 py-1.5 space-y-1">
                              {t.subtasks.map((s) => {
                                const key = `${t.id}:${s.id}`;
                                const subChecked = s.done || reviewCheckedSubtaskIds.has(key);
                                const subLocked = s.done; // already complete on an earlier day
                                return (
                                  <li key={s.id} className="flex items-center gap-2 pl-6">
                                    <button
                                      onClick={() => !subLocked && toggleReviewSubtask(t.id, s.id)}
                                      disabled={reviewSubmitting || subLocked}
                                      title={subLocked ? "Already complete" : subChecked ? "Uncheck" : "Mark complete"}
                                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                        subLocked ? "cursor-default" : "cursor-pointer"
                                      } ${
                                        subChecked
                                          ? "bg-green-500/20 border-green-500/40 text-green-500"
                                          : "quest-control hover:border-green-500 hover:bg-green-500/10"
                                      } ${reviewSubmitting ? "opacity-50 cursor-not-allowed" : ""}`}
                                    >
                                      {subChecked && <Check className="w-2.5 h-2.5" />}
                                    </button>
                                    <span className={`flex-1 text-xs truncate ${subChecked ? "line-through text-secondary" : ""}`}>
                                      {s.title}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* FREEZE OPTIONS — visible only after the user clicks "Freeze yesterday". Lives
                  above the footer so the carry-over checklist gets full modal width and isn't
                  squeezed into a footer row. The list shows the same snapshot the review modal
                  used (incomplete-at-rollover dailies); the user opts in per task. */}
              {freezeConfirmOpen && (
                <div className="px-5 py-3 border-t quest-divider space-y-3">

                  {/* CONFIRM PROMPT */}
                  <p className="text-xs text-secondary">
                    Forfeit <span className="text-primary">{reviewDate}</span>&apos;s rewards in exchange for no damage. Optionally carry tasks forward to today.
                  </p>

                  {/* CARRY-OVER CHECKLIST — carryOverList excludes tasks already scheduled on the
                      carry target day so the same daily isn't offered twice. */}
                  {carryOverList.length === 0 ? (
                    <p className="text-xs text-secondary italic">Nothing to carry over.</p>
                  ) : (
                    <ul className="space-y-1 max-h-48 overflow-y-auto">
                      {carryOverList.map((t) => {
                        const checked = freezeDeferIds.has(t.id);
                        return (
                          <li key={t.id} className="flex items-center gap-2">
                            <button
                              onClick={() => toggleFreezeDeferId(t.id)}
                              disabled={freezingDay}
                              title={checked ? "Don't carry to today" : "Carry to today"}
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer ${
                                checked
                                  ? "bg-blue-500/30 border-blue-400 text-blue-300"
                                  : "quest-control hover:border-blue-400 hover:bg-blue-500/10"
                              } ${freezingDay ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              {checked && <Check className="w-2.5 h-2.5" />}
                            </button>
                            <span className="flex-1 text-xs truncate">
                              {t.title}
                            </span>
                            <span className="text-[10px] text-secondary shrink-0">
                              {checked ? "→ today" : "skip"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* CONFIRM ACTIONS */}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setFreezeConfirmOpen(false); setFreezeDeferIds(new Set()); }}
                      disabled={freezingDay}
                      className="px-2 py-1 rounded border quest-control quest-hover text-xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={freezeReviewDay}
                      disabled={freezingDay}
                      className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs cursor-pointer"
                    >
                      {freezingDay
                        ? "Freezing…"
                        : freezeDeferIds.size > 0
                          ? `Freeze + carry ${freezeDeferIds.size}`
                          : "Yes, freeze"}
                    </button>
                  </div>
                </div>
              )}

              {/* FOOTER */}
              <div className="flex justify-between items-center gap-3 px-5 py-3 border-t quest-divider">

                {/* FREEZE LINK — hidden once the freeze options panel is open (the panel owns
                    the Cancel/confirm controls). */}
                {!freezeConfirmOpen ? (
                  <button
                    onClick={() => setFreezeConfirmOpen(true)}
                    disabled={reviewSubmitting || freezingDay}
                    className="text-xs text-secondary hover:text-primary underline disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    title="Skip damage for this day; forfeits any rewards credited for it"
                  >
                    Freeze yesterday
                  </button>
                ) : (
                  <span />
                )}

                {/* DONE */}
                <button
                  onClick={acknowledgeReview}
                  disabled={reviewSubmitting || freezingDay}
                  className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm cursor-pointer"
                >
                  {reviewSubmitting ? "Finalizing…" : "Done"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* SHORT REST (GAMBLE FOR HEALTH) OVERLAY */}
      {gambleOpen && (
        <div
          className={`quest-backdrop flex items-center justify-center p-4 transition-opacity duration-150 ${
            gambleClosing ? "opacity-0" : "opacity-100"
          }`}
          onClick={closeGamble}
        >
          <div
            className={`quest-surface !border-red-500/40 w-full max-w-sm p-6 text-center transition-all duration-150 ${
              gambleClosing ? "opacity-0 scale-95" : "opacity-100 scale-100"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* TITLE */}
            <h2 className="text-xl font-bold text-primary mb-1 flex items-center justify-center gap-2">
              <Dices className="w-6 h-6 text-red-400" />
              Short Rest
            </h2>

            {/* SUBTITLE */}
            <p className="text-secondary text-sm mb-1">
              Gamble <span className="text-yellow-500 font-semibold">{gambleCost}</span> coins to roll a d{GAMBLE_DIE_SIDES} and recover that many HP.
            </p>

            {/* ESCALATION NOTE — each rest this week raises the next one's price; resets weekly */}
            <p className="text-secondary text-xs mb-4 opacity-80">
              {gambleRollsThisWeek === 0
                ? `Each rest this week costs ${GAMBLE_COST_STEP} more than the last. Resets ${weekStartDayName(gambleWeekStartDay)}.`
                : `${gambleRollsThisWeek} rest${gambleRollsThisWeek === 1 ? "" : "s"} this week — next costs +${GAMBLE_COST_STEP}. Resets ${weekStartDayName(gambleWeekStartDay)}.`}
            </p>

            {/* DIE — d20 silhouette; tumbles while rolling, pops on settle */}
            <div className="flex justify-center mb-3">
              <div
                key={gambleRolling ? `rolling-${gambleRollSeq}` : `settled-${gambleRollSeq}`}
                className={`w-28 h-28 ${gambleDieColor} ${
                  gambleRolling ? "quest-dice-rolling" : gambleResult ? "quest-dice-settle" : ""
                }`}
              >
                <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
                  <polygon points="50,3 94,28 94,72 50,97 6,72 6,28" />
                  <polygon points="50,3 94,72 6,72" strokeWidth="2" className="opacity-50" />
                  <line x1="50" y1="3" x2="50" y2="72" strokeWidth="1.5" className="opacity-30" />
                  <text x="50" y="62" textAnchor="middle" fontSize="34" fontWeight="700" fill="currentColor" stroke="none">{gambleFace}</text>
                </svg>
              </div>
            </div>

            {/* RESULT / STATUS LINE */}
            <div className="h-6 mb-3 text-sm flex items-center justify-center">
              {gambleRolling ? (
                <span className="text-blue-400">Rolling…</span>
              ) : gambleResult ? (
                <span className="font-semibold text-primary">
                  Rolled <span className={gambleDieColor}>{gambleResult.roll}</span> · +{gambleResult.healed} HP
                  {gambleResult.healed < gambleResult.roll ? " (capped)" : ""}
                </span>
              ) : (
                <span className="text-secondary">Roll the die to recover health.</span>
              )}
            </div>

            {/* HP BAR */}
            <div className="flex items-center gap-2 mb-2 text-sm">
              <Heart className="w-4 h-4 text-red-500 shrink-0" />
              <div className="flex-1 h-2 quest-track rounded overflow-hidden">
                <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${hpPercent}%` }} />
              </div>
              <span className="tabular-nums text-secondary shrink-0">{state.health}/{state.max_health}</span>
            </div>

            {/* BALANCE */}
            <div className="flex items-center justify-center gap-1 mb-4 text-sm text-yellow-500">
              <Coins className="w-4 h-4" />
              <span className="tabular-nums font-semibold">{Number(balance).toFixed(2)}</span>
            </div>

            {/* ACTIONS */}
            <div className="flex gap-2">
              <button
                onClick={rollGamble}
                disabled={gambleRolling || balance < gambleCost || state.health >= state.max_health}
                className="flex-1 px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <Dices className="w-4 h-4" />
                {gambleRolling
                  ? "Rolling…"
                  : state.health >= state.max_health
                    ? "Fully rested"
                    : `Roll · −${gambleCost}`}
              </button>
              <button
                onClick={closeGamble}
                disabled={gambleRolling}
                className="px-4 py-2 rounded border quest-control quest-hover text-secondary hover:text-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Done
              </button>
            </div>

            {/* INSUFFICIENT-COINS HINT */}
            {balance < gambleCost && state.health < state.max_health && (
              <p className="text-red-400 text-xs mt-2">Not enough coins — this short rest costs {gambleCost}.</p>
            )}
          </div>
        </div>
      )}

      {/* DEATH MODAL */}
      {deathInfo && (
        <div
          className={`quest-backdrop flex items-center justify-center p-4 transition-opacity duration-150 ${
            deathModalClosing ? "opacity-0" : "opacity-100"
          }`}
          onClick={animateCloseDeathModal}
        >
          <div
            className={`quest-surface !border-red-500/40 w-full max-w-sm p-6 text-center transition-all duration-150 ${
              deathModalClosing ? "opacity-0 scale-95" : "opacity-100 scale-100"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-3">
              <Heart className="w-12 h-12 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-red-500 mb-2">You Died</h2>
            <p className="text-secondary mb-4">
              Caused by {deathInfo.reason}. Lost{" "}
              <span className="text-yellow-500 font-semibold">{deathInfo.coins_lost}</span> coins.
              Health restored.
            </p>
            <button
              onClick={animateCloseDeathModal}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SubtaskChecklist({
  task,
  onToggle,
  onAdd,
  onDelete,
  readOnly = false,
}: {
  task: Task;
  onToggle: (subId: string, done: boolean) => void;
  onAdd: (title: string) => void;
  onDelete: (subId: string) => void;
  readOnly?: boolean;
}) {
  const [newTitle, setNewTitle] = useState("");
  return (
    <div className="ml-9 mr-2 mt-1 mb-2 space-y-1">
      {task.subtasks.map((s) => (
        <div key={s.id} className="flex items-center gap-2 text-sm">
          <button
            onClick={() => onToggle(s.id, s.done)}
            className={`w-4 h-4 rounded-sm border flex items-center justify-center cursor-pointer ${
              s.done ? "bg-green-500/30 border-green-500/50 text-green-500" : "quest-control"
            }`}
          >
            {s.done && <Check className="w-3 h-3" />}
          </button>
          <span className={`flex-1 ${s.done ? "line-through text-secondary" : ""}`}>{s.title}</span>
          {!readOnly && (
            <button
              onClick={() => onDelete(s.id)}
              className="p-1 rounded hover:bg-red-500/20 text-red-500 cursor-pointer"
              title="Remove"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="flex gap-2 mt-1">
          <input
            type="text"
            placeholder="New checklist entry"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTitle.trim()) {
                onAdd(newTitle);
                setNewTitle("");
              }
            }}
            className="flex-1 px-2 py-1 rounded border quest-control bg-transparent text-sm"
          />
          <button
            onClick={() => {
              if (newTitle.trim()) {
                onAdd(newTitle);
                setNewTitle("");
              }
            }}
            className="px-2 py-1 rounded border quest-control quest-hover cursor-pointer"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
