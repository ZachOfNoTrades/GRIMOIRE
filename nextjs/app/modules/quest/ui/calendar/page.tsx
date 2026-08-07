"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { BackLink } from "@/components/BackLink";
import toast, { Toaster } from "react-hot-toast";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  ArrowLeft,
  Coins,
  Flame,
  Snowflake,
  ArrowRight,
  EllipsisVertical,
  Star,
} from "lucide-react";
import { Difficulty, TaskKind, Frequency, repeatModeApplies } from "../../types/task";
import QuestTaskItem from "../../components/QuestTaskItem";
import QuestCalendarWidget, { QUEST_LEGEND } from "../../components/QuestCalendarWidget";
import QuestCalendarMenu, { WEEK_START_OPTIONS } from "../../components/QuestCalendarMenu";
import { CALENDAR_PREF_DEFAULTS, CalendarView, readCalendarPrefs, writeCalendarPrefs } from "../../lib/calendarPrefs";
import PopoverMenu from "@/components/PopoverMenu";
import QuestTaskModal from "../../components/QuestTaskModal";
import { TaskFormState, taskToForm } from "../../types/taskForm";
import { useChipFit } from "../../lib/useChipFit";
import {
  ScheduleShape,
  ymd,
  parseYMD,
  addDays,
  isOccurrenceOn,
  activeOccurrenceStart,
  occurrenceWindowEnd,
} from "../../lib/scheduleClient";

// ── Types ────────────────────────────────────────────────────────────────────────────────────
interface Task extends ScheduleShape {
  id: string;
  title: string;
  // Carried so the shared editor can open a task straight from a chip (see QuestTaskModal).
  description: string | null;
  manual_reward_override: number | null;
  subtasks: { id: string; title: string; done: boolean }[];
  reminders: { fire_time: string; fire_date: string | null }[];
  difficulty: Difficulty;
  kind: TaskKind;
  reward_value: number;
  streak_bonus: number;
  last_completed_date: string | null;
  frequency: Frequency;
  // Used by the Today rows (home-style layout via QuestTaskItem).
  streak_count: number;
  neglect_count: number;
  done_today: boolean;
  status: "open" | "done";
}

interface Completion {
  task_id: string;
  completed_on: string;
  awarded: number;
  late: boolean;
}

// Chip colour variants — mirrors QuestCalendarWidget so both calendars read the same.
type EntryKind = "daily" | "weekly" | "monthly" | "yearly" | "todo";
type DayState = "done" | "missed" | "pending" | "upcoming" | "frozen";

interface DayDaily {
  task: Task;
  state: DayState;
  occStart: string; // first day of this occurrence's completion window
  windowEnd: string;
  awarded: number | null; // coins recorded for this occurrence, when done
  late: boolean;
  movedTo: string | null; // when migrated to another day via a freeze carry-over, the target date
  carriedHere: boolean; // this day IS the freeze carry-over target (deferred_to_date === day)
}

interface CellChip {
  id: string;
  title: string;
  state: DayState;
  // Grace window (window_days > 1): one occurrence drawn as a bar across its days. Null = one day.
  // `lead` marks the segment that carries the label — the occurrence's first day, or the first day
  // of a week row it continues into — and `cols` is how many of this row's days it still covers, so
  // the label can run the width of the span instead of being truncated in one cell.
  // `continues` = runs past the end of the VISIBLE GRID, so its end isn't on screen — that's what
  // earns a trailing arrow. Wrapping to the next row doesn't: you can see where it finishes.
  span: { isStart: boolean; isEnd: boolean; lead: boolean; cols: number; continues: boolean } | null;
  // Chip colour = the task's cadence (matches the home page's calendar); completion state only
  // strikes it through / underlines it.
  kind: EntryKind;
  period: number;
  movedTo: string | null; // migrated OFF this (frozen) day → shown struck/arrowed, not "missed"
  carriedHere: boolean; // carried INTO this day from a frozen day → snowflake
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Build the month grid (weeks of 7, Sunday-first) covering the month containing anchorYMD,
// padded with leading/trailing days from adjacent months.
// Always six rows: a 5-week month would otherwise stretch its rows taller than a 6-week month, so
// cell height (and how many chips fit) would change as you page through the year.
const MONTH_ROWS = 6;

function buildMonthMatrix(anchorYMD: string, weekStart = 0): { date: string; inMonth: boolean }[][] {
  const a = parseYMD(anchorYMD);
  const year = a.getFullYear();
  const month = a.getMonth();
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const cur = new Date(first);
  // Back up to the week's first day on/before the 1st — `weekStart` decides which weekday that is.
  cur.setDate(1 - ((first.getDay() - weekStart + 7) % 7));
  const weeks: { date: string; inMonth: boolean }[][] = [];
  while (true) {
    const week: { date: string; inMonth: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      week.push({ date: ymd(cur), inMonth: cur.getMonth() === month });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
    if (cur > lastDay && weeks.length >= MONTH_ROWS) break;
  }
  return weeks;
}

// The 7 days of the week containing anchorYMD, starting on weekStart (0=Sun … 6=Sat).
function buildWeek(anchorYMD: string, weekStart: number): string[] {
  const a = parseYMD(anchorYMD);
  const offset = (a.getDay() - weekStart + 7) % 7;
  const start = new Date(a);
  start.setDate(a.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return ymd(d);
  });
}

// Approximate days between occurrences — bigger = rarer. Drives the "rarest first" cell sort and
// the rare ★ marker, so an infrequent task (e.g. monthly) is never buried under daily ones.
function periodDays(t: Task): number {
  const n = Math.max(1, t.every_n || 1);
  if (t.frequency === "yearly") return 365 * n;
  if (t.frequency === "monthly") return 30 * n;
  if (t.frequency === "weekly") return 7 * n;
  if (t.days_of_week) {
    const days = t.days_of_week.split(",").map((s) => s.trim()).filter(Boolean).length || 7;
    return Math.max(1, 7 / days);
  }
  return n; // every_n days
}

// The chip variant for a task: its repeat frequency, or "todo" for a one-off.
function entryKind(t: Task): EntryKind {
  return t.kind === "todo" ? "todo" : t.frequency;
}

// What the chip's decoration means, spelled out for its tooltip.
function chipStateNote(chip: CellChip): string {
  if (chip.movedTo) return "carried to another day";
  if (chip.state === "done") return "done";
  if (chip.state === "frozen") return "excused (frozen day)";
  if (chip.state === "missed") return "missed — its completion window closed";
  if (chip.state === "upcoming") return "upcoming";
  return "due";
}

// Chip classes: the frequency variant carries the colour, the state only mutes / marks it.
function chipClass(chip: CellChip): string {
  const settled = chip.state === "done" || chip.state === "frozen" || chip.movedTo !== null;
  return [
    "qcal-chip",
    `qcal-chip--${chip.kind}`,
    settled ? "qcal-chip--settled" : "",
    chip.state === "missed" ? "qcal-chip--missed" : "",
    // A spanning occurrence: the lead segment is widened to cover the days it spans, so the whole
    // thing reads as one bar rather than a row of separate chips.
    chip.span ? "qcal-chip--span" : "",
    chip.span?.lead ? "qcal-chip--span-lead" : "",
    chip.span && !chip.span.lead ? "qcal-chip--span-spacer" : "",
  ].filter(Boolean).join(" ");
}

// Whole days from `fromYMD` to `toYMD` (negative if `to` is earlier).
function dayDiff(fromYMD: string, toYMD: string): number {
  return Math.round((parseYMD(toYMD).getTime() - parseYMD(fromYMD).getTime()) / 86400000);
}

export default function QuestCalendarPage() {

  // DATA
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [frozenDays, setFrozenDays] = useState<Set<string>>(new Set());
  // The range the loaded completions cover. Until it covers what's on screen the grid would paint
  // completed occurrences as due/missed for a frame — a flash of wrong state on load and on every
  // month change.
  const [loaded, setLoaded] = useState<{ from: string; to: string } | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [today, setToday] = useState<string | null>(null);
  const [retroEnabled, setRetroEnabled] = useState<boolean>(true);
  const [retroMultiplier, setRetroMultiplier] = useState<number>(0.5);
  const [retroLookbackDays, setRetroLookbackDays] = useState<number>(14);

  // INPUT
  const [view, setView] = useState<CalendarView>(CALENDAR_PREF_DEFAULTS.calendarView);
  // Seeded with the local month so the completions fetch can start alongside the initial batch
  // rather than after it; a server-side simulation date corrects it when /api/state lands.
  const [anchor, setAnchor] = useState<string>(() => ymd(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // First day of week for WEEK view only (month view stays Sunday-first). Default Monday;
  // persisted locally since it's a display-only preference.
  const [weekStart, setWeekStart] = useState<number>(CALENDAR_PREF_DEFAULTS.calendarWeekStart);
  // Drop every-day tasks from the day cells so the weekly/monthly ones stand out (default on).
  const [hideDailyTasks, setHideDailyTasks] = useState<boolean>(true);
  // Phone-only ⋮ menu holding the view options the narrow toolbar has no room for.
  const [viewMenuOpen, setViewMenuOpen] = useState<boolean>(false);
  const viewMenuAnchor = useRef<HTMLButtonElement>(null);
  // The menu that lives in the calendar card's header (desktop month view).
  const cardMenuAnchor = useRef<HTMLButtonElement>(null);
  const [cardMenuOpen, setCardMenuOpen] = useState<boolean>(false);

  // TASK EDITOR — the same modal the home page opens, so a task edits identically from either
  // screen. Saving here just PUTs and refetches; there is no optimistic task list to keep in sync.
  const [taskForm, setTaskForm] = useState<TaskFormState | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskAdvancedOpen, setTaskAdvancedOpen] = useState<boolean>(false);
  const [savingTask, setSavingTask] = useState<boolean>(false);
  // Per-difficulty coin values, for the editor's difficulty picker.
  const [factors, setFactors] = useState<Record<Difficulty, number>>({ easy: 0, medium: 0, hard: 0, max: 0 });

  function openTaskEditor(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    setEditingTaskId(task.id);
    setTaskAdvancedOpen((task.window_days ?? 1) > 1);
    setTaskForm(taskToForm(task));
  }

  async function saveTaskEdits() {
    if (!taskForm || !editingTaskId) return;
    const title = taskForm.title.trim();
    if (!title) return;
    setSavingTask(true);
    try {
      const res = await fetch(`/modules/quest/api/tasks/${editingTaskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: taskForm.description.trim() || null,
          difficulty: taskForm.difficulty,
          kind: taskForm.kind,
          frequency: taskForm.frequency,
          repeat_mode: repeatModeApplies(taskForm.frequency) ? taskForm.repeat_mode : null,
          every_n: Number(taskForm.every_n) || 1,
          days_of_week: taskForm.days_of_week.length > 0 ? taskForm.days_of_week.join(",") : null,
          start_date: taskForm.start_date || null,
          window_days: Math.max(1, Number(taskForm.window_days) || 1),
          manual_reward_override: taskForm.reward_override.trim() === "" ? null : Number(taskForm.reward_override),
          reminders: taskForm.reminders,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setTaskForm(null);
      setEditingTaskId(null);
      await Promise.all([refetchTasks(), loadCompletions()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingTask(false);
    }
  }

  async function deleteTaskFromEditor(id: string) {
    setTaskForm(null);
    setEditingTaskId(null);
    try {
      const res = await fetch(`/modules/quest/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      await Promise.all([refetchTasks(), loadCompletions()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  // STATE
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null); // `${taskId}:${date}` being submitted

  // The visible date range [from, to] for the current view+anchor — drives the completions fetch.
  const range = useMemo(() => {
    if (!anchor) return null;
    if (view === "month") {
      const weeks = buildMonthMatrix(anchor, weekStart);
      return { from: weeks[0][0].date, to: weeks[weeks.length - 1][6].date };
    }
    const wk = buildWeek(anchor, weekStart);
    return { from: wk[0], to: wk[6] };
  }, [view, anchor, weekStart]);

  // Deep-link: ?date=YYYY-MM-DD (e.g. from the home widget) opens that day's detail modal and
  // focuses its month. Read from the URL directly to avoid a Suspense boundary for useSearchParams.
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setAnchor(d);
      setSelectedDate(d);
    }
  }, []);

  // Restore every calendar preference on mount — shared with the home page's calendar card.
  useEffect(() => {
    const prefs = readCalendarPrefs();
    setHideDailyTasks(prefs.hideDailyTasksInCalendar);
    setView(prefs.calendarView);
    setWeekStart(prefs.calendarWeekStart);
  }, []);

  function changeHideDailyTasks(value: boolean) {
    setHideDailyTasks(value);
    writeCalendarPrefs({ hideDailyTasksInCalendar: value });
  }

  function changeView(value: CalendarView) {
    setView(value);
    writeCalendarPrefs({ calendarView: value });
  }

  function changeWeekStart(n: number) {
    setWeekStart(n);
    writeCalendarPrefs({ calendarWeekStart: n });
  }

  // INITIAL LOAD — tasks, settings, balance, and the effective "today" (honors simulation_date).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tasksRes, settingsRes, balanceRes, stateRes] = await Promise.all([
          fetch("/modules/quest/api/tasks"),
          fetch("/modules/quest/api/settings"),
          fetch("/modules/quest/api/balance"),
          fetch("/modules/quest/api/state"),
        ]);
        if (!tasksRes.ok) throw new Error("Failed to load tasks");
        const tasksData = await tasksRes.json();
        const settingsData = settingsRes.ok ? await settingsRes.json() : {};
        const balanceData = balanceRes.ok ? await balanceRes.json() : { balance: 0 };
        const stateData = stateRes.ok ? await stateRes.json() : {};
        if (cancelled) return;
        setTasks(Array.isArray(tasksData) ? tasksData : []);
        setBalance(Number(balanceData?.balance ?? 0));
        if (settingsData?.factors) setFactors(settingsData.factors as Record<Difficulty, number>);
        setRetroEnabled(Boolean(settingsData?.retroCompletionEnabled ?? true));
        setRetroMultiplier(Number(settingsData?.retroCompletionMultiplier ?? 0.5));
        setRetroLookbackDays(Number(settingsData?.retroLookbackDays ?? 14));
        const eff = typeof stateData?.today === "string" ? stateData.today : ymd(new Date());
        setToday(eff);
        setAnchor((prev) => prev || eff);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load calendar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // RANGE LOAD — refetch the dated completions whenever the visible range changes.
  // Fetches a WIDE window (about three months either side of what's visible). The endpoint costs
  // the same whatever the range, so paying once beats paying per step, and the effect below widens
  // it again in the background before the visible month reaches the edge.
  const loadCompletions = useCallback(async () => {
    if (!range) return;
    const from = addDays(range.from, -100);
    const to = addDays(range.to, 100);
    try {
      const res = await fetch(`/modules/quest/api/tasks/completions?from=${from}&to=${to}`);
      if (!res.ok) return;
      const data = await res.json();
      setCompletions(Array.isArray(data?.completions) ? data.completions : []);
      setFrozenDays(new Set(Array.isArray(data?.frozenDays) ? data.frozenDays : []));
      setLoaded({ from, to });
    } catch {
      // best-effort — the grid stays blank rather than showing an unverified overlay
    }
  }, [range]);

  // Covered = what we hold describes the visible range, so it renders with no fetch at all.
  const overlayReady = !!range && !!loaded && loaded.from <= range.from && loaded.to >= range.to;
  // Still covered, but close enough to the window's edge that the next step might not be — widen
  // now, in the background, while the current month is already drawn.
  const nearEdge = !!range && !!loaded && overlayReady
    && (range.from < addDays(loaded.from, 40) || range.to > addDays(loaded.to, -40));

  useEffect(() => {
    if (overlayReady && !nearEdge) return;
    loadCompletions();
  }, [loadCompletions, overlayReady, nearEdge]);

  // How many chips fit a day cell at this viewport — re-measured whenever the grid changes shape or
  // its contents arrive.
  const chipFit = useChipFit([view, anchor, weekStart, hideDailyTasks, loading, overlayReady]);

  // Map task_id -> sorted completion dates (for window-aware done checks).
  const completionsByTask = useMemo(() => {
    const m = new Map<string, Completion[]>();
    for (const c of completions) {
      const list = m.get(c.task_id) ?? [];
      list.push(c);
      m.set(c.task_id, list);
    }
    return m;
  }, [completions]);

  // The dailies active on `day` — including every day of a multi-day grace window (a window_days>1
  // task stays completable, so it shows on each day of its window, matching the home "active today"
  // rule), plus any task carried here via a freeze deferral.
  const dailiesForDay = useCallback(
    (day: string): DayDaily[] => {
      // Hold off until the completion overlay covers this range (see overlayReady).
      if (!today || !overlayReady) return [];
      const frozen = frozenDays.has(day);
      const out: DayDaily[] = [];
      for (const t of tasks) {
        if (t.kind !== "daily") continue;
        if (!isOccurrenceOn(t, day)) continue;
        // The occurrence whose grace window covers `day` (its start), and that window's last day.
        // Done/missed are judged over the whole window so any day of it reflects the same state.
        const occStart = activeOccurrenceStart(t, day) ?? day;
        const windowEnd = occurrenceWindowEnd(t, day) ?? day;
        const recs = completionsByTask.get(t.id) ?? [];
        const doneRec = recs.find((c) => c.completed_on >= occStart && c.completed_on <= windowEnd);
        // Migrated away: ONLY on the original frozen day this occurrence was carried OFF of. A freeze
        // carry always defers to (frozen day + 1), so the original day is exactly deferred_to_date - 1.
        // deferred_to_date is a single field, so we must NOT treat every other occurrence as migrated.
        const movedTo =
          frozen && t.deferred_to_date && addDays(day, 1) === t.deferred_to_date
            ? t.deferred_to_date
            : null;
        let state: DayState;
        if (doneRec) state = "done";
        else if (frozen) state = "frozen";
        else if (windowEnd < today) state = "missed";
        else if (day > today) state = "upcoming";
        else state = "pending";
        out.push({
          task: t,
          state,
          occStart,
          windowEnd,
          awarded: doneRec ? doneRec.awarded : null,
          late: doneRec ? doneRec.late : false,
          movedTo,
          carriedHere: t.deferred_to_date === day,
        });
      }
      return out;
    },
    [tasks, today, completionsByTask, frozenDays, overlayReady],
  );

  // Todos completed on `day` (read-only history; todos have no schedule of their own).
  const todosForDay = useCallback(
    (day: string): { title: string; awarded: number }[] => {
      const byId = new Map(tasks.map((t) => [t.id, t]));
      return completions
        .filter((c) => c.completed_on === day && byId.get(c.task_id)?.kind === "todo")
        .map((c) => ({ title: byId.get(c.task_id)?.title ?? "Todo", awarded: c.awarded }));
    },
    [completions, tasks],
  );

  // Per-cell task chips, sorted RAREST-FIRST so an infrequent task (e.g. monthly) always claims a
  // chip slot and the daily ones collapse under "+N more".
  // `rowEnd` is the last day of the week row `day` is drawn in — a spanning bar can only flow its
  // label as far as that, and restarts on the next row.
  const cellChips = useCallback(
    (day: string, rowStart: string, rowEnd: string): CellChip[] => {
      return dailiesForDay(day)
        // "Daily" = the task's Repeats setting, matching the task modal's wording.
        .filter((i) => !hideDailyTasks || i.task.frequency !== "daily")
        .map((i) => ({
          id: i.task.id,
          title: i.task.title,
          state: i.state,
          span: i.windowEnd > i.occStart
            ? {
                isStart: day === i.occStart,
                isEnd: day === i.windowEnd,
                lead: day === i.occStart || day === rowStart,
                cols: dayDiff(day, i.windowEnd < rowEnd ? i.windowEnd : rowEnd) + 1,
                continues: !!range && i.windowEnd > range.to,
              }
            : null,
          kind: entryKind(i.task),
          period: periodDays(i.task),
          movedTo: i.movedTo,
          carriedHere: i.carriedHere,
        }))
        .sort((a, b) => {
          // Spanning occurrences take the top lanes, in the same order, in every cell they cross —
          // otherwise the bar's continuation in one cell sits a lane below the bar in the next and the
          // two read as separate bubbles.
          if (!!a.span !== !!b.span) return a.span ? -1 : 1;
          if (a.span && b.span && a.span.cols !== b.span.cols) return b.span.cols - a.span.cols;
          return b.period - a.period || a.title.localeCompare(b.title);
        });
    },
    [dailiesForDay, hideDailyTasks],
  );

  const withinLookback = useCallback(
    (day: string) => !!today && day >= addDays(today, -retroLookbackDays),
    [today, retroLookbackDays],
  );

  // COMPLETE — credit a daily for `day`. The server prices it (full when on-time / today, reduced
  // when its window has closed) and records the dated completion; we then refetch the overlay.
  async function completeForDay(task: Task, day: string) {
    const key = `${task.id}:${day}`;
    setBusyKey(key);
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
        toast(`Already credited`, { icon: "✓" });
      }
      await Promise.all([loadCompletions(), refetchTasks()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to complete");
    } finally {
      setBusyKey(null);
    }
  }

  async function refetchTasks() {
    try {
      const res = await fetch("/modules/quest/api/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(Array.isArray(data) ? data : []);
      }
    } catch {
      // keep stale tasks on failure
    }
  }

  async function refetchBalance() {
    try {
      const res = await fetch("/modules/quest/api/balance");
      if (res.ok) setBalance(Number((await res.json())?.balance ?? 0));
    } catch {
      // keep stale balance on failure
    }
  }

  // UNCOMPLETE — undo today's completion from the Today rows (mirrors the home checkbox toggle).
  async function uncompleteToday(task: Task) {
    const key = `${task.id}:${selectedDate}`;
    setBusyKey(key);
    try {
      const res = await fetch(`/modules/quest/api/tasks/${task.id}/uncomplete`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to uncheck");
      await Promise.all([loadCompletions(), refetchTasks(), refetchBalance()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to uncheck");
    } finally {
      setBusyKey(null);
    }
  }

  // MIGRATE — carry a daily off a frozen yesterday forward to today (after-the-fact carry-over).
  async function migrateToToday(task: Task) {
    const key = `mig:${task.id}`;
    setBusyKey(key);
    try {
      const res = await fetch(`/modules/quest/api/tasks/${task.id}/migrate-to-today`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to migrate");
      toast.success("Migrated to today");
      await Promise.all([loadCompletions(), refetchTasks()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to migrate");
    } finally {
      setBusyKey(null);
    }
  }

  function shiftAnchor(dir: -1 | 1) {
    if (!anchor) return;
    if (view === "month") {
      const a = parseYMD(anchor);
      setAnchor(ymd(new Date(a.getFullYear(), a.getMonth() + dir, 1)));
    } else {
      setAnchor(addDays(anchor, dir * 7));
    }
  }

  const headingLabel = useMemo(() => {
    if (!anchor) return "";
    const a = parseYMD(anchor);
    if (view === "month") return `${MONTH_LABELS[a.getMonth()]} ${a.getFullYear()}`;
    const wk = buildWeek(anchor, weekStart);
    const s = parseYMD(wk[0]);
    const e = parseYMD(wk[6]);
    const sLbl = `${MONTH_LABELS[s.getMonth()].slice(0, 3)} ${s.getDate()}`;
    const eLbl = `${MONTH_LABELS[e.getMonth()].slice(0, 3)} ${e.getDate()}`;
    return `${sLbl} – ${eLbl}, ${e.getFullYear()}`;
  }, [view, anchor, weekStart]);

  const multiplierPct = Math.round(retroMultiplier * 100);

  // ── Render ───────────────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page">
        <div className="page-container">
          {/* LOADING PLACEHOLDER */}
          <div className="text-secondary py-12 text-center">Loading calendar…</div>
        </div>
      </div>
    );
  }

  const monthWeeks = view === "month" && anchor ? buildMonthMatrix(anchor, weekStart) : [];
  const weekDays = view === "week" && anchor ? buildWeek(anchor, weekStart) : [];
  // Weekday header: month view is always Sunday-first; week view follows the chosen first day.
  // Both views start their rows on `weekStart`, so the headings rotate to match.
  const headerLabels = Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(weekStart + i) % 7]);
  const selectedDailies = selectedDate ? dailiesForDay(selectedDate) : [];
  const selectedTodos = selectedDate ? todosForDay(selectedDate) : [];
  const yesterday = today ? addDays(today, -1) : null;
  // Split a frozen day's dailies into the ones carried forward (migrated) and the ones left behind.
  const migratedDailies = selectedDailies.filter((d) => d.movedTo);
  const nonMigratedDailies = selectedDailies.filter((d) => !d.movedTo);
  // After-the-fact carry is only possible when the selected day is a frozen *yesterday*.
  const canMigrateDay = !!selectedDate && selectedDate === yesterday && frozenDays.has(selectedDate);

  // A single daily row in the day modal — reused across the migrated / not-migrated sections.
  const renderDailyRow = ({ task, state, awarded, late, movedTo, carriedHere }: DayDaily) => {
    const completeKey = `${task.id}:${selectedDate}`;
    const migKey = `mig:${task.id}`;
    const busy = busyKey === completeKey || busyKey === migKey;
    const locked = state === "frozen" || !!movedTo; // excused day or migrated occurrence
    const canCompleteNow = !locked && state === "pending";
    const canRetro = !locked && state === "missed" && retroEnabled && selectedDate !== null && withinLookback(selectedDate);
    // Offer "Migrate to today" on a not-yet-carried daily sitting on a frozen yesterday — but not
    // if the task is already scheduled for today by its own cadence (carrying it would be a no-op).
    const alreadyScheduledToday = !!today && activeOccurrenceStart(task, today) !== null;
    const canMigrate = canMigrateDay && !movedTo && task.deferred_to_date !== today && !alreadyScheduledToday;
    return (
      <div key={task.id} className="flex items-center justify-between gap-2 p-2 rounded border border-gray-700">

        {/* TASK INFO — tapping it opens the shared editor (the only route in on a phone, where a day
            cell is too small to aim at one chip). */}
        <button type="button" onClick={() => openTaskEditor(task.id)} className="min-w-0 text-left cursor-pointer">
          <div className="flex items-center gap-2 truncate">
            <StateDot state={state} />
            {/* Frozen (excused) occurrences are struck through so they don't read as missed. */}
            <span className={`truncate text-sm ${state === "frozen" && !movedTo ? "line-through text-gray-500" : ""}`}>{task.title}</span>
            {/* Carried here from a frozen day — flag with a snowflake, still completable. */}
            {carriedHere && <Snowflake className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
          </div>
          <div className="text-xs text-secondary flex items-center gap-2 mt-0.5 flex-wrap">
            {/* "frozen"/"upcoming"/"migrated" are conveyed by section + dot, not a per-row word. */}
            {state === "frozen" || state === "upcoming" || movedTo ? null : (
              <span className="capitalize">{state}</span>
            )}
            {state === "done" && awarded != null && (
              <span className="flex items-center gap-0.5 text-yellow-500">
                <Coins className="w-3 h-3" />{awarded.toFixed(2)}{late ? " (late)" : ""}
              </span>
            )}
            {/* Streak bonus hint — not on done, locked, or future (upcoming) occurrences. */}
            {task.streak_bonus > 0 && state !== "done" && state !== "upcoming" && !locked && (
              <span className="flex items-center gap-0.5 text-orange-400"><Flame className="w-3 h-3" />+{task.streak_bonus.toFixed(2)}</span>
            )}
          </div>
        </button>

        {/* ACTION */}
        {state === "done" ? (
          <span className="shrink-0 text-green-500"><Check className="w-5 h-5" /></span>
        ) : canMigrate ? (
          <button
            disabled={busy}
            onClick={() => migrateToToday(task)}
            title="Carry this task to today"
            className="shrink-0 px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-xs cursor-pointer"
          >
            {busy ? "…" : "Migrate to today"}
          </button>
        ) : locked ? (
          <span className="shrink-0 text-cyan-400" title={movedTo ? `Migrated to ${shortDate(movedTo)}` : "Frozen day"}>
            {movedTo ? <ArrowRight className="w-4 h-4" /> : <Snowflake className="w-4 h-4" />}
          </span>
        ) : canCompleteNow ? (
          <button
            disabled={busy}
            onClick={() => selectedDate && completeForDay(task, selectedDate)}
            className="shrink-0 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs cursor-pointer"
          >
            {busy ? "…" : "Complete"}
          </button>
        ) : canRetro ? (
          <button
            disabled={busy}
            onClick={() => selectedDate && completeForDay(task, selectedDate)}
            title={`Late completion pays ${multiplierPct}% of normal coins`}
            className="shrink-0 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs cursor-pointer"
          >
            {busy ? "…" : `Complete · ${multiplierPct}%`}
          </button>
        ) : (
          <span className="shrink-0 text-xs text-secondary">{state === "missed" ? "—" : ""}</span>
        )}
      </div>
    );
  };

  // The ⋮ menu's contents — shared with the home page's calendar card.
  const viewOptions = (
    <QuestCalendarMenu
      view={view}
      onViewChange={changeView}
      weekStart={weekStart}
      onWeekStartChange={changeWeekStart}
      hideDailyTasks={hideDailyTasks}
      onHideDailyTasksChange={changeHideDailyTasks}
    />
  );

  return (
    <div className="page">
      <Toaster position="bottom-center" />
      <div className="page-container quest-cal-page">

        {error && (
          <div className="mb-4 mx-3 sm:mx-4 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500">
            {error}
          </div>
        )}

        {/* TOOLBAR (PHONE) — one inline row: back, the month controls, and a ⋮ menu holding the
            view options. The phone has no room for the toggle + filter alongside the date nav. */}
        <div className="lg:hidden mb-3 px-3 shrink-0 flex items-center justify-between gap-2">

          {/* BACK TO QUEST */}
          <BackLink
            fallback="/modules/quest/ui/home"
            title="Back to Quest"
            className="btn btn-pill !px-2.5 !py-1.5 shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </BackLink>

          {/* DATE NAV — the label jumps back to today. */}
          <div className="flex items-center gap-1 min-w-0">
            <button onClick={() => shiftAnchor(-1)} className="p-1.5 text-secondary hover:text-primary cursor-pointer" title="Previous">
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => today && setAnchor(today)}
              title="Jump to today"
              className="text-sm font-semibold min-w-[6.5rem] text-center tabular-nums cursor-pointer hover:text-primary"
            >
              {headingLabel}
            </button>

            <button onClick={() => shiftAnchor(1)} className="p-1.5 text-secondary hover:text-primary cursor-pointer" title="Next">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* VIEW OPTIONS MENU — the app's shared popover (portalled, so no ancestor can clip it) */}
          <button
            ref={viewMenuAnchor}
            onClick={() => setViewMenuOpen((v) => !v)}
            title="View options"
            className={`p-1.5 shrink-0 cursor-pointer ${viewMenuOpen ? "text-primary" : "text-secondary hover:text-primary"}`}
          >
            <EllipsisVertical className="w-5 h-5" />
          </button>
        </div>

        <PopoverMenu open={viewMenuOpen} onClose={() => setViewMenuOpen(false)} anchorRef={viewMenuAnchor} className="popover-menu--wide">
          {viewOptions}
        </PopoverMenu>

        {/* TOOLBAR (DESKTOP) — just the way back. The calendar card's own header carries the range
            stepper and the ⋮ view menu, for both the month and week views. */}
        <div className="hidden lg:flex mb-3 px-4 shrink-0 items-center">
          <BackLink
            fallback="/modules/quest/ui/home"
            title="Back to Quest"
            className="btn btn-pill !px-2.5 !py-1.5 shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </BackLink>
        </div>

        {/* CALENDAR GRID */}
        <section className="card quest-cal-grid-card">

          {/* DESKTOP MONTH — the exact widget the home page renders, so both pages show the same
              calendar. Chips and cells open this page's day detail instead of a task form, and the
              widget's month nav drives our fetch range via onMonthChange. */}
          {/* Both views render the shared widget on desktop — same cells, same chrome. */}
          <div className="quest-cal-desk hidden lg:flex">
              <QuestCalendarWidget
                headerActions={
                  <>
                    {/* VIEW OPTIONS — in the card's header, where the calendar lives, rather than up
                        in the page toolbar. The toolbar keeps its own ⋮ for the week view, which
                        renders the page's grid instead of this widget. */}
                    <button
                      ref={cardMenuAnchor}
                      onClick={() => setCardMenuOpen((v) => !v)}
                      title="View options"
                      className={`p-1.5 cursor-pointer ${cardMenuOpen ? "text-primary" : "text-secondary hover:text-primary"}`}
                    >
                      <EllipsisVertical className="w-5 h-5" />
                    </button>

                    <PopoverMenu
                      open={cardMenuOpen}
                      onClose={() => setCardMenuOpen(false)}
                      anchorRef={cardMenuAnchor}
                      className="popover-menu--wide"
                    >
                      {viewOptions}
                    </PopoverMenu>
                  </>
                }
                tasks={tasks}
                today={today ?? ymd(new Date())}
                hideDailyTasks={hideDailyTasks}
                overlay={{ completions, frozenDays, ready: overlayReady }}
                view={view}
                weekStart={weekStart}
                onSelectDay={(date) => setSelectedDate(date)}
                onSelectTask={(taskId) => openTaskEditor(taskId)}
                onMonthChange={(next) => setAnchor(next)}
              />
          </div>

          {/* PHONE GRID — the page's own layout, for widths below the widget's. */}
          <div ref={chipFit.gridRef} className="flex flex-col flex-1 min-h-0 lg:hidden">

          {/* WEEKDAY HEADER ROW */}
          <div className="grid grid-cols-7 gap-px mb-1 shrink-0">
            {headerLabels.map((w, i) => (
              <div key={`${w}-${i}`} className="text-center text-xs font-semibold text-secondary py-1">{w}</div>
            ))}
          </div>

          {/* MONTH VIEW */}
          {view === "month" && (
            <div className="flex flex-col quest-cal-weeks">
              {monthWeeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7">
                  {week.map((cell) => (
                    <DayCell
                      key={cell.date}
                      date={cell.date}
                      dimmed={!cell.inMonth}
                      isToday={cell.date === today}
                      frozen={frozenDays.has(cell.date)}
                      chips={cellChips(cell.date, week[0].date, week[6].date)}
                      maxChips={chipFit.fit}
                      onClick={() => setSelectedDate(cell.date)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* WEEK VIEW — the same seven columns as a month row, just on its own. */}
          {view === "week" && (
            <div className="grid grid-cols-7 quest-cal-weeks quest-cal-weeks--single">
              {weekDays.map((d) => (
                <DayCell
                  key={d}
                  date={d}
                  dimmed={false}
                  isToday={d === today}
                  frozen={frozenDays.has(d)}
                  chips={cellChips(d, weekDays[0], weekDays[6])}
                  maxChips={chipFit.fit}
                  onClick={() => setSelectedDate(d)}
                />
              ))}
            </div>
          )}



            {/* LEGEND — the same one the widget renders, so both screens read alike. */}
            <div className="calw-legend shrink-0">{QUEST_LEGEND}</div>
          </div>
        </section>

      </div>

      {/* TASK CREATE/EDIT MODAL — the same editor the home page renders. */}
      {taskForm && (
        <QuestTaskModal
          form={taskForm}
          setForm={setTaskForm}
          editingTaskId={editingTaskId}
          advancedOpen={taskAdvancedOpen}
          setAdvancedOpen={setTaskAdvancedOpen}
          submitting={savingTask}
          onClose={() => { setTaskForm(null); setEditingTaskId(null); }}
          onSubmit={saveTaskEdits}
          onDelete={(id) => void deleteTaskFromEditor(id)}
          computedReward={(d) => factors[d] ?? 0}
        />
      )}

      {/* DAY DETAIL MODAL */}
      {selectedDate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
          onClick={() => setSelectedDate(null)}
        >
          <div
            className="card w-full sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >

            {/* MODAL HEADER (stays put; content below scrolls) */}
            <div className="flex items-center justify-between gap-2 shrink-0 pb-3 mb-3 border-b border-gray-700">
              <h2 className="text-card-title flex-wrap">
                <CalendarDays className="w-5 h-5" />
                {formatLongDate(selectedDate)}
                {selectedDate === today && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">Today</span>}
                {frozenDays.has(selectedDate) && <span className="ml-2 text-xs px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 inline-flex items-center gap-1"><Snowflake className="w-3 h-3" />Frozen</span>}
              </h2>
              <button onClick={() => setSelectedDate(null)} className="p-1.5 rounded hover:bg-gray-700 text-secondary hover:text-primary cursor-pointer shrink-0" title="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* SCROLLABLE CONTENT */}
            <div className="overflow-y-auto -mr-1 pr-1" style={{ overscrollBehavior: "contain" }}>

              {/* EMPTY STATE */}
              {selectedDailies.length === 0 && selectedTodos.length === 0 && (
                <div className="text-secondary text-sm py-6 text-center">Nothing scheduled or completed on this day.</div>
              )}

              {/* TODAY uses the home-style task item; other days use the calendar rows (with their
                  retro / frozen / migrate actions). */}
              {selectedDate === today ? (
                <div className="flex flex-col gap-2 mb-3">
                  {selectedDailies.map(({ task, state }) => (
                    <QuestTaskItem
                      key={task.id}
                      title={task.title}
                      kind={task.kind}
                      difficulty={task.difficulty}
                      done={state === "done"}
                      carriedOver={task.deferred_to_date === today}
                      streakCount={task.streak_count}
                      neglectCount={task.neglect_count}
                      rewardValue={task.reward_value}
                      streakBonus={task.streak_bonus}
                      busy={busyKey === `${task.id}:${selectedDate}`}
                      onToggle={() =>
                        state === "done" ? uncompleteToday(task) : completeForDay(task, selectedDate)
                      }
                    />
                  ))}
                </div>
              ) : (
                <>
                  {/* MIGRATED tasks (carried off this frozen day) first, then a subtle divider, then
                      the rest — no labels; the row's right-arrow icon marks the migrated ones. */}
                  {migratedDailies.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {migratedDailies.map(renderDailyRow)}
                    </div>
                  )}

                  {migratedDailies.length > 0 && nonMigratedDailies.length > 0 && (
                    <div className="my-3 border-t border-gray-700/60" />
                  )}

                  {nonMigratedDailies.length > 0 && (
                    <div className="flex flex-col gap-2 mb-3">
                      {nonMigratedDailies.map(renderDailyRow)}
                    </div>
                  )}
                </>
              )}

              {/* TODOS COMPLETED */}
              {selectedTodos.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-semibold text-secondary mb-1">Todos completed</div>
                  <div className="flex flex-col gap-1">
                    {selectedTodos.map((td, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 p-2 rounded border border-gray-700 text-sm">
                        <span className="flex items-center gap-2 truncate"><Check className="w-4 h-4 text-green-500 shrink-0" />{td.title}</span>
                        <span className="flex items-center gap-0.5 text-yellow-500 text-xs shrink-0"><Coins className="w-3 h-3" />{td.awarded.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* RETRO NOTE */}
              {selectedDate < (today ?? "") && !retroEnabled && selectedDailies.some((d) => d.state === "missed") && (
                <div className="mt-3 text-xs text-secondary">Retroactive completion is turned off in settings.</div>
              )}
              {selectedDate < (today ?? "") && retroEnabled && !withinLookback(selectedDate) && selectedDailies.some((d) => d.state === "missed") && (
                <div className="mt-3 text-xs text-secondary">Beyond the {retroLookbackDays}-day retro window.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────────────────────────

function StateDot({ state }: { state: DayState }) {
  const color =
    state === "done" ? "bg-green-500"
      : state === "missed" ? "bg-red-500"
      : state === "pending" ? "bg-blue-500"
      : state === "frozen" ? "bg-cyan-400"
      : "bg-gray-600";
  return <span className={`w-2.5 h-2.5 rounded-full inline-block shrink-0 ${color}`} />;
}

function DayCell({
  date,
  dimmed,
  isToday,
  frozen,
  chips,
  maxChips,
  onClick,
}: {
  date: string;
  dimmed: boolean;
  isToday: boolean;
  frozen: boolean;
  chips: CellChip[];
  maxChips: number;
  onClick: () => void;
}) {
  const dayNum = parseYMD(date).getDate();
  const shown = chips.slice(0, maxChips);
  const overflow = chips.length - shown.length;
  return (
    <button
      onClick={onClick}
      // No cell border: the grid's 1px gaps over a border-coloured backing paint every line once.
      // A bordered cell on top of that gridline is what produced the doubled rules.
      className={`quest-cal-cell flex flex-col items-stretch text-left cursor-pointer transition-colors overflow-hidden ${
        // The state tints are design-system classes, not utilities — see globals.css for why.
        frozen ? "quest-cal-cell--frozen"
          : isToday ? "quest-cal-cell--today"
          : "hover:bg-gray-800"
      } ${dimmed ? "quest-cal-cell--out" : ""}`}
    >
      {/* DATE NUMBER — the overflow count rides up here in the corner rather than sitting under the
          chips, where a tall stack would bury it. */}
      <div className="flex items-center justify-between shrink-0 leading-none gap-1">
        <span className={`text-xs tabular-nums ${isToday ? "text-yellow-400 font-semibold" : "text-gray-400"}`}>{dayNum}</span>

        <span className="flex items-center gap-1 shrink-0">
          {overflow > 0 && (
            <span className="qcal-more-top" title={`${overflow} more`}>+{overflow}</span>
          )}
          {frozen && <Snowflake className="w-3 h-3 text-cyan-400" />}
        </span>
      </div>

      {/* TASK CHIPS — rarest first, coloured by repeat frequency; ❄ = carried in, → = migrated out. */}
      {chips.length > 0 && (
        <div className="qcal-chips mt-0.5">
          {shown.map((c) => {
            const labelled = !c.span || c.span.lead;
            return (
              <span
                key={c.id}
                className={chipClass(c)}
                title={`${c.title} — ${chipStateNote(c)}`}
                // How many of this row's days the bar still covers — the label may run that wide.
                style={c.span?.lead ? ({ "--qcal-span-cols": c.span.cols } as CSSProperties) : undefined}
              >
                {labelled && c.carriedHere && <Snowflake className="w-2.5 h-2.5 shrink-0" />}
                {/* A non-breaking space keeps an unlabelled middle segment the same height. */}
                <span className="qcal-chip-title">{labelled ? c.title : "\u00A0"}</span>
                {/* Migrated off this day → arrow so it reads "moved", not "missed/incomplete". */}
                {c.movedTo && <ArrowRight className="w-2.5 h-2.5 shrink-0" />}

                {/* Runs past this row — cut by the row break, not finished. */}
                {c.span?.lead && c.span.continues && (
                  <ArrowRight className="w-2.5 h-2.5 shrink-0 ml-auto" aria-label="continues" />
                )}
              </span>
            );
          })}
        </div>
      )}


    </button>
  );
}

function formatLongDate(ymdStr: string): string {
  const d = parseYMD(ymdStr);
  return `${WEEKDAY_LABELS[d.getDay()]}, ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
}

function shortDate(ymdStr: string): string {
  const d = parseYMD(ymdStr);
  return `${MONTH_LABELS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}
