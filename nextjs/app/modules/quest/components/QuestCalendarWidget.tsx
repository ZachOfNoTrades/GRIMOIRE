"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Snowflake } from "lucide-react";
import CalendarMonthWidget, { buildWidgetMonth } from "@/components/CalendarMonthWidget";
import {
  ScheduleShape,
  isOccurrenceOn,
  activeOccurrenceStart,
  occurrenceWindowEnd,
  addDays,
  parseYMD,
} from "../lib/scheduleClient";

// Month calendar for the Quest home page. Two densities from one grid:
//   • below lg — the original compact widget (status dot per day, x/y on today), which is what the
//     "calendar" mobile tab shows.
//   • lg and up — the home page gives the calendar a full-width 95vh row of its own, so each day
//     cell becomes an Outlook-style day box listing the actual entries (reminder time + title,
//     ❄ carried in, → migrated out) with a "+N more" overflow.
// Entries are coloured by REPEAT FREQUENCY (see .qcal-chip in globals.css), not by completion —
// done/excused work reads as struck-through instead. The month is navigable in place. Day cells are
// deliberately inert: the entry chips are the only clickable thing, and each opens its task's edit
// modal via onSelectTask.

export interface WidgetTask extends ScheduleShape {
  id: string;
  title: string;
  kind: "daily" | "todo";
  // Doubles as the todo's "done" flag — todos complete once, and a completion outside the fetched
  // month wouldn't show up in the range query.
  last_completed_date: string | null;
  // Optional detail used only by the wide day boxes — the home page passes full Task objects.
  reminders?: { fire_time: string; fire_date: string | null }[];
}

interface Completion {
  task_id: string;
  completed_on: string;
}

type DayStatus = "done" | "missed" | "due" | "frozen" | "none";

// Per-entry state in a wide day box. Superset of DayStatus: a future occurrence reads "upcoming"
// rather than "due" so tomorrow's work doesn't shout at you.
type EntryState = "done" | "missed" | "due" | "upcoming" | "frozen";

// Chips are coloured by cadence, so this — not the state — picks the chip's variant class.
type EntryKind = "daily" | "weekly" | "monthly" | "yearly" | "todo";

interface DayEntry {
  id: string; // unique within the cell (a todo can share a day with its own daily)
  taskId: string; // the task this chip edits
  title: string;
  kind: EntryKind;
  state: EntryState;
  period: number; // approx days between occurrences; drives the rarest-first sort
  time: string | null; // reminder time for this day, pre-formatted ("9a", "2:30p")
  carriedHere: boolean; // deferred onto this day from a frozen one
  movedTo: string | null; // carried OFF this frozen day to another date
}

const MAX_CHIPS = 6; // entries drawn per wide day box before collapsing into "+N more"
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Approximate days between occurrences — bigger = rarer. Mirrors the full calendar page so both
// views agree on which task claims a chip slot.
function periodDays(t: WidgetTask): number {
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



// "HH:MM" (24h, server-local) → a compact chip label ("9a", "2:30p"). Kept short because a day
// column is only ~1/7 of the card.
function formatChipTime(fireTime: string): string {
  const [h, m] = fireTime.split(":").map(Number);
  if (Number.isNaN(h)) return fireTime;
  const suffix = h < 12 ? "a" : "p";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour12}:${String(m).padStart(2, "0")}${suffix}` : `${hour12}${suffix}`;
}

// The earliest reminder that fires on `day`: a dated reminder for exactly that day, or an undated
// one (those fire on every day the task is active, and we only build entries for active days).
function reminderTimeFor(task: WidgetTask, day: string): string | null {
  const times = (task.reminders ?? [])
    .filter((r) => r.fire_date === null || r.fire_date === day)
    .map((r) => r.fire_time)
    .sort();
  return times.length > 0 ? formatChipTime(times[0]) : null;
}

// What the chip's decoration means, spelled out for its tooltip — the strikethrough / dotted
// underline are easy to notice and impossible to guess.
function chipStateNote(entry: DayEntry): string {
  if (entry.movedTo) return "carried to another day";
  if (entry.state === "done") return "done";
  if (entry.state === "frozen") return "excused (frozen day)";
  if (entry.state === "missed") return "missed — its completion window closed";
  if (entry.state === "upcoming") return "upcoming";
  return "due";
}

// Chip classes: the frequency variant carries the colour, the state only mutes/marks it.
function chipClass(entry: DayEntry): string {
  const settled = entry.state === "done" || entry.state === "frozen" || entry.movedTo !== null;
  return [
    "qcal-chip",
    `qcal-chip--${entry.kind}`,
    settled ? "qcal-chip--settled" : "",
    entry.state === "missed" ? "qcal-chip--missed" : "",
  ].filter(Boolean).join(" ");
}

// The chip variant for a task: its repeat frequency, or "todo" for a one-off.
function entryKind(t: WidgetTask): EntryKind {
  return t.kind === "todo" ? "todo" : t.frequency;
}

export default function QuestCalendarWidget({
  tasks,
  today,
  hideDailyTasks = false,
  onSelectTask,
  onCreateTask,
}: {
  tasks: WidgetTask[];
  today: string;
  // Drop every-day tasks from the day detail (they land in every cell and bury the rarer ones).
  // Affects the named entries only — the compact status dot and today's x/y still count everything.
  hideDailyTasks?: boolean;
  // Clicking a named entry hands its task id back so the page can open its edit modal. Omitted =
  // chips are inert.
  onSelectTask?: (taskId: string) => void;
  // Double-clicking empty space in a day cell asks the page to open a blank task form scheduled on
  // that day.
  onCreateTask?: (date: string) => void;
}) {
  // DATA
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [frozenDays, setFrozenDays] = useState<Set<string>>(new Set());

  // INPUT
  const [anchor, setAnchor] = useState<string>(today); // first-of-visible-month (widget-owned nav)

  // The shared grid for the visible month (also drives the completions fetch range).
  const weeks = useMemo(() => buildWidgetMonth(anchor, today), [anchor, today]);
  const range = useMemo(() => ({ from: weeks[0][0].date, to: weeks[weeks.length - 1][6].date }), [weeks]);

  // Stable so the widget's month nav doesn't loop through the effect that reports it.
  const handleMonthChange = useCallback((next: string) => setAnchor(next), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/modules/quest/api/tasks/completions?from=${range.from}&to=${range.to}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setCompletions(Array.isArray(data?.completions) ? data.completions : []);
        setFrozenDays(new Set(Array.isArray(data?.frozenDays) ? data.frozenDays : []));
      } catch {
        // best-effort — grid still renders the schedule without the overlay
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const completionsByTask = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of completions) {
      const list = m.get(c.task_id) ?? [];
      list.push(c.completed_on);
      m.set(c.task_id, list);
    }
    return m;
  }, [completions]);

  // Todos per day. A todo has no cadence, so it reaches a cell one of two ways: a scheduled one
  // (start_date set — what the calendar's own "add" flow creates) sits on its scheduled day, still
  // open until it's done; an unscheduled one only appears as history on the day it was credited.
  // Built once per fetch rather than per cell (a month grid calls the day builder 42 times).
  const todosByDay = useMemo(() => {
    const m = new Map<string, { id: string; taskId: string; title: string; state: EntryState }[]>();
    const push = (day: string, entry: { id: string; taskId: string; title: string; state: EntryState }) => {
      const list = m.get(day) ?? [];
      list.push(entry);
      m.set(day, list);
    };
    const scheduled = new Set<string>();
    for (const t of tasks) {
      if (t.kind !== "todo" || !t.start_date) continue;
      scheduled.add(t.id);
      const done = t.last_completed_date !== null;
      const state: EntryState = done
        ? "done"
        : t.start_date < today
          ? "missed"
          : t.start_date > today
            ? "upcoming"
            : "due";
      push(t.start_date, { id: `todo:${t.id}`, taskId: t.id, title: t.title, state });
    }
    const byId = new Map(tasks.map((t) => [t.id, t]));
    for (const c of completions) {
      const t = byId.get(c.task_id);
      if (!t || t.kind !== "todo" || scheduled.has(t.id)) continue;
      push(c.completed_on, { id: `todo:${c.task_id}`, taskId: c.task_id, title: t.title, state: "done" });
    }
    return m;
  }, [tasks, completions, today]);

  // Single status dot per day: frozen (excused) wins, else worst-of (missed > due > done). Green
  // "done" only when every scheduled occurrence that day is complete.
  const dayStatus = useCallback(
    (day: string): DayStatus => {
      if (frozenDays.has(day)) return "frozen";
      let anyMissed = false;
      let anyDue = false;
      let anyDone = false;
      for (const t of tasks) {
        if (t.kind !== "daily" || !isOccurrenceOn(t, day)) continue;
        if (activeOccurrenceStart(t, day) !== day && t.deferred_to_date !== day) continue;
        const occStart = activeOccurrenceStart(t, day) ?? day;
        const windowEnd = occurrenceWindowEnd(t, day) ?? day;
        const done = (completionsByTask.get(t.id) ?? []).some((d) => d >= occStart && d <= windowEnd);
        if (done) anyDone = true;
        else if (windowEnd < today) anyMissed = true;
        else if (day <= today) anyDue = true;
      }
      if (anyMissed) return "missed";
      if (anyDue) return "due";
      if (anyDone) return "done";
      return "none";
    },
    [tasks, today, completionsByTask, frozenDays],
  );

  // Completed / total scheduled dailies for a day (shown as "x/y" on today).
  const dayCounts = useCallback(
    (day: string): { done: number; total: number } => {
      let done = 0;
      let total = 0;
      for (const t of tasks) {
        if (t.kind !== "daily" || !isOccurrenceOn(t, day)) continue;
        if (activeOccurrenceStart(t, day) !== day && t.deferred_to_date !== day) continue;
        const occStart = activeOccurrenceStart(t, day) ?? day;
        const windowEnd = occurrenceWindowEnd(t, day) ?? day;
        total += 1;
        if ((completionsByTask.get(t.id) ?? []).some((d) => d >= occStart && d <= windowEnd)) done += 1;
      }
      return { done, total };
    },
    [tasks, completionsByTask],
  );

  // The named entries on a day, rarest-first: the dailies whose occurrence starts (or was deferred
  // onto) that day, plus any todo credited that day. Wide layout only.
  const dayEntries = useCallback(
    (day: string): DayEntry[] => {
      const frozen = frozenDays.has(day);
      const out: DayEntry[] = [];
      for (const t of tasks) {
        if (t.kind !== "daily" || !isOccurrenceOn(t, day)) continue;
        if (activeOccurrenceStart(t, day) !== day && t.deferred_to_date !== day) continue;
        // "Daily" = the task's Repeats setting, matching the wording in the task modal, so the
        // weekly / monthly / yearly ones are exactly what's left behind.
        if (hideDailyTasks && t.frequency === "daily") continue;
        const occStart = activeOccurrenceStart(t, day) ?? day;
        const windowEnd = occurrenceWindowEnd(t, day) ?? day;
        const done = (completionsByTask.get(t.id) ?? []).some((d) => d >= occStart && d <= windowEnd);
        // Migrated away: only on the frozen day this occurrence was carried OFF of. A freeze carry
        // always defers to (frozen day + 1), so that day is exactly deferred_to_date - 1.
        const movedTo =
          frozen && t.deferred_to_date && addDays(day, 1) === t.deferred_to_date ? t.deferred_to_date : null;
        let state: EntryState;
        if (done) state = "done";
        else if (frozen) state = "frozen";
        else if (windowEnd < today) state = "missed";
        else if (day > today) state = "upcoming";
        else state = "due";
        out.push({
          id: t.id,
          taskId: t.id,
          title: t.title,
          kind: entryKind(t),
          state,
          period: periodDays(t),
          time: reminderTimeFor(t, day),
          carriedHere: t.deferred_to_date === day,
          movedTo,
        });
      }

      // TODOS — no schedule of their own, so they appear on the day they were credited.
      for (const td of todosByDay.get(day) ?? []) {
        out.push({
          id: td.id,
          taskId: td.taskId,
          title: td.title,
          kind: "todo",
          state: td.state,
          period: 0,
          time: null,
          carriedHere: false,
          movedTo: null,
        });
      }

      return out.sort((a, b) => b.period - a.period || a.title.localeCompare(b.title));
    },
    [tasks, today, todosByDay, completionsByTask, frozenDays, hideDailyTasks],
  );

  function dotClass(status: DayStatus): string {
    if (status === "done") return "bg-green-500";
    if (status === "missed") return "bg-red-500";
    if (status === "due") return "bg-blue-500";
    if (status === "frozen") return "bg-cyan-400";
    return "";
  }

  return (
    <CalendarMonthWidget
      today={today}
      navigable
      navMonthLabel
      monthAnchor={anchor}
      onMonthChange={handleMonthChange}
      weekdayLabels={WEEKDAY_LABELS}
      renderDay={(day) => {
        const status = dayStatus(day.date);
        const counts = day.isToday ? dayCounts(day.date) : null;
        const frozen = frozenDays.has(day.date);
        const entries = dayEntries(day.date);
        const shown = entries.slice(0, MAX_CHIPS);
        const overflow = entries.length - shown.length;

        return (

          /* DAY CELL — compact square below lg, Outlook-style day box at lg and up. Single clicks do
             nothing; the cell's only action is double-click-to-add, so it advertises that with a
             hover tint and a pointer cursor (both desktop-only). */
          <div
            key={day.date}
            onDoubleClick={() => onCreateTask?.(day.date)}
            title={onCreateTask ? "Double-click to add a task on this day" : undefined}
            // select-none: a double-click on a cell is the "add here" gesture, not a text selection —
            // without it the second click highlights whatever chip text sits under the cursor.
            className={`group select-none overflow-hidden aspect-square rounded flex flex-col items-center justify-center gap-0.5 lg:aspect-auto lg:min-h-[7rem] lg:items-stretch lg:justify-start lg:gap-0 lg:p-1 lg:border lg:text-left lg:transition-colors ${
              onCreateTask ? "lg:cursor-pointer" : ""
            } ${
              day.isToday
                ? "bg-yellow-400/15 ring-1 ring-yellow-400 lg:ring-0 lg:border-yellow-400 lg:hover:bg-yellow-400/25"
                : frozen
                  ? "lg:border-cyan-500/50 lg:bg-cyan-500/10 lg:hover:bg-cyan-500/20"
                  : "lg:border-gray-700 lg:hover:bg-gray-500/15"
            } ${day.inMonth ? "" : "opacity-30 lg:opacity-50"}`}
          >

            {/* DAY NUMBER ROW — centered when compact, day number + markers when wide */}
            <div className="flex items-center justify-center lg:justify-between gap-1 w-full shrink-0">
              <span className={`text-[11px] lg:text-[13px] tabular-nums leading-none ${day.isToday ? "text-yellow-400 font-semibold" : "text-gray-300"}`}>
                {parseYMD(day.date).getDate()}
              </span>

              {/* WIDE-ONLY MARKER — a snowflake on frozen days */}
              {frozen && <Snowflake className="hidden lg:block w-3.5 h-3.5 text-cyan-400 shrink-0" />}
            </div>

            {/* COMPACT MARKER — today shows completed/total, other days a status dot */}
            {day.isToday && counts ? (
              <span className="lg:hidden text-[9px] tabular-nums leading-none text-yellow-400">{counts.done}/{counts.total}</span>
            ) : (
              <span className={`lg:hidden w-1.5 h-1.5 rounded-full ${dotClass(status)}`} />
            )}

            {/* ENTRY CHIPS (wide) — rarest first, coloured by repeat frequency; ❄ = carried in,
                → = migrated out. Clicking one opens that task's edit modal. */}
            {shown.length > 0 && (
              <div className="qcal-chips hidden lg:flex mt-0.5">
                {shown.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onSelectTask?.(e.taskId)}
                    // A chip is a target of its own: don't let a fast double-click on it also fire
                    // the cell's "add a task on this day".
                    onDoubleClick={(ev) => ev.stopPropagation()}
                    title={`${e.time ? `${e.time} · ` : ""}${e.title} — ${chipStateNote(e)}${onSelectTask ? " · click to edit" : ""}`}
                    className={chipClass(e)}
                  >
                    {e.carriedHere && <Snowflake className="w-2.5 h-2.5 shrink-0" />}
                    {e.time && <span className="qcal-chip-time">{e.time}</span>}
                    <span className="qcal-chip-title">{e.title}</span>
                    {e.movedTo && <ArrowRight className="w-2.5 h-2.5 shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {/* OVERFLOW — outside the clipped list so it always stays visible in the cell */}
            {overflow > 0 && (
              <span className="qcal-more hidden lg:block" title={`${overflow} more`}>+{overflow} more</span>
            )}
          </div>
        );
      }}
      legend={
        <>
          {/* COMPACT LEGEND — the mobile widget still shows one status dot per day */}
          <span className="lg:hidden flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Done</span>
          <span className="lg:hidden flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />Missed</span>
          <span className="lg:hidden flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />Due</span>
          <span className="lg:hidden flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />Frozen</span>

          {/* WIDE LEGEND — the day boxes colour entries by repeat frequency */}
          <span className="hidden lg:flex items-center gap-1"><span className="qcal-swatch qcal-swatch--daily" />Daily</span>
          <span className="hidden lg:flex items-center gap-1"><span className="qcal-swatch qcal-swatch--weekly" />Weekly</span>
          <span className="hidden lg:flex items-center gap-1"><span className="qcal-swatch qcal-swatch--monthly" />Monthly</span>
          <span className="hidden lg:flex items-center gap-1"><span className="qcal-swatch qcal-swatch--yearly" />Yearly</span>
          <span className="hidden lg:flex items-center gap-1"><span className="qcal-swatch qcal-swatch--todo" />Todo</span>
          <span className="hidden lg:flex items-center gap-1"><span className="line-through opacity-60">Struck</span>= done or excused</span>
        </>
      }
    />
  );
}
