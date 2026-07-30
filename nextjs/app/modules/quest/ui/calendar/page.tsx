"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useGoBack } from "@/lib/useGoBack";
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
  Star,
} from "lucide-react";
import { Difficulty, TaskKind, Frequency } from "../../types/task";
import QuestTaskItem from "../../components/QuestTaskItem";
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

type CalendarView = "week" | "month";
type DayState = "done" | "missed" | "pending" | "upcoming" | "frozen";

interface DayDaily {
  task: Task;
  state: DayState;
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
  rare: boolean;
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
function buildMonthMatrix(anchorYMD: string): { date: string; inMonth: boolean }[][] {
  const a = parseYMD(anchorYMD);
  const year = a.getFullYear();
  const month = a.getMonth();
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const cur = new Date(first);
  cur.setDate(1 - first.getDay()); // back up to the Sunday on/before the 1st
  const weeks: { date: string; inMonth: boolean }[][] = [];
  while (true) {
    const week: { date: string; inMonth: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      week.push({ date: ymd(cur), inMonth: cur.getMonth() === month });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
    if (cur > lastDay) break;
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

const WEEK_START_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 0, label: "Sunday" },
  { value: 6, label: "Saturday" },
];

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

// "Rare" = monthly-or-rarer cadence (≈ 4 weeks between occurrences) — gets the ★ marker.
function isRareTask(t: Task): boolean {
  return periodDays(t) >= 28;
}

// A "non-daily" recurring task in the user's sense: a daily-type task whose FREQUENCY isn't daily
// (weekly / monthly / yearly). These are the agenda candidates.
function isNonDailyRecurring(t: Task): boolean {
  return t.kind === "daily" && t.frequency !== "daily";
}

function freqLabel(t: Task): string {
  const n = Math.max(1, t.every_n || 1);
  if (t.frequency === "weekly") return n > 1 ? `Every ${n} weeks` : "Weekly";
  if (t.frequency === "monthly") return n > 1 ? `Every ${n} months` : "Monthly";
  if (t.frequency === "yearly") return n > 1 ? `Every ${n} years` : "Yearly";
  if (t.days_of_week) return "Weekly days";
  return n > 1 ? `Every ${n} days` : "Daily";
}

// The earliest occurrence start whose grace window still covers `today` or lies ahead, within
// [today-back, today+fwd]. Captures a currently-due (possibly in-grace) occurrence as well as the
// next upcoming one. Null if none in range.
function nextRelevantOccurrence(t: Task, today: string, back = 31, fwd = 60): string | null {
  for (let i = -back; i <= fwd; i++) {
    const d = addDays(today, i);
    if (activeOccurrenceStart(t, d) !== d) continue; // only the occurrence's start day
    const we = occurrenceWindowEnd(t, d) ?? d;
    if (we < today) continue; // window already fully past
    return d;
  }
  return null;
}

function dayDelta(fromYMD: string, toYMD: string): number {
  return Math.round((parseYMD(toYMD).getTime() - parseYMD(fromYMD).getTime()) / 86400000);
}

function relativeLabel(today: string, date: string): string {
  const d = dayDelta(today, date);
  if (d < 0) return "due now";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  return `in ${d}d`;
}

export default function QuestCalendarPage() {
  const router = useRouter();
  const goBack = useGoBack();

  // DATA
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [frozenDays, setFrozenDays] = useState<Set<string>>(new Set());
  const [balance, setBalance] = useState<number>(0);
  const [today, setToday] = useState<string | null>(null);
  const [retroEnabled, setRetroEnabled] = useState<boolean>(true);
  const [retroMultiplier, setRetroMultiplier] = useState<number>(0.5);
  const [retroLookbackDays, setRetroLookbackDays] = useState<number>(14);

  // INPUT
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // First day of week for WEEK view only (month view stays Sunday-first). Default Monday;
  // persisted locally since it's a display-only preference.
  const [weekStart, setWeekStart] = useState<number>(1);

  // STATE
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null); // `${taskId}:${date}` being submitted

  // The visible date range [from, to] for the current view+anchor — drives the completions fetch.
  const range = useMemo(() => {
    if (!anchor) return null;
    if (view === "month") {
      const weeks = buildMonthMatrix(anchor);
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

  // Restore the saved week-start preference (default Monday) on mount.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("quest.calendar.weekStart");
      if (v !== null && !Number.isNaN(Number(v))) setWeekStart(Number(v));
    } catch {
      // localStorage unavailable — keep the Monday default
    }
  }, []);

  function changeWeekStart(n: number) {
    setWeekStart(n);
    try {
      window.localStorage.setItem("quest.calendar.weekStart", String(n));
    } catch {
      // ignore persistence failure
    }
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
  const loadCompletions = useCallback(async () => {
    if (!range) return;
    try {
      const res = await fetch(`/modules/quest/api/tasks/completions?from=${range.from}&to=${range.to}`);
      if (!res.ok) return;
      const data = await res.json();
      setCompletions(Array.isArray(data?.completions) ? data.completions : []);
      setFrozenDays(new Set(Array.isArray(data?.frozenDays) ? data.frozenDays : []));
    } catch {
      // best-effort — grid still renders schedule without completion overlay
    }
  }, [range]);

  useEffect(() => {
    loadCompletions();
  }, [loadCompletions]);

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
      if (!today) return [];
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
          windowEnd,
          awarded: doneRec ? doneRec.awarded : null,
          late: doneRec ? doneRec.late : false,
          movedTo,
          carriedHere: t.deferred_to_date === day,
        });
      }
      return out;
    },
    [tasks, today, completionsByTask, frozenDays],
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
  const cellChips = useCallback(
    (day: string): CellChip[] => {
      return dailiesForDay(day)
        .map((i) => ({
          id: i.task.id,
          title: i.task.title,
          state: i.state,
          rare: isRareTask(i.task),
          period: periodDays(i.task),
          movedTo: i.movedTo,
          carriedHere: i.carriedHere,
        }))
        .sort((a, b) => b.period - a.period || a.title.localeCompare(b.title));
    },
    [dailiesForDay],
  );

  // Agenda — the next occurrence of every NON-daily-frequency recurring task (weekly/monthly/yearly),
  // sorted soonest-first (rarer breaks ties). This is the "don't let me miss the monthly one" list.
  const agenda = useMemo(() => {
    if (!today) return [] as { task: Task; date: string; rare: boolean; done: boolean }[];
    const out: { task: Task; date: string; rare: boolean; period: number; done: boolean }[] = [];
    for (const t of tasks) {
      if (!isNonDailyRecurring(t)) continue;
      const date = nextRelevantOccurrence(t, today);
      if (!date) continue;
      const windowEnd = occurrenceWindowEnd(t, date) ?? date;
      const recs = completionsByTask.get(t.id) ?? [];
      const done = recs.some((c) => c.completed_on >= date && c.completed_on <= windowEnd);
      out.push({ task: t, date, rare: isRareTask(t), period: periodDays(t), done });
    }
    out.sort((a, b) => a.date.localeCompare(b.date) || b.period - a.period);
    return out;
  }, [tasks, today, completionsByTask]);

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

  const monthWeeks = view === "month" && anchor ? buildMonthMatrix(anchor) : [];
  const weekDays = view === "week" && anchor ? buildWeek(anchor, weekStart) : [];
  // Weekday header: month view is always Sunday-first; week view follows the chosen first day.
  const headerLabels = view === "month"
    ? WEEKDAY_LABELS
    : Array.from({ length: 7 }, (_, i) => WEEKDAY_LABELS[(weekStart + i) % 7]);
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

        {/* TASK INFO */}
        <div className="min-w-0">
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
        </div>

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

  return (
    <div className="page">
      <Toaster position="bottom-center" />
      <div className="page-container">

        {/* HEADER */}
        <div className="mb-6 flex items-center justify-between gap-2">
          <h1 className="text-page-title flex items-center gap-2 truncate">
            <CalendarDays className="w-6 h-6 sm:w-8 sm:h-8 shrink-0" />
            <span>Calendar</span>
          </h1>
          <div className="flex items-stretch gap-2 sm:gap-3">

            {/* COIN BALANCE */}
            <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 p-1.5 sm:p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <Coins className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500 shrink-0" />
              <span className="text-xs sm:text-sm font-semibold text-yellow-500 tabular-nums">{Number(balance).toFixed(2)}</span>
            </div>

            {/* BACK TO QUEST */}
            <button
              onClick={() => goBack("/modules/quest/ui/home")}
              title="Back to Quest"
              className="p-1.5 sm:p-2 rounded border border-gray-600 hover:bg-gray-700 text-secondary hover:text-primary cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500">
            {error}
          </div>
        )}

        {/* TOOLBAR — view toggle + date navigation */}
        <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">

          <div className="flex items-center gap-2">

            {/* VIEW TOGGLE */}
            <div className="flex rounded border border-gray-700 overflow-hidden">
              {(["week", "month"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-sm capitalize cursor-pointer ${
                    view === v ? "bg-blue-600 text-white" : "text-secondary hover:bg-gray-700"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* WEEK-START SELECTOR (week view only) */}
            {view === "week" && (
              <select
                value={weekStart}
                onChange={(e) => changeWeekStart(Number(e.target.value))}
                title="First day of week"
                className="h-9 px-2 rounded border border-gray-600 bg-transparent text-sm text-secondary cursor-pointer"
              >
                {WEEK_START_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>Starts {o.label}</option>
                ))}
              </select>
            )}
          </div>

          {/* DATE NAV */}
          <div className="flex items-center gap-2">
            <button onClick={() => shiftAnchor(-1)} className="p-1.5 rounded border border-gray-600 hover:bg-gray-700 text-secondary hover:text-primary cursor-pointer" title="Previous">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold min-w-[10rem] text-center tabular-nums">{headingLabel}</span>
            <button onClick={() => shiftAnchor(1)} className="p-1.5 rounded border border-gray-600 hover:bg-gray-700 text-secondary hover:text-primary cursor-pointer" title="Next">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => today && setAnchor(today)}
              className="px-3 py-1.5 rounded border border-gray-600 hover:bg-gray-700 text-secondary hover:text-primary text-sm cursor-pointer"
            >
              Today
            </button>
          </div>
        </div>

        {/* UPCOMING AGENDA — next occurrence of every non-daily-frequency recurring task, soonest
            first. Surfaces the easy-to-miss weekly/monthly/yearly tasks. */}
        {agenda.length > 0 && (
          <section className="card mb-4">
            <h2 className="text-card-title mb-2">
              <CalendarDays className="w-5 h-5" />
              Upcoming
            </h2>
            <div className="flex flex-col divide-y divide-gray-800 max-h-56 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
              {agenda.map(({ task, date, rare, done }) => {
                const delta = today ? dayDelta(today, date) : 99;
                const relClass = done ? "text-green-500" : delta <= 0 ? "text-amber-400" : delta === 1 ? "text-primary" : "text-secondary";
                return (
                  <button
                    key={task.id}
                    onClick={() => setSelectedDate(date)}
                    className="flex items-center justify-between gap-2 py-2 text-left hover:bg-gray-800/40 cursor-pointer"
                  >
                    {/* TASK + CADENCE */}
                    <span className="flex items-center gap-1.5 min-w-0">
                      {rare && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />}
                      <span className={`truncate text-sm ${done ? "text-secondary line-through" : ""}`}>{task.title}</span>
                      <span className="text-xs text-secondary shrink-0">· {freqLabel(task)}</span>
                    </span>

                    {/* DATE + RELATIVE */}
                    <span className="flex items-center gap-2 shrink-0 text-xs tabular-nums">
                      <span className="text-secondary">{shortDate(date)}</span>
                      {done ? <Check className="w-4 h-4 text-green-500" /> : <span className={`${relClass} w-14 text-right`}>{relativeLabel(today!, date)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* CALENDAR GRID */}
        <section className="card">

          {/* WEEKDAY HEADER ROW */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {headerLabels.map((w, i) => (
              <div key={`${w}-${i}`} className="text-center text-xs font-semibold text-secondary py-1">{w}</div>
            ))}
          </div>

          {/* MONTH VIEW */}
          {view === "month" && (
            <div className="flex flex-col gap-1">
              {monthWeeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 gap-1">
                  {week.map((cell) => (
                    <DayCell
                      key={cell.date}
                      date={cell.date}
                      dimmed={!cell.inMonth}
                      isToday={cell.date === today}
                      frozen={frozenDays.has(cell.date)}
                      chips={cellChips(cell.date)}
                      maxChips={3}
                      onClick={() => setSelectedDate(cell.date)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* WEEK VIEW */}
          {view === "week" && (
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((d) => (
                <DayCell
                  key={d}
                  date={d}
                  dimmed={false}
                  isToday={d === today}
                  frozen={frozenDays.has(d)}
                  chips={cellChips(d)}
                  maxChips={5}
                  onClick={() => setSelectedDate(d)}
                />
              ))}
            </div>
          )}

          {/* LEGEND */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Done</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Missed</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Due</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-600 inline-block" /> Upcoming</span>
            <span className="flex items-center gap-1"><Snowflake className="w-3 h-3 text-cyan-400" /> Frozen</span>
          </div>
        </section>

      </div>

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

// Per-chip text color by occurrence state. NOTE: color-only utilities (no design-system
// .text-primary/.text-secondary, which also set font-size and would override the chip's text-[10px]).
function chipStateClass(state: DayState): string {
  if (state === "done") return "text-gray-500 line-through";
  if (state === "missed") return "text-red-400";
  // Frozen = the day is excused → strike it through so it never reads as an open/missed task.
  if (state === "frozen") return "text-cyan-400 line-through";
  if (state === "upcoming") return "text-gray-500";
  return "text-gray-100"; // pending / due
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
      className={`flex flex-col items-stretch text-left rounded border p-1 cursor-pointer transition-colors min-h-[5rem] sm:min-h-[6.5rem] overflow-hidden ${
        frozen ? "border-cyan-500/50 bg-cyan-500/10"
          : isToday ? "border-blue-500 bg-blue-500/5"
          : "border-gray-700 hover:bg-gray-800"
      } ${dimmed ? "opacity-40" : ""}`}
    >
      {/* DATE NUMBER */}
      <div className="flex items-center justify-between shrink-0">
        <span className={`text-xs tabular-nums ${isToday ? "text-blue-400 font-semibold" : "text-gray-400"}`}>{dayNum}</span>
        {frozen && <Snowflake className="w-3 h-3 text-cyan-400 shrink-0" />}
      </div>

      {/* TASK CHIPS — rarest first; ★ = infrequent (monthly+); ❄ = carried in; → = migrated out. */}
      {chips.length > 0 && (
        <div className="mt-0.5 flex flex-col gap-px min-w-0">
          {shown.map((c) => (
            <span
              key={c.id}
              className={`flex items-center gap-0.5 text-[10px] leading-tight min-w-0 ${
                c.movedTo ? "text-gray-500" : chipStateClass(c.state)
              }`}
            >
              {c.rare && <Star className="w-2.5 h-2.5 text-amber-400 shrink-0 fill-amber-400" />}
              {c.carriedHere && <Snowflake className="w-2.5 h-2.5 text-cyan-400 shrink-0" />}
              <span className="truncate">{c.title}</span>
              {/* Migrated off this day → arrow so it reads "moved", not "missed/incomplete". */}
              {c.movedTo && <ArrowRight className="w-2.5 h-2.5 text-cyan-400 shrink-0" />}
            </span>
          ))}
          {overflow > 0 && <span className="text-[10px] leading-tight text-gray-500">+{overflow} more</span>}
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
