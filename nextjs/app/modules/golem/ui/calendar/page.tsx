"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Check,
  Play,
  Plus,
  X,
} from "lucide-react";
import { GolemCalendarSession } from "../../types/calendar";

// ── Date helpers (wall-clock YYYY-MM-DD, anchored at local midnight) ──────────────────────────
// Mirrors the quest calendar's approach: dates are plain YYYY-MM-DD strings so they never drift
// with timezone math, and Date objects are only used transiently for grid arithmetic.
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Build the month grid (weeks of 7, Sunday-first) covering the month containing anchorYMD,
// padded with leading/trailing days from adjacent months so every row has 7 cells.
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

// State drives the chip colour: completed sessions read green, the live/current session reads
// blue, everything else (started-not-finished, or a freshly-added ad-hoc workout) is neutral.
function chipStateClass(s: GolemCalendarSession): string {
  if (s.is_completed) return "gcal-chip--done";
  if (s.is_current) return "gcal-chip--current";
  return "gcal-chip--other";
}

const MAX_CHIPS_PER_CELL = 3;

export default function GolemCalendarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Deep-link support: the home widget links to ?date=YYYY-MM-DD to focus a day (anchor its month
  // and open its detail). Read once for the initial anchor/selection.
  const initialDate = searchParams.get("date");

  // DATA
  const [sessions, setSessions] = useState<GolemCalendarSession[]>([]);

  // INPUT
  const [anchor, setAnchor] = useState<string>(""); // any day inside the displayed month
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const today = useMemo(() => ymd(new Date()), []);

  // On first mount, anchor the calendar — on a deep-linked ?date= day if valid (and open it),
  // otherwise on the current month.
  useEffect(() => {
    if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
      setAnchor(initialDate);
      setSelectedDate(initialDate);
    } else {
      setAnchor(today);
    }
  }, [today, initialDate]);

  // The visible grid (including the adjacent-month padding days) for the anchored month.
  const weeks = useMemo(() => (anchor ? buildMonthMatrix(anchor) : []), [anchor]);

  // Pull every session that lands inside the visible grid whenever the month changes.
  const fetchSessions = useCallback(async () => {
    if (weeks.length === 0) return;
    const from = weeks[0][0].date;
    const lastWeek = weeks[weeks.length - 1];
    const to = lastWeek[lastWeek.length - 1].date;
    setIsLoading(true);
    try {
      const response = await fetch(`/modules/golem/api/sessions/calendar?from=${from}&to=${to}`);
      if (!response.ok) {
        toast.error("Failed to load calendar");
        return;
      }
      const data: GolemCalendarSession[] = await response.json();
      setSessions(data);
    } catch (error) {
      console.error("Error fetching calendar sessions:", error);
      toast.error("Failed to load calendar");
    } finally {
      setIsLoading(false);
    }
  }, [weeks]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Bucket sessions by their calendar day for O(1) cell lookups.
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, GolemCalendarSession[]>();
    for (const s of sessions) {
      const list = map.get(s.calendar_date);
      if (list) list.push(s);
      else map.set(s.calendar_date, [s]);
    }
    return map;
  }, [sessions]);

  // Month navigation — step the anchor a month back/forward, or jump home to today.
  const stepMonth = (delta: number) => {
    if (!anchor) return;
    const a = parseYMD(anchor);
    setAnchor(ymd(new Date(a.getFullYear(), a.getMonth() + delta, 1)));
  };

  const monthTitle = anchor
    ? `${MONTH_LABELS[parseYMD(anchor).getMonth()]} ${parseYMD(anchor).getFullYear()}`
    : " ";

  const selectedSessions = selectedDate ? sessionsByDate.get(selectedDate) ?? [] : [];

  // Create a standalone workout (dated today) and jump into it to start logging. The backend
  // can't backdate sessions, so this is offered only on today's detail view.
  const handleNewWorkout = async () => {
    setIsCreatingSession(true);
    try {
      const response = await fetch("/modules/golem/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Workout ${today}` }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to create session");
        return;
      }
      const { id } = await response.json();
      router.push(`/modules/golem/ui/session/${id}?new=true`);
    } catch (error) {
      console.error("Error creating session:", error);
      toast.error("Failed to create session");
    } finally {
      setIsCreatingSession(false);
    }
  };

  const formatSelectedDate = (date: string): string => {
    const d = parseYMD(date);
    return `${WEEKDAY_LABELS[d.getDay()]}, ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
  };

  return (

    // PAGE
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* PAGE HEADER */}
        <div className="mb-6">

          {/* PAGE TITLE */}
          <h1 className="text-page-title">
            <CalendarDays className="w-8 h-8" />
            Calendar
          </h1>
        </div>

        {/* TOOLBAR — month navigation + jump-to-today */}
        <div className="flex items-center justify-between mb-4">

          {/* MONTH NAV */}
          <div className="flex items-center gap-2">

            {/* PREVIOUS MONTH */}
            <Button className="btn-blue" onClick={() => stepMonth(-1)} aria-label="Previous month">
              <ChevronLeft className="w-4 h-4" />
            </Button>

            {/* MONTH TITLE */}
            <span className="text-card-title">{monthTitle}</span>

            {/* NEXT MONTH */}
            <Button className="btn-blue" onClick={() => stepMonth(1)} aria-label="Next month">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* TODAY BUTTON */}
          <Button className="btn-blue" onClick={() => setAnchor(today)}>
            Today
          </Button>
        </div>

        {/* CALENDAR CARD */}
        <div className="card">

          {/* CARD CONTENT */}
          <div className="card-content">
            {isLoading && sessions.length === 0 ? (

              // LOADING PLACEHOLDER
              <div className="loading-container" style={{ height: 320 }}>
                <div className="loading-spinner" />
              </div>
            ) : (

              // CALENDAR GRID
              <div>

                {/* WEEKDAY HEADER ROW */}
                <div className="gcal-grid mb-1">
                  {WEEKDAY_LABELS.map((label) => (
                    <div key={label} className="gcal-weekday">{label}</div>
                  ))}
                </div>

                {/* WEEK ROWS */}
                {weeks.map((week, wi) => (

                  /* WEEK */
                  <div key={wi} className="gcal-grid mb-1">
                    {week.map((cell) => {
                      const cellSessions = sessionsByDate.get(cell.date) ?? [];
                      const overflow = cellSessions.length - MAX_CHIPS_PER_CELL;

                      return (

                        /* DAY CELL */
                        <button
                          key={cell.date}
                          type="button"
                          className={`gcal-cell${cell.inMonth ? "" : " gcal-cell--out"}${cell.date === today ? " gcal-cell--today" : ""}`}
                          onClick={() => setSelectedDate(cell.date)}
                        >

                          {/* DAY NUMBER */}
                          <span className="gcal-daynum">{parseYMD(cell.date).getDate()}</span>

                          {/* SESSION CHIPS */}
                          {cellSessions.slice(0, MAX_CHIPS_PER_CELL).map((s) => (
                            <span key={s.id} className={`gcal-chip ${chipStateClass(s)}`}>
                              {s.name}
                            </span>
                          ))}

                          {/* OVERFLOW COUNT */}
                          {overflow > 0 && (
                            <span className="gcal-more">+{overflow} more</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DAY DETAIL MODAL */}
      {selectedDate && (

        // BACKDROP
        <div className="modal-backdrop" onClick={() => setSelectedDate(null)}>

          {/* MODAL CARD */}
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>

            {/* MODAL HEADER */}
            <div className="modal-header">

              {/* TITLE */}
              <h2 className="text-modal-title">
                {formatSelectedDate(selectedDate)}
                {selectedDate === today && <span className="badge badge-blue ml-2">Today</span>}
              </h2>

              {/* CLOSE BUTTON */}
              <Button className="btn-blue" onClick={() => setSelectedDate(null)} aria-label="Close">
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* MODAL BODY */}
            <div className="modal-body">

              {selectedSessions.length === 0 ? (

                // EMPTY STATE
                <p className="text-secondary">No workouts logged on this day.</p>
              ) : (

                // SESSION LIST
                <div className="flex flex-col gap-2">
                  {selectedSessions.map((s) => (

                    /* SESSION ROW */
                    <Link
                      key={s.id}
                      className="card cursor-pointer"
                      href={`/modules/golem/ui/session/${s.id}`}
                    >

                      {/* ROW CONTENT */}
                      <div className="flex items-center justify-between gap-2">

                        {/* NAME + CONTEXT */}
                        <div className="flex flex-col items-start">

                          {/* SESSION NAME */}
                          <span className="text-primary font-medium">{s.name}</span>

                          {/* CONTEXT LINE */}
                          <span className="text-secondary text-sm">
                            {s.program_name ? s.program_name : "Standalone"}
                            {s.day_archetype_name ? ` · ${s.day_archetype_name}` : ""}
                          </span>
                        </div>

                        {/* STATE INDICATOR */}
                        {s.is_completed ? (
                          <span className="badge badge-green"><Check className="w-3 h-3" /> Done</span>
                        ) : s.is_current ? (
                          <span className="badge badge-blue"><Play className="w-3 h-3" /> Current</span>
                        ) : (
                          <span className="badge badge-gray">In progress</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* MODAL FOOTER — add an extra workout for today (e.g. a daily 50-pullup session) */}
            {selectedDate === today && (
              <div className="modal-footer">

                {/* NEW WORKOUT BUTTON */}
                <Button className="btn-blue" onClick={handleNewWorkout} disabled={isCreatingSession}>
                  <Plus className="w-4 h-4" />
                  {isCreatingSession ? "Creating..." : "New Workout"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
