"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CalendarMonthWidget, { buildWidgetMonth } from "@/components/CalendarMonthWidget";
import {
  ScheduleShape,
  isOccurrenceOn,
  activeOccurrenceStart,
  occurrenceWindowEnd,
  parseYMD,
} from "../lib/scheduleClient";

// Compact month calendar for the Quest home page — a succinct counterpart to the full calendar page
// (status dot per day + x/y on today). Built on the shared CalendarMonthWidget chrome; this file
// keeps quest's task-cadence semantics (which occurrence is due/missed/done/frozen) and its own
// day-cell styling. Tapping anything opens the full calendar.

export interface WidgetTask extends ScheduleShape {
  id: string;
  title: string;
  kind: "daily" | "todo";
  last_completed_date: string | null;
}

interface Completion {
  task_id: string;
  completed_on: string;
}

type DayStatus = "done" | "missed" | "due" | "frozen" | "none";

const CALENDAR_PATH = "/modules/quest/ui/calendar";

export default function QuestCalendarWidget({ tasks, today }: { tasks: WidgetTask[]; today: string }) {
  const router = useRouter();

  // DATA
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [frozenDays, setFrozenDays] = useState<Set<string>>(new Set());

  // The shared grid for the month containing `today` (also drives the completions fetch range).
  const weeks = useMemo(() => buildWidgetMonth(today, today), [today]);
  const range = useMemo(() => ({ from: weeks[0][0].date, to: weeks[weeks.length - 1][6].date }), [weeks]);

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

  // Completed / total scheduled dailies for a day (used to show "x/y" on today instead of a dot).
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
      title="Calendar"
      onOpen={() => router.push(CALENDAR_PATH)}
      renderDay={(day) => {
        const status = dayStatus(day.date);
        const counts = day.isToday ? dayCounts(day.date) : null;

        return (

          /* DAY CELL — quest keeps its own gold today-accent + status-dot styling */
          <button
            key={day.date}
            onClick={() => router.push(`${CALENDAR_PATH}?date=${day.date}`)}
            className={`aspect-square rounded flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
              day.isToday ? "bg-yellow-400/15 ring-1 ring-yellow-400" : "hover:bg-gray-800"
            } ${day.inMonth ? "" : "opacity-30"}`}
          >

            {/* DAY NUMBER */}
            <span className={`text-[11px] tabular-nums leading-none ${day.isToday ? "text-yellow-400 font-semibold" : "text-gray-300"}`}>
              {parseYMD(day.date).getDate()}
            </span>

            {/* TODAY SHOWS COMPLETED/TOTAL; OTHER DAYS A STATUS DOT */}
            {day.isToday && counts ? (
              <span className="text-[9px] tabular-nums leading-none text-yellow-400">{counts.done}/{counts.total}</span>
            ) : (
              <span className={`w-1.5 h-1.5 rounded-full ${dotClass(status)}`} />
            )}
          </button>
        );
      }}
      legend={
        <>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Done</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />Missed</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />Due</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />Frozen</span>
        </>
      }
    />
  );
}
