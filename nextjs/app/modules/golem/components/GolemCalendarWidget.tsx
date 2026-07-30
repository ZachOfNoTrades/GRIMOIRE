"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import CalendarMonthWidget, {
  buildWidgetMonth,
  parseYMD,
  ymd,
} from "@/components/CalendarMonthWidget";
import { GolemCalendarSession } from "../types/calendar";

// Month calendar for the golem home page — a navigable month grid (dots per day, mapped to golem
// session states) paired with an agenda panel listing the selected day's workouts. Built on the
// shared CalendarMonthWidget chrome (navigable + grid variant); the agenda is composed alongside it.

const CALENDAR_PATH = "/modules/golem/ui/calendar";
const CALENDAR_API = "/modules/golem/api/sessions/calendar";
const MAX_DOTS_PER_CELL = 3;

type SessionState = "done" | "current" | "logged";

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// A completed workout wins (green), then the live/current one (blue), then any other logged/ad-hoc
// session (neutral). Mirrors the full calendar page's chip colouring.
function sessionState(s: GolemCalendarSession): SessionState {
  if (s.is_completed) return "done";
  if (s.is_current) return "current";
  return "logged";
}

// Secondary agenda line — the workout's descriptor, avoiding any wall-clock time (no reliable
// per-session time-of-day, and it would be timezone-fragile for a glance widget).
function sessionDetail(s: GolemCalendarSession): string {
  if (s.day_archetype_name) return s.day_archetype_name;
  if (s.is_completed && s.duration && s.duration > 0) return `${Math.round(s.duration / 60)} min`;
  if (s.is_current) return "In progress";
  return "Not started";
}

export default function GolemCalendarWidget({ today }: { today?: string }) {
  const router = useRouter();

  // DATA
  const [sessions, setSessions] = useState<GolemCalendarSession[]>([]);

  // INPUT
  const [viewAnchor, setViewAnchor] = useState<string>(""); // first-of-visible-month (from the widget)
  const [selectedDate, setSelectedDate] = useState<string>(""); // day whose agenda is shown

  const todayYMD = useMemo(() => today ?? ymd(new Date()), [today]);

  // The widget drives the visible month; mirror it here to fetch that month's sessions and to pick a
  // sensible default agenda day (today when it's in view, else the 1st of the shown month).
  const handleMonthChange = useCallback(
    (anchor: string) => {
      setViewAnchor(anchor);
      setSelectedDate(anchor.slice(0, 7) === todayYMD.slice(0, 7) ? todayYMD : anchor);
    },
    [todayYMD],
  );

  // Fetch the visible month's sessions (incl. the adjacent-month padding days) whenever it changes.
  useEffect(() => {
    if (!viewAnchor) return;
    const weeks = buildWidgetMonth(viewAnchor, todayYMD);
    const from = weeks[0][0].date;
    const to = weeks[weeks.length - 1][6].date;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${CALENDAR_API}?from=${from}&to=${to}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setSessions(Array.isArray(data) ? data : []);
      } catch {
        // best-effort — the grid still renders empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewAnchor, todayYMD]);

  // Bucket sessions by their calendar day for O(1) per-cell / agenda lookups.
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, GolemCalendarSession[]>();
    for (const s of sessions) {
      const list = map.get(s.calendar_date);
      if (list) list.push(s);
      else map.set(s.calendar_date, [s]);
    }
    return map;
  }, [sessions]);

  const selectedSessions = selectedDate ? sessionsByDate.get(selectedDate) ?? [] : [];

  // Human label for the agenda header (e.g. "Wed, July 8").
  const selectedLabel = useMemo(() => {
    if (!selectedDate) return "";
    const d = parseYMD(selectedDate);
    return `${WEEKDAY_LABELS[d.getDay()].slice(0, 3)}, ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
  }, [selectedDate]);

  return (

    // SHELL — calendar section + agenda side panel (wraps to stacked when narrow)
    <div className="calw-shell">

      {/* CALENDAR SECTION */}
      <CalendarMonthWidget
        today={todayYMD}
        navigable
        variant="grid"
        weekdayLabels={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]}
        onMonthChange={handleMonthChange}
        renderDay={(day) => {
          const list = sessionsByDate.get(day.date) ?? [];
          const shown = list.slice(0, MAX_DOTS_PER_CELL);
          const more = list.length - shown.length;
          const isSelected = day.date === selectedDate;

          return (

            /* DAY CELL */
            <button
              key={day.date}
              type="button"
              onClick={() => setSelectedDate(day.date)}
              className={`calw-day${day.inMonth ? "" : " calw-day--out"}${day.isToday ? " calw-day--today" : ""}${isSelected ? " calw-day--selected" : ""}`}
            >

              {/* DAY NUMBER */}
              <span className="calw-daynum">{parseYMD(day.date).getDate()}</span>

              {/* STATUS DOTS + OVERFLOW */}
              <div className="calw-dots">
                {shown.map((s) => (
                  <span key={s.id} className={`calw-dot calw-dot--${sessionState(s)}`} />
                ))}
                {more > 0 && <span className="calw-more">+{more}</span>}
              </div>
            </button>
          );
        }}
        legend={
          <>

            {/* DONE */}
            <span className="calw-legend-item"><span className="calw-dot calw-dot--done" />Done</span>

            {/* CURRENT */}
            <span className="calw-legend-item"><span className="calw-dot calw-dot--current" />Current</span>

            {/* LOGGED */}
            <span className="calw-legend-item"><span className="calw-dot calw-dot--logged" />Logged</span>
          </>
        }
      />

      {/* AGENDA SECTION */}
      <aside className="calw-agenda">

        {/* AGENDA HEADER */}
        <div className="calw-agenda-head">

          {/* LABELS */}
          <div className="calw-agenda-head-labels">
            <span className="calw-agenda-kicker">Agenda</span>
            <span className="calw-agenda-date">{selectedLabel || " "}</span>
          </div>

          {/* COUNT */}
          <span className="calw-agenda-count">{selectedSessions.length}</span>
        </div>

        {/* AGENDA LIST */}
        <div className="calw-agenda-list">
          {selectedSessions.length > 0 ? (
            selectedSessions.map((s) => {
              const state = sessionState(s);

              return (

                /* AGENDA ITEM */
                <button
                  key={s.id}
                  type="button"
                  className="calw-agenda-item"
                  onClick={() => router.push(`/modules/golem/ui/session/${s.id}`)}
                >

                  {/* STATE BAR */}
                  <span className={`calw-agenda-bar calw-agenda-bar--${state}`} />

                  {/* ITEM BODY */}
                  <div className="calw-agenda-item-body">

                    {/* TITLE + MODULE BADGE */}
                    <div className="calw-agenda-item-top">
                      <span className="calw-agenda-title">{s.name}</span>
                      <span className={`calw-badge calw-badge--${state}`}>{s.is_standalone ? "Standalone" : "Program"}</span>
                    </div>

                    {/* DETAIL LINE */}
                    <span className="calw-agenda-time">{sessionDetail(s)}</span>
                  </div>
                </button>
              );
            })
          ) : (

            // EMPTY STATE
            <div className="calw-agenda-empty">
              <CalendarDays className="w-6 h-6" strokeWidth={1.5} />
              <span>No workouts on this day</span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
