"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Flame } from "lucide-react";
import { DailyTotals } from "../../types/entry";
import { MacroTarget } from "../../types/target";
import {
  todayIso,
  shiftDate,
  weekStartFor,
} from "../_diary";

/* ─── COLOR TOKENS ───
   Semantic aliases over the grimoire terminal-theme design tokens
   (globals.css :root). No hardcoded colors — every value resolves to a
   CSS custom property so the dashboard tracks the app theme. Mirrors the
   `C` map in home/HomeClient.tsx; kept local because these values reach
   inline style / SVG fill+stroke driven by data. */
const C = {
  card: "var(--card-bg)",          // cell base
  todayFill: "color-mix(in srgb, var(--color-primary) 22%, var(--solid-background))", // muted gray disc marking the current day
  selectedFill: "color-mix(in srgb, var(--color-secondary) 20%, var(--solid-background))", // light-gray disc marking the viewed/target day (when it isn't today); neutral (vs today's primary-tinted disc) and theme-aware
  divider: "var(--card-border)",
  border: "var(--card-border)",
  text: "var(--color-primary)",
  textMuted: "var(--color-secondary)",
  textDim: "var(--color-gray)",
  // Macro hues — shared chart tokens (globals.css --fg-*)
  kcal: "var(--fg-cal)",        // blue
  protein: "var(--fg-protein)", // orange
  fat: "var(--fg-fat)",         // purple
  carb: "var(--fg-carb)",       // green
};

// Empty totals used when a day has no logged entries yet.
const EMPTY_TOTALS: DailyTotals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, micros: {} };

// Monday-first weekday letters, aligned to weekStartFor() (which returns Monday).
const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/* ============================================================
   Forage / Diary mini dashboard.

   A sticky header pinned to the top of the diary's scroll region. Two
   stacked sections:
     1. A Mon–Sun row of calorie ring indicators — each ring's stroke
        sweeps clockwise from 12 o'clock, a full revolution = the day's
        calorie goal met. The current calendar day gets a filled primary
        inner shade; the viewed/target day gets a light-gray inner shade
        (shown once the target day moves off today, since today's disc wins
        when it is also selected); the weekday letter sits inside the ring.
        Tapping any ring navigates the diary to that date. This row COLLAPSES (height +
        fade) once the timeline is scrolled, reclaiming vertical space.
     2. Current-day macro bars (calories + the three macros) on a single
        row as plain 0–100 progress bars (no floor/ceiling markers). This
        row stays STATIC — it remains pinned while the rings collapse.
   ============================================================ */
export default function ForageDiaryDashboard({
  date,
  onPickDate,
  reloadSignal,
  liveTotals,
}: {
  date: string;
  onPickDate: (iso: string) => void;
  reloadSignal: number;
  // The timeline's running totals for the day it's viewing (summed from its
  // optimistically-painted entries). When present and matching the viewed date,
  // it overrides the fetched week total for that day so the current day's ring +
  // macro bars update the instant a food is logged/edited/deleted — the fetched
  // weekData still backs the other six days and reconciles this one on refetch.
  liveTotals?: { date: string; totals: DailyTotals } | null;
}) {
  // DATA
  const [weekData, setWeekData] = useState<Record<string, DailyTotals>>({});
  const [target, setTarget] = useState<MacroTarget | null>(null);
  // The Monday the current `weekData` was fetched for. Lets us tell "this week's
  // totals are loaded" from "we're viewing a new week whose data hasn't landed
  // yet" — the latter drives the macro bars' loading state instead of flashing
  // zeros (or, before the timeline fix, the previous day's numbers).
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);

  // STATE — collapsed once the surrounding scroll region is scrolled past a
  // small threshold; the rings animate away, the macro bars stay pinned.
  const [collapsed, setCollapsed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Derived: the Monday of the week containing the viewed date, and its 7 days.
  const weekStart = weekStartFor(date);
  const weekDays = Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i));
  const today = todayIso();

  // Totals for a given day, preferring the timeline's live (optimistic) totals
  // for the viewed date so the ring/bars track a just-logged food immediately;
  // every other day falls back to the fetched week data.
  const totalsForDay = (d: string): DailyTotals =>
    (liveTotals && liveTotals.date === d ? liveTotals.totals : weekData[d]) ?? EMPTY_TOTALS;
  const dayTotals = totalsForDay(date);

  // Fetch the whole week's totals (7 parallel calls, mirrors HomeClient.fetchWeek)
  // plus the macro target effective on the viewed date. Re-runs when the date
  // moves to a different week or the page signals a reload after logging.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const start = weekStartFor(date);
      const days = Array.from({ length: 7 }, (_, i) => shiftDate(start, i));
      try {
        const [weekResults, tRes] = await Promise.all([
          Promise.all(
            days.map(async (d) => {
              const r = await fetch(`/modules/forage/api/entries?date=${d}`);
              const data = await r.json();
              return [d, data.totals ?? EMPTY_TOTALS] as const;
            })
          ),
          fetch(`/modules/forage/api/targets?date=${date}`),
        ]);
        if (cancelled) return;
        const map: Record<string, DailyTotals> = {};
        for (const [d, t] of weekResults) map[d] = t;
        setWeekData(map);
        setLoadedWeek(start); // this week's totals are now in `weekData`
        setTarget(await tRes.json().catch(() => null));
      } catch {
        // non-critical — leave prior data in place
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [date, reloadSignal]);

  // Collapse the rings as soon as the diary's scroll region moves. The scroller
  // is the shared `.page-scroll` ancestor; an rAF guard coalesces scroll bursts.
  useEffect(() => {
    const scroller = rootRef.current?.closest(".page-scroll") as HTMLElement | null;
    if (!scroller) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setCollapsed(scroller.scrollTop > 8);
        ticking = false;
      });
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // sync initial state (e.g. restored scroll position)
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  // Whether the viewed day's totals are actually known yet. True when the
  // timeline has published live totals for this exact day, OR the fetched week
  // covering it has landed. False only in the gap after stepping into a new week
  // (or on first mount) before that week's totals arrive — during which the macro
  // bars show a loading shimmer rather than momentary zeros. Same-week steps keep
  // this true (weekData already holds every day), so those update instantly.
  const dayKnown = (liveTotals?.date === date) || loadedWeek === weekStart;

  // Per-day calorie fraction (0–1) of the goal; goal is the viewed date's target
  // applied across the week (goals are generally constant within a week).
  const calorieGoal = target?.kcal ?? 0;

  // Macro bar cells for the viewed day — calories first (flame icon), then the
  // three macros keyed by their conventional letter (P/F/C).
  const macroCells: { key: string; symbol: ReactNode; value: number; goal: number; color: string }[] = [
    { key: "kcal", symbol: <Flame size={12} strokeWidth={2.5} />, value: dayTotals.kcal, goal: target?.kcal ?? 0, color: C.kcal },
    { key: "protein", symbol: "P", value: dayTotals.protein_g, goal: target?.protein_g ?? 0, color: C.protein },
    { key: "fat", symbol: "F", value: dayTotals.fat_g, goal: target?.fat_g ?? 0, color: C.fat },
    { key: "carbs", symbol: "C", value: dayTotals.carbs_g, goal: target?.carbs_g ?? 0, color: C.carb },
  ];

  return (
    /* DASHBOARD — sticky header pinned to the top of the diary scroll region;
       solid page tone + raised z so the timeline scrolls cleanly beneath it. */
    <div
      ref={rootRef}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: "var(--solid-background)",
        paddingTop: "0.25rem",
        paddingBottom: "0.75rem",
        marginBottom: "0.75rem",
        borderBottom: `1px solid ${C.divider}`,
      }}
    >

      {/* WEEKLY CALORIE RINGS — Mon–Sun; collapses (height + fade) on scroll. */}
      <div
        style={{
          overflow: "hidden",
          maxHeight: collapsed ? 0 : 64,
          opacity: collapsed ? 0 : 1,
          marginBottom: collapsed ? 0 : "0.875rem",
          pointerEvents: collapsed ? "none" : "auto",
          transition: "max-height 240ms ease, opacity 200ms ease, margin-bottom 240ms ease",
        }}
        aria-hidden={collapsed}
      >
        {/* RING ROW */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
          {weekDays.map((d, i) => {
            const dt = totalsForDay(d);
            const pct = calorieGoal > 0 ? dt.kcal / calorieGoal : 0;
            return (
              <CalorieRing
                key={d}
                letter={WEEKDAY_LETTERS[i]}
                pct={pct}
                isToday={d === today}
                isSelected={d === date}
                onClick={() => onPickDate(d)}
              />
            );
          })}
        </div>
      </div>

      {/* CURRENT-DAY MACRO BARS — single row, plain 0–100 bars, no markers. */}
      <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
        {macroCells.map((cell) => (
          <MacroBar
            key={cell.key}
            symbol={cell.symbol}
            value={cell.value}
            goal={cell.goal}
            color={cell.color}
            loading={!dayKnown}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── CALORIE RING ───
   A circular calorie indicator: a muted track ring with a colored arc that
   sweeps clockwise from 12 o'clock; a full revolution = the calorie goal met.
   The inner disc fills with a muted shade on the current calendar day, and the
   weekday's first letter sits inside the ring. */
function CalorieRing({
  letter,
  pct,
  isToday,
  isSelected,
  onClick,
}: {
  letter: string;
  pct: number;
  isToday: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const SIZE = 42;
  const STROKE = 3.5;
  const radius = (SIZE - STROKE) / 2;
  const center = SIZE / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(1, pct));
  const dashOffset = circumference * (1 - filled);

  return (
    /* RING CELL — tappable column holding a single ring. */
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        flex: "1 1 0",
        minWidth: 0,
      }}
      aria-label={`View ${letter}`}
    >
      {/* RING — SVG track + progress arc, weekday letter overlaid in the center. */}
      <div style={{ position: "relative", width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* TRACK — full circle; inner disc gets a muted primary shade on the
              current day, else a light-gray highlight on the viewed/target day so
              the selected ring stands out as you step through days. Today wins the
              disc when it's also the selected day (the default on load), so the
              gray highlight only appears once the target day moves off today. */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill={isToday ? C.todayFill : isSelected ? C.selectedFill : "transparent"}
            stroke={C.divider}
            strokeWidth={STROKE}
          />

          {/* PROGRESS ARC — sweeps clockwise from 12 o'clock (rotate -90°).
              Always mounted (offset hides it fully at 0) so the dashoffset
              transition can animate the sweep when a log add/delete changes
              this day's total — a fresh mount wouldn't animate. */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={C.kcal}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${center} ${center})`}
            style={{ transition: "stroke-dashoffset 480ms cubic-bezier(0.22, 1, 0.36, 1)" }}
          />
        </svg>

        {/* DAY LETTER — overlaid HTML so it stays crisp and theme-colored. */}
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: isToday ? 700 : 500,
            color: isToday || isSelected ? C.text : C.textMuted,
          }}
        >
          {letter}
        </span>
      </div>
    </button>
  );
}

/* ─── MACRO BAR ───
   A single compact 0–100 progress cell for one macro (or calories): the macro's
   colored icon/letter inline to the left of the consumed / goal figure, then a
   track that fills to the consumed fraction of the goal. No floor/ceiling markers
   by design. Sized flex:1 so the four cells share one row evenly. */
function MacroBar({
  symbol,
  value,
  goal,
  color,
  loading,
}: {
  symbol: ReactNode;
  value: number;
  goal: number;
  color: string;
  // While the viewed day's totals are still loading (a new week hasn't landed
  // yet), show an indeterminate shimmer instead of a value so the bar never
  // flashes stale/zero numbers onto the freshly-selected day.
  loading?: boolean;
}) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;

  return (
    /* MACRO CELL */
    <div style={{ flex: "1 1 0", minWidth: 0 }}>
      {/* SYMBOL + CONSUMED / GOAL — single inline line. */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden" }}>
        {/* MACRO SYMBOL — flame icon (calories) or letter (P/F/C), in the macro hue. */}
        <span style={{ display: "inline-flex", alignItems: "center", color, fontSize: 11, fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>
          {symbol}
        </span>

        {/* CONSUMED / GOAL — the consumed figure is a dim placeholder while loading. */}
        <span style={{ fontSize: 11, color: C.text, overflow: "hidden", textOverflow: "ellipsis" }}>
          {loading ? <span style={{ color: C.textDim }}>–</span> : Math.round(value)}
          <span style={{ color: C.textDim }}>/{goal > 0 ? Math.round(goal) : "—"}</span>
        </span>
      </div>

      {/* TRACK + FILL */}
      <div style={{ position: "relative", width: "100%", height: 8, background: C.divider, borderRadius: 999, overflow: "hidden" }}>
        {loading ? (
          /* SHIMMER — indeterminate sweep in the macro hue while totals load. */
          <div className="fg-macrobar-shimmer" style={{ background: color }} />
        ) : (
          /* FILL — width transitions so the bar grows/shrinks smoothly when a log
             add/delete changes the current day's total. */
          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999, transition: "width 480ms cubic-bezier(0.22, 1, 0.36, 1)" }} />
        )}
      </div>
    </div>
  );
}
