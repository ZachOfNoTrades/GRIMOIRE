"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

// Shared, module-agnostic month-calendar widget chrome. It owns the parts every home-page
// mini-calendar has in common — the header, the weekday initials row, the Sunday-first month grid,
// and the legend slot — and delegates each day cell to a `renderDay` render-prop so each module
// keeps its own per-day semantics and accent.
//
// Two shapes, chosen by props (defaults preserve the original compact, fixed-month widget):
//   • compact (default)  — title + optional "Open" button, fixed month (monthAnchor/today).
//   • navigable + grid   — month label + prev/Today/next nav that steps the month IN PLACE, with a
//                          gridded cell look; `onMonthChange` fires so the consumer can refetch. The
//                          consumer typically wraps this beside an agenda panel in a `.calw-shell`.

// A single day in the rendered grid. isToday/inMonth are precomputed so consumers can style cells
// without re-deriving them.
export interface CalendarWidgetDay {
  date: string; // YYYY-MM-DD
  inMonth: boolean; // false for adjacent-month padding days
  isToday: boolean;
  // First/last day of the row this cell is drawn in. Consumers that span content across a row (a
  // multi-day task bar) need these, and can't derive them once the week can start on any weekday.
  rowStart: string;
  rowEnd: string;
}

// Wall-clock YYYY-MM-DD helpers (local midnight), shared so the grid math lives in one place.
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// First day of the month `delta` months away from anchorYMD (delta<0 = earlier), as YYYY-MM-DD.
export function shiftMonth(anchorYMD: string, delta: number): string {
  const a = parseYMD(anchorYMD);
  return ymd(new Date(a.getFullYear(), a.getMonth() + delta, 1));
}

// Sunday-first weeks-of-7 grid covering the month containing anchorYMD, padded with adjacent-month
// days so every row is full. todayYMD flags the current day for cell styling.
// Minimum week rows in a month grid. A 5-week month would otherwise stretch its rows taller than a
// 6-week one, so the cells (and how many entries fit in them) would resize as you page months.
const MIN_MONTH_ROWS = 6;

// Stamp a row of 7 consecutive days with the row bounds every cell in it shares.
function toRow(days: { date: string; inMonth: boolean }[], todayYMD: string): CalendarWidgetDay[] {
  const rowStart = days[0].date;
  const rowEnd = days[days.length - 1].date;
  return days.map((d) => ({ ...d, isToday: d.date === todayYMD, rowStart, rowEnd }));
}

export function buildWidgetMonth(
  anchorYMD: string,
  todayYMD: string,
  minWeeks = 1,
  weekStart = 0,
): CalendarWidgetDay[][] {
  const a = parseYMD(anchorYMD);
  const year = a.getFullYear();
  const month = a.getMonth();
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const cur = new Date(first);
  // Back up to the week's first day on/before the 1st — `weekStart` decides which weekday that is.
  cur.setDate(1 - ((first.getDay() - weekStart + 7) % 7));
  const weeks: CalendarWidgetDay[][] = [];
  while (true) {
    const week: { date: string; inMonth: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      week.push({ date: ymd(cur), inMonth: cur.getMonth() === month });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(toRow(week, todayYMD));
    if (cur > lastDay && weeks.length >= minWeeks) break;
  }
  return weeks;
}

// The single 7-day row containing anchorYMD, starting on `weekStart` (0=Sun … 6=Sat).
export function buildWidgetWeek(anchorYMD: string, todayYMD: string, weekStart = 0): CalendarWidgetDay[][] {
  const a = parseYMD(anchorYMD);
  const offset = (a.getDay() - weekStart + 7) % 7;
  const cur = new Date(a);
  cur.setDate(a.getDate() - offset);
  const week: { date: string; inMonth: boolean }[] = [];
  for (let d = 0; d < 7; d++) {
    // Every day of a week view belongs to the view — nothing is "padding".
    week.push({ date: ymd(cur), inMonth: true });
    cur.setDate(cur.getDate() + 1);
  }
  return [toRow(week, todayYMD)];
}

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function CalendarMonthWidget({
  today,
  title = "Calendar",
  onOpen,
  renderDay,
  legend,
  monthAnchor,
  navigable = false,
  onMonthChange,
  variant = "compact",
  weekdayLabels = WEEKDAY_INITIALS,
  navMonthLabel = false,
  fixedWeeks = false,
  headerActions,
  view = "month",
  weekStart = 0,
}: {
  today: string; // YYYY-MM-DD anchoring "today"
  title?: string; // header label (compact mode only)
  onOpen?: () => void; // "Open" button handler (compact mode; hidden when omitted)
  renderDay: (day: CalendarWidgetDay) => ReactNode; // per-day cell (consumer sets the key)
  legend?: ReactNode; // optional legend row under the grid
  monthAnchor?: string; // month to display; defaults to the month containing `today`
  navigable?: boolean; // show prev/Today/next month nav in the header and step the month in place
  onMonthChange?: (anchorYMD: string) => void; // fires with the first-of-visible-month on nav
  variant?: "compact" | "grid"; // "grid" = gridded, taller cells (dots pinned to the bottom)
  weekdayLabels?: string[]; // 7 column headers (default single letters; grid usage passes 3-letter)
  // Navigable mode only: put the visible month INSIDE the prev/next stepper (so it reads
  // "< August 2026 >") and leave `title` on the header's left. Clicking it still jumps to today.
  navMonthLabel?: boolean;
  // Always render six week rows, so day cells keep the same height from month to month.
  fixedWeeks?: boolean;
  // Optional trailing content for the navigable header (e.g. a ⋮ menu). Occupies the third column
  // of the centred header grid, opposite the title.
  headerActions?: ReactNode;
  // "week" renders a single 7-day row instead of the month grid, with the header stepping by week.
  // Everything else — cells, chrome, the renderDay contract — is identical, so a consumer gets the
  // same-looking calendar either way.
  view?: "month" | "week";
  // Which weekday a row starts on (0=Sun … 6=Sat) — honoured by both views.
  weekStart?: number;
}) {
  // In navigable mode the widget owns the visible month; otherwise it's fixed to monthAnchor/today.
  const [viewAnchor, setViewAnchor] = useState<string>(monthAnchor ?? today);
  const anchor = navigable ? viewAnchor : (monthAnchor ?? today);

  const weeks = useMemo(
    () => (view === "week"
      ? buildWidgetWeek(anchor, today, weekStart)
      : buildWidgetMonth(anchor, today, fixedWeeks ? MIN_MONTH_ROWS : 1, weekStart)),
    [anchor, today, fixedWeeks, view, weekStart],
  );

  // Notify the consumer of the visible month so it can (re)fetch that month's data. Intentionally
  // keyed on the month only — onMonthChange is expected to be stable (useCallback) on the consumer.
  useEffect(() => {
    if (navigable) onMonthChange?.(viewAnchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewAnchor, navigable]);

  // The header's range label: a month, or the week's span.
  const monthLabel = useMemo(() => {
    if (view === "week") {
      const row = weeks[0];
      const s = parseYMD(row[0].date);
      const e = parseYMD(row[6].date);
      const sLbl = `${MONTH_LABELS[s.getMonth()].slice(0, 3)} ${s.getDate()}`;
      const eLbl = `${MONTH_LABELS[e.getMonth()].slice(0, 3)} ${e.getDate()}`;
      return `${sLbl} – ${eLbl}, ${e.getFullYear()}`;
    }
    const a = parseYMD(anchor);
    return `${MONTH_LABELS[a.getMonth()]} ${a.getFullYear()}`;
  }, [anchor, view, weeks]);

  // Stepping moves by whatever is on screen — a month, or a week.
  const step = (delta: number) =>
    setViewAnchor((a) => (view === "week" ? ymd(new Date(parseYMD(a).getTime() + delta * 7 * 86400000)) : shiftMonth(a, delta)));

  return (

    // ROOT — single element so the grid variant can be scoped and the widget can be a flex child.
    <div className={`calw-root${variant === "grid" ? " calw--grid" : ""}`}>

      {/* HEADER — the navigable variant centres its month stepper (three columns: title, nav,
          spacer) so the controls sit dead centre over the grid. */}
      <div className={`calw-header${navigable ? " calw-header--centered" : ""}`}>

        {navigable ? (

          // NAVIGABLE HEADER — month label on the left, prev/Today/next on the right
          <>

            {/* HEADER LABEL — the visible month, or the plain title when the month rides in the nav */}
            <div className="calw-title">
              <CalendarDays className="w-5 h-5" />
              <span className="tabular-nums">{navMonthLabel ? title : monthLabel}</span>
            </div>

            {/* MONTH NAV */}
            <div className="calw-nav">

              {/* PREVIOUS MONTH */}
              <button type="button" className="calw-nav-btn" title={view === "week" ? "Previous week" : "Previous month"} onClick={() => step(-1)}>
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* TODAY / MONTH — label depends on navMonthLabel; the action is "jump to today" either way */}
              <button
                type="button"
                className={`calw-nav-today${navMonthLabel ? " calw-nav-month" : ""}`}
                title="Jump to today"
                onClick={() => setViewAnchor(today)}
              >
                {navMonthLabel ? monthLabel : "Today"}
              </button>

              {/* NEXT MONTH */}
              <button type="button" className="calw-nav-btn" title={view === "week" ? "Next week" : "Next month"} onClick={() => step(1)}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* HEADER ACTIONS — trailing slot, opposite the title. */}
            <div className="calw-header-actions">{headerActions}</div>
          </>
        ) : (

          // COMPACT HEADER — title on the left, optional "Open" on the right
          <>

            {/* TITLE */}
            <h2 className="text-card-title">
              <CalendarDays className="w-5 h-5" />
              {title}
            </h2>

            {/* OPEN BUTTON */}
            {onOpen && (
              <button type="button" onClick={onOpen} className="calw-open">
                Open <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>

      {/* MONTH LABEL (compact mode only — navigable puts it in the header) */}
      {!navigable && <div className="calw-month tabular-nums">{monthLabel}</div>}

      {/* WEEKDAY HEADER — rotated to match the row's first day when the week doesn't start Sunday */}
      <div className="calw-week calw-weekday-row">
        {weekdayLabels.map((_, i) => (
          <div key={i} className="calw-weekday">
            {weekdayLabels[(i + weekStart) % 7]}
          </div>
        ))}
      </div>

      {/* MONTH GRID */}
      <div className="calw-grid">
        {weeks.map((week, wi) => (

          /* WEEK ROW */
          <div key={wi} className="calw-week">
            {week.map((day) => renderDay(day))}
          </div>
        ))}
      </div>

      {/* LEGEND */}
      {legend && <div className="calw-legend">{legend}</div>}
    </div>
  );
}
