"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, Plus, Snowflake } from "lucide-react";
import CalendarMonthWidget, { buildWidgetMonth, buildWidgetWeek } from "@/components/CalendarMonthWidget";
import { useChipFit } from "../lib/useChipFit";
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
  // A completion grace window (window_days > 1) makes one occurrence cover several days; it's drawn
  // as one bar the way a calendar draws a multi-day event. `lead` marks the segment carrying the
  // label (the first day, or the first day of a week row it continues into) and `cols` is how many
  // of that row's days it still covers, so the bar can run the width of the span.
  // `continues` = the occurrence runs past the end of the VISIBLE GRID, so its end isn't on screen
  // — that's what earns a trailing arrow. A span that merely wraps to the next row needs none: you
  // can see where it finishes.
  span: { isStart: boolean; isEnd: boolean; lead: boolean; cols: number; continues: boolean } | null;
}

// Whole days between two YMD dates (negative if `to` is earlier).
function dayDiff(fromYMD: string, toYMD: string): number {
  return Math.round((parseYMD(toYMD).getTime() - parseYMD(fromYMD).getTime()) / 86400000);
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The calendar legend — exported so the phone-sized calendar page renders exactly the same one.
export const QUEST_LEGEND = (
  <>
    <span className="qcal-legend-item"><span className="qcal-swatch qcal-swatch--daily" />Daily</span>
    <span className="qcal-legend-item"><span className="qcal-swatch qcal-swatch--weekly" />Weekly</span>
    <span className="qcal-legend-item"><span className="qcal-swatch qcal-swatch--monthly" />Monthly</span>
    <span className="qcal-legend-item"><span className="qcal-swatch qcal-swatch--yearly" />Yearly</span>
    <span className="qcal-legend-item"><span className="qcal-swatch qcal-swatch--todo" />Todo</span>
  </>
);

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
    // A spanning occurrence: the lead segment is widened to cover the days it spans, so the whole
    // thing reads as one bar rather than a row of separate chips.
    entry.span ? "qcal-chip--span" : "",
    entry.span?.lead ? "qcal-chip--span-lead" : "",
    entry.span && !entry.span.lead ? "qcal-chip--span-spacer" : "",
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
  onSelectDay,
  onMonthChange,
  overlay,
  headerActions,
  view = "month",
  weekStart = 0,
}: {
  tasks: WidgetTask[];
  today: string;
  // Drop every-day tasks from the day detail (they land in every cell and bury the rarer ones).
  // Affects the named entries only — the compact status dot and today's x/y still count everything.
  hideDailyTasks?: boolean;
  // Clicking a named entry hands back its task id AND the day it was clicked on, so a consumer can
  // open either the task (home) or that day (the calendar page). Omitted = chips are inert.
  onSelectTask?: (taskId: string, date: string) => void;
  // Double-clicking empty space in a day cell asks the page to open a blank task form scheduled on
  // that day.
  onCreateTask?: (date: string) => void;
  // When given, the day cell itself is clickable (the calendar page opens its day detail). The home
  // page omits it on purpose — there, only the chips are targets.
  onSelectDay?: (date: string) => void;
  // A host that already fetches the completion overlay (the calendar page does) hands it in, so the
  // widget doesn't issue a second identical request for the same month.
  overlay?: { completions: Completion[]; frozenDays: Set<string>; ready: boolean };
  // Trailing content for the calendar's header — the home page puts its ⋮ view menu here.
  headerActions?: ReactNode;
  // "week" renders a single 7-day row; everything else (cells, chrome, chips) is identical.
  view?: "month" | "week";
  // Which weekday a row starts on (0=Sun … 6=Sat) — applies to the month grid as well as the week.
  weekStart?: number;
  // Fires with the first-of-visible-month whenever the widget's own month nav moves, so a consumer
  // that also fetches by month can follow along.
  onMonthChange?: (anchorYMD: string) => void;
}) {
  // DATA — own fetch, unless the host supplied the overlay (see the `overlay` prop).
  const [ownCompletions, setOwnCompletions] = useState<Completion[]>([]);
  const [ownFrozenDays, setOwnFrozenDays] = useState<Set<string>>(new Set());
  const completions = overlay ? overlay.completions : ownCompletions;
  const frozenDays = overlay ? overlay.frozenDays : ownFrozenDays;
  // The date range the loaded completions actually cover. Until it covers the visible month, the
  // grid has the schedule but not the "was it done" overlay, and drawing it then would paint every
  // completed occurrence as due/missed for a frame before the fetch lands — a flash of wrong state
  // on first paint and again on every month change.
  const [loaded, setLoaded] = useState<{ from: string; to: string } | null>(null);

  // INPUT
  const [anchor, setAnchor] = useState<string>(today);

  // The shared grid for the visible month (also drives the completions fetch range).
  const weeks = useMemo(
    () => (view === "week"
      ? buildWidgetWeek(anchor, today, weekStart)
      : buildWidgetMonth(anchor, today, 6, weekStart)),
    [anchor, today, view, weekStart],
  );
  const range = useMemo(() => ({ from: weeks[0][0].date, to: weeks[weeks.length - 1][6].date }), [weeks]);

  // Stable so the widget's month nav doesn't loop through the effect that reports it.
  const handleMonthChange = useCallback(
    (next: string) => {
      setAnchor(next);
      onMonthChange?.(next);
    },
    [onMonthChange],
  );

  // Covered = what we hold describes the visible month, so it renders with no fetch at all.
  const covered = !!loaded && loaded.from <= range.from && loaded.to >= range.to;
  // Within a month of the window's edge: still covered, but the NEXT step might not be, so widen
  // now, in the background. That's what makes stepping instant rather than merely fast — the fetch
  // happens while you're looking at a month that's already drawn.
  const nearEdge = !!loaded && covered
    && (range.from < addDays(loaded.from, 40) || range.to > addDays(loaded.to, -40));
  const overlayReady = overlay ? overlay.ready : covered;

  useEffect(() => {
    if (overlay) return; // the host owns the overlay
    if (covered && !nearEdge) return; // nothing to do — and nothing to blank
    let cancelled = false;
    // A wide window (about three months either side). The endpoint costs the same whatever the
    // range, so paying once beats paying per step. Note we do NOT clear `loaded` first: while this
    // is in flight the grid keeps rendering the months we already have.
    const from = addDays(range.from, -100);
    const to = addDays(range.to, 100);
    (async () => {
      try {
        const res = await fetch(`/modules/quest/api/tasks/completions?from=${from}&to=${to}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setOwnCompletions(Array.isArray(data?.completions) ? data.completions : []);
        setOwnFrozenDays(new Set(Array.isArray(data?.frozenDays) ? data.frozenDays : []));
        setLoaded({ from, to });
      } catch {
        // best-effort — the grid stays blank rather than showing an unverified overlay
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, covered, nearEdge, overlay]);

  // How many entries fit a day cell at this size — measured, so the last one is never sliced or
  // pushed past the cell's bottom rule.
  const chipFit = useChipFit([anchor, today, hideDailyTasks, tasks.length, overlayReady]);

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
    (day: string, rowStart: string, rowEnd: string, gridEnd: string): DayEntry[] => {
      const frozen = frozenDays.has(day);
      const out: DayEntry[] = [];
      for (const t of tasks) {
        if (t.kind !== "daily" || !isOccurrenceOn(t, day)) continue;
        // A task with a grace window appears on EVERY day of that window (one spanning bar); a
        // single-day one only on its occurrence date, plus any day it was deferred onto.
        const activeStart = activeOccurrenceStart(t, day);
        if (activeStart === null && t.deferred_to_date !== day) continue;
        // "Daily" = the task's Repeats setting, matching the wording in the task modal, so the
        // weekly / monthly / yearly ones are exactly what's left behind.
        if (hideDailyTasks && t.frequency === "daily") continue;
        const occStart = activeStart ?? day;
        const windowEnd = occurrenceWindowEnd(t, day) ?? day;
        const span = windowEnd > occStart
          ? {
              isStart: day === occStart,
              isEnd: day === windowEnd,
              lead: day === occStart || day === rowStart,
              cols: dayDiff(day, windowEnd < rowEnd ? windowEnd : rowEnd) + 1,
              continues: windowEnd > gridEnd,
            }
          : null;
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
          span,
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
          span: null,
        });
      }

      return out.sort((a, b) => {
        // Spanning occurrences take the top lanes, in the same order, in every cell they cross —
        // otherwise the bar's continuation in one cell sits a lane below the bar in the next and the
        // two read as separate bubbles.
        if (!!a.span !== !!b.span) return a.span ? -1 : 1;
        if (a.span && b.span && a.span.cols !== b.span.cols) return b.span.cols - a.span.cols;
        return b.period - a.period || a.title.localeCompare(b.title);
      });
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
    // display:contents — a measurement anchor for useChipFit that adds no box of its own.
    <div ref={chipFit.gridRef} className="contents">
    <CalendarMonthWidget
      today={today}
      navigable
      navMonthLabel
      fixedWeeks={view === "month"}
      view={view}
      weekStart={weekStart}
      headerActions={headerActions}
      monthAnchor={anchor}
      onMonthChange={handleMonthChange}
      weekdayLabels={WEEKDAY_LABELS}
      renderDay={(day) => {
        // Nothing is drawn until the completion overlay covers this month (see overlayReady).
        const status = overlayReady ? dayStatus(day.date) : "none";
        const counts = overlayReady && day.isToday ? dayCounts(day.date) : null;
        const frozen = overlayReady && frozenDays.has(day.date);
        // The row this cell sits in — a spanning bar can only run to the end of its row, and
        // restarts on the next one. The grid supplies the bounds (a week needn't start on Sunday).
        const entries = overlayReady ? dayEntries(day.date, day.rowStart, day.rowEnd, range.to) : [];
        const shown = entries.slice(0, chipFit.fit);
        const overflow = entries.length - shown.length;

        return (

          /* DAY CELL — compact square below lg, Outlook-style day box at lg and up. Single clicks do
             nothing; the cell's only action is double-click-to-add, so it advertises that with a
             hover tint and a pointer cursor (both desktop-only). */
          <div
            key={day.date}
            onClick={onSelectDay ? () => onSelectDay(day.date) : undefined}
            title={onSelectDay ? "Open this day" : undefined}
            // select-none: a double-click on a cell is the "add here" gesture, not a text selection —
            // without it the second click highlights whatever chip text sits under the cursor.
            className={`qcal-day group select-none overflow-hidden aspect-square rounded flex flex-col items-center justify-center gap-0.5 lg:aspect-auto lg:min-h-[7rem] lg:items-stretch lg:justify-start lg:gap-0 lg:p-1 lg:border lg:text-left lg:transition-colors ${
              onSelectDay ? "lg:cursor-pointer" : ""
            } ${
              day.isToday
                ? "qcal-day--today bg-yellow-400/15 ring-1 ring-yellow-400 lg:ring-0 lg:border-yellow-400"
                : frozen
                  ? "qcal-day--frozen lg:border-cyan-500/50 lg:bg-cyan-500/10"
                  : "lg:border-gray-700"
            } ${day.inMonth ? "" : "opacity-30 lg:opacity-50"}`}
          >

            {/* DAY NUMBER ROW — centered when compact, day number + markers when wide */}
            <div className="flex items-center justify-center lg:justify-between gap-1 w-full shrink-0">
              <span className={`text-[11px] lg:text-[13px] tabular-nums leading-none ${day.isToday ? "text-yellow-400 font-semibold" : "text-gray-300"}`}>
                {parseYMD(day.date).getDate()}
              </span>

              {/* WIDE-ONLY MARKERS — a snowflake on frozen days, and the add button, which only
                  appears while the cursor is over this cell (or it's keyboard-focused). An explicit
                  target beats a double-click-anywhere gesture nobody can see. */}
              <span className="hidden lg:flex items-center gap-1 shrink-0">
                {frozen && <Snowflake className="w-3.5 h-3.5 text-cyan-400" />}

                {onCreateTask && (
                  <button
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onCreateTask(day.date);
                    }}
                    title="Add a task on this day"
                    className="flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 text-secondary hover:text-primary cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
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
                    onClick={(ev) => {
                      if (!onSelectTask) return;
                      // The chip is its own target — don't also trigger the cell's day click.
                      ev.stopPropagation();
                      onSelectTask(e.taskId, day.date);
                    }}
                    // A chip is a target of its own: don't let a fast double-click on it also fire
                    // the cell's "add a task on this day".
                    onDoubleClick={(ev) => ev.stopPropagation()}
                    title={`${e.time ? `${e.time} · ` : ""}${e.title} — ${chipStateNote(e)}${onSelectTask ? " · click to edit" : ""}`}
                    className={chipClass(e)}
                    // How many of this row's days the bar covers — the CSS widens it that far.
                    style={e.span?.lead ? ({ "--qcal-span-cols": e.span.cols } as CSSProperties) : undefined}
                  >
                    {(!e.span || e.span.lead) && e.carriedHere && <Snowflake className="w-2.5 h-2.5 shrink-0" />}
                    {(!e.span || e.span.lead) && e.time && <span className="qcal-chip-time">{e.time}</span>}
                    {/* Only the lead segment is labelled; a non-breaking space keeps the middle
                        segments the same height. */}
                    <span className="qcal-chip-title">{!e.span || e.span.lead ? e.title : "\u00A0"}</span>
                    {e.movedTo && <ArrowRight className="w-2.5 h-2.5 shrink-0" />}

                    {/* Runs past this row — the bar is cut by the row break, not finished. */}
                    {e.span?.lead && e.span.continues && (
                      <ArrowRight className="w-2.5 h-2.5 shrink-0 ml-auto" aria-label="continues" />
                    )}
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
      // ONE legend, wherever this widget renders: entries are coloured by repeat frequency, so the
      // legend names the cadences. (The old status-dot variant belonged to the compact mobile
      // layout, which no longer ships — the phone gets the full calendar page instead.)
      legend={QUEST_LEGEND}
    />
    </div>
  );
}
