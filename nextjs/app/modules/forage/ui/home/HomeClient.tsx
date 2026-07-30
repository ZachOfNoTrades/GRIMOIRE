"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Toaster } from "react-hot-toast";
import {
  ChevronRight,
  Flame,
  Settings2,
  Database,
  Scale,
  CalendarClock,
} from "lucide-react";
import { DailyTotals } from "../../types/entry";
import { MacroTarget } from "../../types/target";
import { WeightEntry } from "../../types/weight";
import { Nutrient, ResolvedNutrientTarget } from "../../types/food";
import { DEFAULT_NUTRITION_CARDS } from "../../types/dashboard";
import { resolveNutritionCard, ResolvedCard } from "./nutritionCards";
import { NutrientMeter, NutrientBand, bandDisplay, ProgramTargetMark } from "../nutrition/nutrientMeter";
import HelpButton from "@/components/ui/HelpButton";
import {
  todayIso,
  shiftDate,
  isoToDate,
  weekStartFor,
} from "../_diary";
import { useAppHeight } from "@/lib/useAppHeight";
import ForageBottomBar from "../ForageBottomBar";
import SegmentedToggle, { SegmentedOption } from "@/components/ui/SegmentedToggle";
import "./home.css";

/* ─── COLOR TOKENS ───
   Semantic aliases over the grimoire terminal-theme design tokens
   (globals.css :root). No hardcoded colors live here — every value
   resolves to a CSS custom property, so the dashboard tracks the app
   theme instead of a fixed MacroFactor palette. Used where a color has
   to reach inline style / SVG fill+stroke driven by data; static
   surfaces are styled with classes (home.css + the design system). */

const C = {
  // Surfaces
  bg: "var(--solid-background)",   // page base (matches body)
  card: "var(--card-bg)",          // card / cell base
  cardEl: "var(--hover-bg)",       // muted element on a card (track, empty habit cell)
  cardActive: "var(--hover-bg)",   // active week column cell
  cellTick: "var(--color-gray)",   // tick mark inside a cell
  divider: "var(--card-border)",
  border: "var(--card-border)",
  // Sticky bars
  barBg: "var(--solid-background)",
  searchPill: "var(--hover-bg)",   // search pill (reads against the page base)
  // Text
  text: "var(--color-primary)",
  textMuted: "var(--color-secondary)",
  textDim: "var(--color-gray)",
  textVeryDim: "var(--color-gray)",
  // Macro hues — shared chart tokens (globals.css --fg-*)
  kcal: "var(--fg-cal)",      // blue
  protein: "var(--fg-protein)", // orange
  fat: "var(--fg-fat)",       // purple
  carb: "var(--fg-carb)",     // green
  // Visual accents — mapped onto the macro tokens they belong to
  green: "var(--fg-carb)",
  greenSoft: "var(--fg-carb)",
  orange: "var(--fg-protein)",
  orangeDash: "var(--fg-protein)",
  purple: "var(--fg-fat)",
  yellowBrown: "var(--fg-fat)",
};

// Initial data is fetched server-side by the route's page.tsx and passed in so
// the first paint shows real macros instead of empty placeholders / a spinner.
// When absent (e.g. an API-key request that isn't a NextAuth session) the
// component falls back to its original client-side fetch on mount.
export default function ForageHomeClient({
  initialDate,
  initialTotals,
  initialTarget,
  initialWeekData,
  initialNutrients,
  initialNutrientBands,
  initialNutritionCardKeys,
  initialCheckInDue,
  initialCheckInWeekday,
}: {
  initialDate?: string;
  initialTotals?: DailyTotals | null;
  initialTarget?: MacroTarget | null;
  initialWeekData?: Record<string, DailyTotals>;
  initialNutrients?: Nutrient[];
  initialNutrientBands?: ResolvedNutrientTarget[];
  initialNutritionCardKeys?: string[];
  initialCheckInDue?: boolean;
  initialCheckInWeekday?: number;
} = {}) {
  const router = useRouter();

  // DATA
  const [totals, setTotals] = useState<DailyTotals>(initialTotals ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, micros: {} });
  const [target, setTarget] = useState<MacroTarget | null>(initialTarget ?? null);
  const [weekData, setWeekData] = useState<Record<string, DailyTotals>>(initialWeekData ?? {});
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());
  // Nutrient reference + resolved bands power the customizable Nutrition cards
  // (micronutrient cards need a label/unit/color and a target). Day-independent.
  const [nutrients, setNutrients] = useState<Nutrient[]>(initialNutrients ?? []);
  const [nutrientBands, setNutrientBands] = useState<ResolvedNutrientTarget[]>(initialNutrientBands ?? []);
  // Ordered card keys for the Nutrition section. SSR seeds the user's saved
  // layout (or the built-in default when they have no custom config); only
  // falls back to the default here when the preload was unavailable.
  const [nutritionCardKeys, setNutritionCardKeys] = useState<string[]>(initialNutritionCardKeys ?? DEFAULT_NUTRITION_CARDS);

  // INPUT
  const [date, setDate] = useState<string>(initialDate ?? todayIso());

  // STATE
  // Preloaded → not loading, so the dashboard renders seeded data on first paint.
  const [isLoading, setIsLoading] = useState(!initialTarget);
  const scrollRef = useRef<HTMLDivElement>(null);
  // True for the first [date] effect run when SSR already seeded this date's
  // data; skip the redundant refetch (and the placeholder flash it causes).
  const skipInitialFetch = useRef<boolean>(!!initialTarget);
  // True when SSR already seeded the day-independent Nutrition config (cards +
  // nutrients + resolved bands); skip the mount fetch so the section paints the
  // user's real layout without flashing the default.
  const skipInitialConfigFetch = useRef<boolean>(!!initialNutritionCardKeys);

  async function refresh() {
    setIsLoading(true);
    try {
      const [eRes, tRes] = await Promise.all([
        fetch(`/modules/forage/api/entries?date=${date}`),
        fetch(`/modules/forage/api/targets?date=${date}`),
      ]);
      const eData = await eRes.json();
      const tData = await tRes.json();
      setTotals(eData.totals ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, micros: {} });
      setTarget(tData ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchWeek(centerIso: string) {
    const start = weekStartFor(centerIso);
    const days = Array.from({ length: 7 }, (_, i) => shiftDate(start, i));
    try {
      const results = await Promise.all(
        days.map(async (d) => {
          const r = await fetch(`/modules/forage/api/entries?date=${d}`);
          const data = await r.json();
          return [d, data.totals ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, micros: {} }] as const;
        })
      );
      const map: Record<string, DailyTotals> = {};
      for (const [d, t] of results) map[d] = t;
      setWeekData(map);
    } catch {
      // non-critical
    }
  }

  async function fetchHistory() {
    const since = shiftDate(todayIso(), -29);
    try {
      const [wRes, aRes] = await Promise.all([
        fetch(`/modules/forage/api/weight?since=${since}`),
        fetch(`/modules/forage/api/entries/active-dates?since=${since}`),
      ]);
      if (wRes.ok) {
        const w = await wRes.json();
        setWeightHistory(Array.isArray(w) ? w : []);
      }
      if (aRes.ok) {
        const a = await aRes.json();
        setActiveDates(new Set(Array.isArray(a) ? a : []));
      }
    } catch {
      // non-critical
    }
  }

  useEffect(() => {
    // On the very first run after an SSR preload, the seeded state already holds
    // this date's totals/target/week, so skip the refetch. Later date changes
    // (skipInitialFetch already cleared) fetch normally.
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    refresh();
    fetchWeek(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    fetchHistory();
  }, []);

  // Nutrient reference, resolved target bands, and the saved Nutrition card
  // layout are all day-independent — fetch once on mount. Failures fall back to
  // the defaults already seeded in state (macros + sugars + sat fat).
  useEffect(() => {
    // SSR already seeded this config — don't refetch (and don't flash defaults).
    if (skipInitialConfigFetch.current) {
      skipInitialConfigFetch.current = false;
      return;
    }
    let alive = true;
    Promise.all([
      fetch("/modules/forage/api/nutrients").then((r) => r.json()),
      fetch("/modules/forage/api/nutrient-targets").then((r) => r.json()),
      fetch("/modules/forage/api/dashboard-cards?section=nutrition").then((r) => r.json()),
    ])
      .then(([nData, bData, cData]) => {
        if (!alive) return;
        if (Array.isArray(nData)) setNutrients(nData);
        if (Array.isArray(bData)) setNutrientBands(bData);
        if (Array.isArray(cData?.cards)) setNutritionCardKeys(cData.cards);
      })
      .catch((e) => console.error(e));
    return () => { alive = false; };
  }, []);

  // Pin the locked shell to the real visible viewport height (Firefox Android
  // paints a larger area than it reports, leaving a dead band below the tab bar
  // otherwise). See lib/useAppHeight for the full rationale.
  useAppHeight();

  return (
    /* PAGE — flex column with bottom bars in flow (not position:fixed) so they
       don't jitter on mobile when the address bar collapses/expands. Lock
       html/body to dvh and put the scroll on the inner region. */
    <div className="forage-home">

      {/* APP SHELL — phone-first column, capped + centered so the dashboard
         frames cleanly on desktop instead of stretching edge-to-edge; on a
         phone-width viewport it fills the screen exactly as before. */}
      <div className="forage-shell">

        {/* SCROLL + SEARCH WRAPPER — relative so the search bar overlays the
           bottom of the scroll area instead of sitting in flow. Keeping the bar
           out of flow is what fixes the bottom-of-page jitter: previously it was
           an in-flow slot whose height collapsed 70→0 when hidden, which grew the
           scroll region, clamped scrollTop, and fired a scroll event that flipped
           the bar back — an endless show/hide oscillation at the bottom. As an
           overlay its visibility no longer changes the scroll geometry. */}
        <div style={{ position: "relative", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>

        {/* SCROLL REGION — the only scrollable surface. The search pill + tab bar
           sit below it in flow (ForageBottomBar). */}
        <div ref={scrollRef} style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", scrollbarWidth: "none", paddingBottom: 8 }}>

        {/* HEADER */}
        <TopHeader date={date} />

        {/* CHECK-IN REMINDER — surfaces the coached strategy's weekly check-in on
           the daily-use dashboard (it otherwise only lives on the strategy page).
           Shown only when SSR found the check-in due today; tapping deep-links to
           strategy with ?checkin=1, which opens the check-in wizard directly. */}
        {initialCheckInDue && (
          <CheckInReminder
            weekday={initialCheckInWeekday}
            onOpen={() => router.push("/modules/forage/ui/strategy?checkin=1")}
          />
        )}

        {/* PAGE BODY — single column on mobile; on desktop .fg-sections flows
           the pager + sections into a two-column masonry to use the width. */}
        <div className="fg-sections" style={{ padding: "0 16px" }}>

          {/* WEEKLY NUTRITION PAGER */}
          <div className="fg-reveal" style={{ animationDelay: "0ms" }}>
            <WeeklyNutritionPager
              activeIso={date}
              weekData={weekData}
              target={target}
              totals={totals}
              onPick={setDate}
            />
          </div>

          {isLoading && !target ? (
            /* LOADING — only on the initial fetch (no target yet). Once loaded,
               sections stay mounted across day changes so the reveal plays once
               and a day-tap refresh updates data in place instead of flashing the
               spinner. */
            <div style={{ display: "flex", justifyContent: "center", padding: "2rem 0" }}>
              <div style={{ width: 24, height: 24, border: `2px solid ${C.divider}`, borderTopColor: C.text, borderRadius: 999, animation: "spin 0.8s linear infinite" }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            <>
              {/* INSIGHTS & ANALYTICS */}
              <div className="fg-reveal" style={{ animationDelay: "60ms" }}>
                <InsightsSection weekData={weekData} target={target} weightHistory={weightHistory} totals={totals} />
              </div>

              {/* HABITS */}
              <div className="fg-reveal" style={{ animationDelay: "120ms" }}>
                <HabitsSection weekData={weekData} weightHistory={weightHistory} activeDates={activeDates} />
              </div>

              {/* NUTRITION */}
              <div className="fg-reveal" style={{ animationDelay: "180ms" }}>
                <NutritionSection
                  totals={totals}
                  target={target}
                  nutrients={nutrients}
                  bands={nutrientBands}
                  cardKeys={nutritionCardKeys}
                  onSeeAll={() => router.push(`/modules/forage/ui/nutrition?date=${date}`)}
                />
              </div>

              {/* BODY METRICS */}
              <div className="fg-reveal" style={{ animationDelay: "240ms" }}>
                <BodyMetricsSection weightHistory={weightHistory} onSeeAll={() => router.push("/modules/forage/ui/strategy")} />
              </div>

              {/* GENERAL */}
              <div className="fg-reveal" style={{ animationDelay: "300ms" }}>
                <GeneralSection />
              </div>

              {/* MORE */}
              <div className="fg-reveal" style={{ animationDelay: "360ms" }}>
                <MoreSection onCustomize={() => router.push("/modules/forage/ui/dashboard-customize")} onNutritionData={() => router.push("/modules/forage/ui/settings")} />
              </div>
            </>
          )}
        </div>
      </div>

      </div>

      {/* BOTTOM BAR — search pill + tab bar + the full quick-add flow (Shortcuts
          sheet, add-entry, weigh-in). Shared across every forage screen, so the
          (+) behaves identically everywhere. onLogged/onWeighIn refresh in place. */}
      <ForageBottomBar
        active="dashboard"
        showSearch
        date={date}
        initialStrategyAlert={initialCheckInDue}
        onLogged={() => { refresh(); fetchWeek(date); }}
        onWeighIn={fetchHistory}
      />
      </div>

      {/* TOAST */}
      <Toaster position="top-center" />
    </div>
  );
}

/* ─── TOP HEADER ─── */

function TopHeader({ date }: { date: string }) {
  const d = new Date(date + "T12:00:00");
  const dow = d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const monthDay = d.toLocaleDateString("en-US", { month: "long", day: "numeric" }).toUpperCase();

  return (
    /* TOP HEADER */
    <div style={{ padding: "18px 16px 10px", textAlign: "left", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>

      {/* TITLE BLOCK */}
      <div>

        {/* DATE LINE */}
        <div style={{ fontSize: 10, letterSpacing: "0.08em", color: C.textMuted, fontWeight: 500 }}>
          {dow}, {monthDay}
        </div>

        {/* TITLE */}
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", color: C.text, marginTop: 2 }}>
          DASHBOARD
        </div>
      </div>

      {/* HELP */}
      <HelpButton
        title="Nutrition"
        sections={[
          { heading: "Logging food", body: "Add foods to the day's diary to track calories and nutrients. Recent and favorite foods speed up repeat entries; create a food once and reuse it." },
          { heading: "Targets & strategy", body: "Your active program sets floor / target / ceiling bands for each nutrient. Use the strategy check-in to review intake and adjust as your goals change." },
          { heading: "Nutrition detail", body: "Open the Nutrition page for per-nutrient bars and to set custom floor / target / ceiling overrides — overrides are scoped to the current program and carry forward to new ones." },
        ]}
      />
    </div>
  );
}

/* ─── CHECK-IN REMINDER ─── */

const WEEKDAY_LABELS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function CheckInReminder({ weekday, onOpen }: { weekday?: number; onOpen: () => void }) {
  const dayLabel = weekday ? WEEKDAY_LABELS[weekday] : "today";

  return (
    /* CHECK-IN REMINDER BANNER — full-width tappable card above the dashboard
       sections. Green accent matches the strategy page's "due" check-in ring. */
    <div className="fg-reveal" style={{ padding: "0 16px", marginBottom: 16 }}>

      {/* BANNER BUTTON */}
      <button type="button" onClick={onOpen} className="fg-checkin-banner">

        {/* ICON */}
        <span className="fg-checkin-icon">
          <CalendarClock size={20} />
        </span>

        {/* TEXT */}
        <span className="fg-checkin-text">

          {/* TITLE */}
          <span className="fg-checkin-title">Strategy check-in ready</span>

          {/* SUBTITLE */}
          <span className="fg-checkin-sub">It's your {dayLabel} check-in — tap to review your updated targets</span>
        </span>

        {/* CHEVRON */}
        <ChevronRight size={18} className="fg-checkin-chevron" />
      </button>
    </div>
  );
}

/* ─── WEEKLY NUTRITION PAGER ─── */

function WeeklyNutritionPager({
  activeIso,
  weekData,
  target,
  totals,
  onPick,
}: {
  activeIso: string;
  weekData: Record<string, DailyTotals>;
  target: MacroTarget | null;
  totals: DailyTotals;
  onPick: (iso: string) => void;
}) {
  const [page, setPage] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  function handleScroll() {
    if (!scrollerRef.current) return;
    const w = scrollerRef.current.clientWidth;
    if (w === 0) return;
    const p = Math.round(scrollerRef.current.scrollLeft / w);
    if (p !== page) setPage(p);
  }

  return (
    /* WEEKLY NUTRITION PAGER */
    <div style={{ marginBottom: 18 }}>

      {/* SECTION TITLE */}
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 10 }}>
        {page === 2 ? "Daily Nutrition" : page === 1 ? "Energy Balance" : "Weekly Nutrition"}
      </div>

      {/* HORIZONTAL SNAP SCROLLER */}
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        style={{
          display: "flex",
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          gap: 0,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >

        {/* PAGE 1 — WEEKLY BARS */}
        <div style={{ flex: "0 0 100%", scrollSnapAlign: "start" }}>
          <WeeklyBarsPage activeIso={activeIso} weekData={weekData} target={target} onPick={onPick} />
        </div>

        {/* PAGE 2 — ENERGY BALANCE */}
        <div style={{ flex: "0 0 100%", scrollSnapAlign: "start" }}>
          <EnergyBalancePage weekData={weekData} target={target} />
        </div>

        {/* PAGE 3 — DAILY NUTRITION DONUT */}
        <div style={{ flex: "0 0 100%", scrollSnapAlign: "start" }}>
          <DailyNutritionPage totals={totals} target={target} />
        </div>
      </div>

      {/* PAGE DOTS — clickable (desktop has no swipe); active dot elongates
         into a pill so the current page reads at a glance. */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 10 }}>
        {[0, 1, 2].map((i) => (
          <button
            key={i}
            type="button"
            aria-label={`Show panel ${i + 1}`}
            onClick={() => {
              const el = scrollerRef.current;
              if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
            }}
            className="r-999"
            style={{
              width: i === page ? 16 : 6,
              height: 6,
              padding: 0,
              border: "none",
              cursor: "pointer",
              background: i === page ? C.text : C.divider,
              transition: "width 220ms ease, background-color 220ms ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ── PAGE 1: WEEKLY BARS (4-row macro matrix + summary col) ── */

function WeeklyBarsPage({
  activeIso,
  weekData,
  target,
  onPick,
}: {
  activeIso: string;
  weekData: Record<string, DailyTotals>;
  target: MacroTarget | null;
  onPick: (iso: string) => void;
}) {
  // MF page 1 defaults to "Remaining" selected
  const [mode, setMode] = useState<"consumed" | "remaining">("remaining");
  const start = weekStartFor(activeIso);
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(start, i));
  const today = todayIso();
  // Derive day-letter from each actual date so labels can't drift from data
  const dowLetter = (iso: string) => isoToDate(iso).toLocaleDateString("en-US", { weekday: "narrow" });

  const activeTotals = weekData[activeIso] ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const macroVal = (consumed: number, tgt: number | undefined) =>
    mode === "consumed" ? Math.round(consumed) : Math.round(Math.max(0, (tgt ?? 0) - consumed));

  // Per-row scaling: cell fills 0..120% of target
  const rows = [
    { key: "kcal", color: C.kcal, target: target?.kcal ?? 1, get: (d: DailyTotals) => d.kcal ?? 0 },
    { key: "protein_g", color: C.protein, target: target?.protein_g ?? 1, get: (d: DailyTotals) => d.protein_g ?? 0 },
    { key: "fat_g", color: C.fat, target: target?.fat_g ?? 1, get: (d: DailyTotals) => d.fat_g ?? 0 },
    { key: "carbs_g", color: C.carb, target: target?.carbs_g ?? 1, get: (d: DailyTotals) => d.carbs_g ?? 0 },
  ];

  // Re-measured from real MF (~/mf-real/mf-real-2.png, S22 Ultra DPR 2.621):
  //   cell 58×95 phone = 22×36 CSS; col gap 110 phone center-to-center = 42 CSS;
  //   bar 14 phone solid = 5.3 CSS (anti-aliased to ~6 visible);
  //   cap 20 phone = 7.6 CSS solid wide × 6 phone = 2.3 CSS tall.
  //   Cap uses primary text color for active, dim gray for inactive (never macro color).
  //   Bar is RECTANGULAR (no border-radius); cap above it sits at fixed top
  //   position. Bar grows DOWNWARD from below the cap. Inactive cells always
  //   render the full-length bar (matches MF — they're decorative placeholders).
  //   Top of cap sits 13 phone (5 CSS) below cell top; usable bar area = 76
  //   phone (29 CSS) — i.e. cell_H - 5 (top pad) - ~2.5 (cap).
  const CELL_W = 22;
  const CELL_H = 36;
  const CELL_GAP = 20;
  const BAR_W = 6;
  const CAP_W = 9;
  const CAP_H = 3;
  const CAP_TOP = 5;            // distance from cell top to top of cap (~13 phone in MF)
  const BAR_TOP = CAP_TOP + CAP_H;   // bar's top edge flush with the cap pill's bottom edge (no overlap)
  const USABLE_H = CELL_H - BAR_TOP; // full bar runs from the cap's bottom down to the cell's bottom
  const FRAME_PAD_X = 6;        // horizontal inset between the active frame and the cell
  const FRAME_PAD_TOP = 7;
  const FRAME_PAD_BOTTOM = 5;
  const FRAME_BORDER = 1.25;
  const SLOT_GAP = 2;
  const CAP_COLOR_INACTIVE = "var(--color-gray)";
  const BAR_COLOR_INACTIVE = "var(--color-gray)";

  return (
    /* WEEKLY BARS PAGE */
    <div>

      {/* CHART + SUMMARY ROW — fluid: the matrix flexes to fill the row and the
         summary column sits at a fixed min-width on the right. The matrix used
         to be a fixed-pixel grid (~295px) which, with the 72px summary column,
         overflowed any viewport under ~390px (common phones, or an S22 with
         Android display-zoom) and pushed the kcal flame / macro letters
         off-screen. flex:1 + minmax(0,1fr) columns let it shrink to fit instead. */}
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>

        {/* 7-COLUMN MATRIX — each column wraps 4 cells + day-letter. Active
           column has visible white border + radius; inactive columns share the
           same padding+transparent border so columns stay pixel-aligned and
           the matrix doesn't shift when activeIso changes.
           Wrapped in a position:relative parent so we can overlay horizontal
           divider lines (1px card-border lines between each row, spanning
           the full matrix width). */}
        <div style={{ position: "relative", flex: "1 1 auto", minWidth: 0 }}>
          {[0, 1, 2].map((rowIdx) => (
            /* DIVIDER LINE — centered in each row gap, behind cells */
            <div
              key={rowIdx}
              style={{
                position: "absolute",
                top: FRAME_PAD_TOP + (rowIdx + 1) * CELL_H + rowIdx * CELL_GAP + CELL_GAP / 2,
                left: 0,
                right: 0,
                height: 1,
                background: "var(--card-border)",
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
          ))}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: SLOT_GAP, position: "relative", zIndex: 1 }}>
          {days.map((d) => {
            const isActive = d === activeIso;
            const isFuture = d > today;
            const totals = weekData[d] ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, micros: {} };
            return (
              /* COLUMN WRAPPER — frame around active day's cells + day letter */
              <button
                key={d}
                type="button"
                onClick={() => !isFuture && onPick(d)}
                disabled={isFuture}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: CELL_GAP,
                  padding: `${FRAME_PAD_TOP}px ${FRAME_PAD_X}px ${FRAME_PAD_BOTTOM}px`,
                  background: "transparent",
                  border: `${FRAME_BORDER}px solid ${isActive ? C.text : "transparent"}`,
                  borderRadius: 12,
                  cursor: isFuture ? "default" : "pointer",
                  textAlign: "center",
                  boxSizing: "border-box",
                  // Fill the fluid track and allow it to shrink below content
                  // min-width so the matrix never forces horizontal overflow.
                  width: "100%",
                  minWidth: 0,
                }}
                aria-label={`${d}`}
              >
                {rows.map((row) => {
                  const consumed = row.get(totals);
                  // Bar value reflects selected mode: Consumed shows what you
                  // ate; Remaining shows what's left of your target.
                  const remaining = Math.max(0, row.target - consumed);
                  const displayedVal = mode === "consumed" ? consumed : remaining;
                  // hasData (per-row): MF colors the bar for any day where
                  // this macro has nonzero consumption — including past days
                  // and the active day. Grey is only for "no data" placeholders.
                  const hasData = consumed > 0;
                  // "Placeholder" = inactive day with no data; renders as a
                  // full grey bar in Remaining mode (showing 100% remaining)
                  // and as no bar at all in Consumed mode (0 consumed).
                  const isPlaceholder = !isActive && !hasData;
                  const fillPct = Math.max(0, Math.min(1, row.target > 0 ? (displayedVal / row.target) : 0));
                  const barColor = isPlaceholder ? BAR_COLOR_INACTIVE : row.color;
                  const capColor = isActive ? C.text : CAP_COLOR_INACTIVE;
                  // Placeholder shows full bar in Remaining, nothing in Consumed.
                  // Real-data bars (active or past-with-data) scale to fillPct.
                  const barH = isPlaceholder
                    ? (mode === "remaining" ? USABLE_H : 0)
                    : USABLE_H * fillPct;

                  return (
                    /* CELL TRACK */
                    <div
                      key={row.key}
                      style={{
                        position: "relative",
                        // Fluid width capped at CELL_W: cells stay narrow on
                        // roomy viewports but shrink with the track on tight ones
                        // instead of forcing the row to overflow.
                        width: "100%",
                        maxWidth: CELL_W,
                        height: CELL_H,
                        // Near-page-tone track (--hover-bg) rather than the stark
                        // white --card-bg: on the light theme the white cells read
                        // as a row of test-tubes and the colored bar floats on a
                        // bright oval. A muted track lets the bar be the figure and
                        // the cell recede; the active column still reads via its
                        // frame + colored bar + dark cap.
                        background: C.cardEl,
                        borderRadius: 4,
                      }}
                    >
                      {/* TOP CAP — fixed at top of cell regardless of mode;
                         primary text (active) or dim gray (inactive); pill shape */}
                      <div style={{
                        position: "absolute",
                        top: CAP_TOP,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: CAP_W,
                        height: CAP_H,
                        background: capColor,
                        borderRadius: CAP_H / 2,
                      }} />

                      {/* BAR STEM — rectangular (no border-radius). Anchor
                         depends on mode: Remaining = top (just below cap, grows
                         down — visually connected to cap); Consumed = bottom
                         of cell (grows up — visually disconnected from cap). */}
                      {barH > 0 && (
                        <div style={{
                          position: "absolute",
                          left: "50%",
                          transform: "translateX(-50%)",
                          width: BAR_W,
                          height: barH,
                          background: barColor,
                          ...(mode === "remaining" ? { top: BAR_TOP } : { bottom: 0 }),
                        }} />
                      )}
                    </div>
                  );
                })}

                {/* DAY LABEL — bottom of column, inside the active frame */}
                <div style={{
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? C.text : C.textMuted,
                  lineHeight: 1,
                }}>
                  {dowLetter(d)}
                </div>
              </button>
            );
          })}
        </div>
        </div>

        {/* MACRO SUMMARY COLUMN — 4 rows aligned with chart rows. paddingTop
           = FRAME_PAD_TOP + FRAME_BORDER so numbers align with the top of the
           first cell inside the active frame (the matrix's outer button has
           internal padding that the summary column needs to compensate for). */}
        <div style={{
          // Fixed-min, no-shrink column pinned to the right; the fluid matrix to
          // its left yields width to keep this fully on-screen at any viewport.
          // minWidth (not a hard width) also lets a wide value — comma-grouped or
          // 5-digit kcal — grow the column (matrix shrinks to compensate) rather
          // than clipping the flame.
          minWidth: 72,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: CELL_GAP,
          paddingTop: FRAME_PAD_TOP + FRAME_BORDER,
        }}>
          {[
            { v: macroVal(activeTotals.kcal, target?.kcal), unit: <Flame size={16} fill={C.orange} style={{ color: C.orange, flexShrink: 0 }} />, of: target?.kcal },
            { v: macroVal(activeTotals.protein_g, target?.protein_g), unit: <span style={{ color: C.protein, fontWeight: 700, fontSize: 17 }}>P</span>, of: target?.protein_g },
            { v: macroVal(activeTotals.fat_g, target?.fat_g), unit: <span style={{ color: C.fat, fontWeight: 700, fontSize: 17 }}>F</span>, of: target?.fat_g },
            { v: macroVal(activeTotals.carbs_g, target?.carbs_g), unit: <span style={{ color: C.carb, fontWeight: 700, fontSize: 17 }}>C</span>, of: target?.carbs_g },
          ].map((r, i) => (
            <SummaryRow key={i} value={r.v} unit={r.unit} of={r.of} height={CELL_H} />
          ))}
        </div>
      </div>

      {/* MODE PILLS */}
      <SegmentedToggle options={NUTRITION_MODE_OPTIONS} value={mode} onChange={setMode} style={{ margin: "12px auto 0" }} />
    </div>
  );
}

function SummaryRow({ value, unit, of, height }: { value: number; unit: React.ReactNode; of: number | undefined; height: number }) {
  return (
    /* SUMMARY ROW */
    <div style={{ height, display: "flex", flexDirection: "column", justifyContent: "center" }}>

      {/* VALUE + UNIT — MF measured: "1" digit is ~14 CSS tall, implying ~20 CSS font-size.
         nowrap so the value + icon stay on one line and push the column wider
         rather than wrapping under each other when the number is large. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, lineHeight: 1, whiteSpace: "nowrap" }}>
        <span style={{ color: C.text, fontWeight: 700, fontSize: 20, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{value}</span>
        {unit}
      </div>

      {/* OF TARGET */}
      {of != null && (
        <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.2, marginTop: 3 }}>of {of}</div>
      )}
    </div>
  );
}

// Consumed / Remaining pills for the macro-summary cards. The switch itself is the
// app-wide SegmentedToggle now; this is just its option set (shared by both cards).
const NUTRITION_MODE_OPTIONS: SegmentedOption<"consumed" | "remaining">[] = [
  { value: "consumed", label: "Consumed" },
  { value: "remaining", label: "Remaining" },
];

/* ── PAGE 2: ENERGY BALANCE ── */

// A day counts toward weekly intake aggregates only if SOMETHING was logged that
// day. Skipped days (nothing logged) come through as all-zero totals and must be
// excluded — otherwise they drag the average intake down and inflate the deficit by
// a full target's worth per skipped day. Treat a day as logged if any macro is > 0.
function isDayLogged(t: DailyTotals | undefined): boolean {
  return !!t && (t.kcal > 0 || t.protein_g > 0 || t.carbs_g > 0 || t.fat_g > 0);
}

function EnergyBalancePage({ weekData, target }: { weekData: Record<string, DailyTotals>; target: MacroTarget | null }) {
  const [mode, setMode] = useState<"expenditure" | "targets">("targets");
  const dailyTarget = target?.kcal ?? 0;
  // Only the days actually logged feed the Nutrition − Targets balance, so skipped
  // days stay neutral instead of reading as a phantom full-target deficit.
  const loggedDays = Object.keys(weekData).filter((d) => isDayLogged(weekData[d]));
  const loggedCount = loggedDays.length;
  const weekTotalKcal = loggedDays.reduce((s, d) => s + (weekData[d]?.kcal ?? 0), 0);
  // Aggregate week-level
  const nutritionWeek = Math.round(weekTotalKcal);
  const targetWeek = dailyTarget * loggedCount;
  const difference = nutritionWeek - targetWeek;

  return (
    /* ENERGY BALANCE PAGE */
    <div>

      {/* DASHED LINE CHART — shorter box (was 90) so when intake sits well below
         the target-anchored scale the nutrition line doesn't strand a tall empty
         band above it. The target reference line gives the remaining headroom
         meaning (distance to target) instead of reading as dead space. */}
      <div style={{ height: 64, padding: "4px 0", display: "flex", alignItems: "flex-end" }}>
        <DashedLine values={Object.keys(weekData).sort().map((d) => weekData[d]?.kcal ?? 0)} target={dailyTarget} showTarget />
      </div>

      {/* LAST 30 DAYS LABEL */}
      <div style={{ display: "flex", justifyContent: "flex-end", color: C.textMuted, fontSize: 11, marginTop: 4 }}>Last 30 Days</div>

      {/* SUMMARY ROW */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "16px 0 6px", borderTop: `1px solid ${C.divider}`, marginTop: 8 }}>

        {/* NUTRITION */}
        <SumCell value={Math.abs(nutritionWeek).toLocaleString()} label="Nutrition" icon={<BarsIcon color={C.kcal} />} />

        {/* MINUS */}
        <div style={{ color: C.textMuted, fontSize: 22, fontWeight: 300 }}>−</div>

        {/* TARGETS */}
        <SumCell value={targetWeek.toLocaleString()} label="Targets" icon={<CheckIcon color={C.orange} />} />

        {/* EQUALS */}
        <div style={{ color: C.textMuted, fontSize: 22, fontWeight: 300 }}>=</div>

        {/* DIFFERENCE */}
        <SumCell value={(difference > 0 ? "+" : "") + difference.toLocaleString()} label="Difference" icon={null} />
      </div>

      {/* MODE PILLS */}
      <div style={{ display: "flex", justifyContent: "center", marginTop: 14, background: C.cardEl, borderRadius: 999, padding: 3, width: "fit-content", margin: "14px auto 0" }}>
        {(["expenditure", "targets"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className="r-999"
            style={{
              padding: "7px 22px",
              border: "none",
              background: mode === m ? C.text : "transparent",
              color: mode === m ? "var(--solid-background)" : C.textMuted,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {m === "expenditure" ? "Expenditure" : "Targets"}
          </button>
        ))}
      </div>
    </div>
  );
}

function SumCell({ value, label, icon }: { value: string; label: string; icon: React.ReactNode }) {
  return (
    /* SUM CELL */
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>

      {/* VALUE */}
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{value}</div>

      {/* ICON + LABEL */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, color: C.textMuted, fontSize: 11 }}>
        {icon}
        <span>{label}</span>
      </div>
    </div>
  );
}

function BarsIcon({ color }: { color: string }) {
  return (
    /* BARS ICON */
    <svg width="11" height="11" viewBox="0 0 11 11">
      <rect x="0" y="6" width="2.5" height="5" fill={color} />
      <rect x="3" y="2" width="2.5" height="9" fill={color} />
      <rect x="6" y="0" width="2.5" height="11" fill={color} />
      <rect x="9" y="4" width="2" height="7" fill={color} />
    </svg>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    /* CHECK ICON */
    <svg width="11" height="11" viewBox="0 0 11 11">
      <path d="M2 6 L4.5 8.5 L9 3" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DashedLine({ values, target, showTarget = false }: { values: number[]; target: number; showTarget?: boolean }) {
  if (values.length === 0) {
    return <svg width="100%" height="100%" viewBox="0 0 100 80" preserveAspectRatio="none" />;
  }
  const W = 100;
  const H = 80;
  const min = Math.min(...values, target * 0.7);
  const max = Math.max(...values, target * 1.1, 1);
  const range = max - min || 1;
  const yFor = (v: number) => H - 6 - ((v - min) / range) * (H - 12);
  const stepX = values.length > 1 ? W / (values.length - 1) : 0;
  const pts = values.map((v, i) => [i * stepX, yFor(v)] as const);
  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const targetY = yFor(target);
  return (
    /* DASHED LINE SVG */
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">

      {/* TARGET REFERENCE — faint full-width line at the daily target, so the gap
         to the intake trend reads as "headroom" rather than empty chart. */}
      {showTarget && target > 0 && (
        <line x1="0" y1={targetY.toFixed(2)} x2={W} y2={targetY.toFixed(2)} stroke={C.divider} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}

      {/* INTAKE TREND */}
      <path d={path} fill="none" stroke={C.orangeDash} strokeWidth={1.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

/* ── PAGE 3: DAILY NUTRITION DONUT ── */

function DailyNutritionPage({ totals, target }: { totals: DailyTotals; target: MacroTarget | null }) {
  const [mode, setMode] = useState<"consumed" | "remaining">("consumed");
  const tgt = target?.kcal ?? 0;
  const consumed = Math.round(totals.kcal);
  const remaining = Math.max(0, tgt - consumed);
  const center = mode === "consumed" ? consumed : remaining;
  const centerLabel = mode === "consumed" ? "Consumed" : "Remaining";

  // Half-circle progress (180° arc)
  const pct = tgt > 0 ? Math.min(1, consumed / tgt) : 0;

  return (
    /* DAILY NUTRITION PAGE */
    <div>

      {/* GAUGE — numbers row on top (1562 / 689 / 2251 + labels), smile arc
         beneath the center column. */}
      <div style={{ padding: "8px 0 0" }}>

        {/* NUMBERS ROW */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "start", columnGap: 4 }}>

          {/* LEFT NUMBER */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{remaining}</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Remaining</div>
          </div>

          {/* CENTER NUMBER — larger; "Consumed" label sits at the same y as
             "Remaining" / "Target" labels */}
          <div style={{ width: 220, textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{center}</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>{centerLabel}</div>
          </div>

          {/* RIGHT NUMBER */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{tgt}</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Target</div>
          </div>
        </div>

        {/* SMILE ARC — anchored under the center column. The arc's stroke
           overflows ~56px above its own box (overflow:visible + the shallow
           wide geometry), so a 6px gap let the curve cut straight through the
           36px center number. Measured the collision at 26px; 38px top clearance
           drops the arc's visible crown just below the number's baseline. */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 38 }}>
          <HalfDonut pct={pct} />
        </div>
      </div>

      {/* MACRO BREAKDOWN */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderTop: `1px solid ${C.divider}`, marginTop: 20, paddingTop: 14, columnGap: 8 }}>
        <MacroBreakRow label="Protein" value={totals.protein_g} target={target?.protein_g ?? 0} color={C.protein} />
        <MacroBreakRow label="Fat" value={totals.fat_g} target={target?.fat_g ?? 0} color={C.fat} />
        <MacroBreakRow label="Carbs" value={totals.carbs_g} target={target?.carbs_g ?? 0} color={C.carb} />
      </div>

      {/* MODE PILLS */}
      <SegmentedToggle options={NUTRITION_MODE_OPTIONS} value={mode} onChange={setMode} style={{ margin: "12px auto 0" }} />
    </div>
  );
}

function HalfDonut({ pct }: { pct: number }) {
  // Shallow smile arc — parameterized by chord width and sagitta (depth)
  // rather than by radius, because we want the arc to be MUCH WIDER than
  // it is tall (MF's gauge is closer to 5:1 width:depth, not the 2:1 you'd
  // get from a half-circle).
  const W = 280;            // arc chord width (full SVG width)
  const DEPTH = 60;          // sagitta — how far the apex dips below the chord
  const STROKE_PAD = 4;      // top inset to leave room for the round line caps
  const H = DEPTH + STROKE_PAD + 4; // SVG height
  const cx = W / 2;
  const chordY = STROKE_PAD;
  // Solve circle geometry: chord_half² + (R - DEPTH)² = R²  ->  R = (cw² + d²) / (2d)
  const halfChord = W / 2;
  const R = (halfChord * halfChord + DEPTH * DEPTH) / (2 * DEPTH);
  const cyCenter = chordY - (R - DEPTH); // circle center is ABOVE the chord by (R - depth)
  // Left endpoint angle (math): vector from center to (0, chordY)
  // = (-halfChord, chordY - cyCenter) = (-halfChord, R - depth + depth) = (-halfChord, R - 0)? wait re-derive
  // Vector from cyCenter to endpoint: (0 - cx, chordY - cyCenter) = (-halfChord, R - depth)
  // Magnitude = R, so this is a unit-circle direction scaled by R.
  // Angle (math, with y-down so sin flips sign convention but atan2 handles it):
  const startA = Math.atan2(chordY - cyCenter, 0 - cx);          // left endpoint
  const endRightA = Math.atan2(chordY - cyCenter, W - cx);        // right endpoint
  const sweep = startA - endRightA;                                // total angular extent (positive)
  const endA = startA - sweep * pct;
  const TRACK = "var(--card-border)";

  function arcPath(a0: number, a1: number) {
    const x0 = cx + R * Math.cos(a0);
    const y0 = cyCenter + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1);
    const y1 = cyCenter + R * Math.sin(a1);
    // Round to 3dp: Math.sin/cos can differ in the last ULP between the server
    // (Node V8) and client (Chromium V8) libm, which otherwise surfaces as a
    // hydration mismatch on the serialized path string.
    const f = (n: number) => n.toFixed(3);
    return `M${f(x0)},${f(y0)} A${f(R)},${f(R)} 0 0 1 ${f(x1)},${f(y1)}`;
  }

  return (
    /* SMILE ARC */
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>

      {/* TRACK */}
      <path d={arcPath(startA, endRightA)} stroke={TRACK} strokeWidth={4} fill="none" strokeLinecap="round" />

      {/* PROGRESS */}
      {pct > 0 && (
        <path d={arcPath(startA, endA)} stroke={C.kcal} strokeWidth={4} fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}

function MacroBreakRow({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return (
    /* MACRO BREAK ROW */
    <div style={{ textAlign: "center" }}>

      {/* LABEL */}
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>{label}</div>

      {/* VALUE */}
      <div style={{ fontSize: 13, color: C.text, fontVariantNumeric: "tabular-nums" }}>
        {Math.round(value)} / {Math.round(target)}<span style={{ color: C.textMuted }}>g</span>
      </div>

      {/* BAR */}
      <div style={{ height: 3, background: C.divider, borderRadius: 999, marginTop: 6, overflow: "hidden" }}>
        <div style={{ width: `${target > 0 ? Math.min(100, (value / target) * 100) : 0}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

/* ─── INSIGHTS & ANALYTICS ─── */

function InsightsSection({
  weekData,
  target,
  weightHistory,
  totals,
}: {
  weekData: Record<string, DailyTotals>;
  target: MacroTarget | null;
  weightHistory: WeightEntry[];
  totals: DailyTotals;
}) {
  const weekDays = Object.keys(weekData).sort();
  const weekVals = weekDays.map((d) => weekData[d]?.kcal ?? 0);
  const last7Weights = [...weightHistory].sort((a, b) => a.log_date.localeCompare(b.log_date)).slice(-7);
  const lastWeight = last7Weights[last7Weights.length - 1];

  // Only days with something logged count toward the average / energy balance —
  // skipped days are excluded so they don't skew the figures (see isDayLogged).
  const loggedDays = weekDays.filter((d) => isDayLogged(weekData[d]));
  const loggedCount = loggedDays.length;
  const loggedKcalTotal = loggedDays.reduce((s, d) => s + (weekData[d]?.kcal ?? 0), 0);
  const loggedLabel = `${loggedCount}/7 days logged`;

  // Average daily intake across ONLY the days actually logged (not a flat / 7).
  const avgKcal = loggedCount > 0 ? Math.round(loggedKcalTotal / loggedCount) : null;
  // Energy balance compares logged intake against the target for those same logged
  // days only, so skipped days stay neutral rather than reading as a phantom deficit.
  const energyDiff = loggedCount > 0 && target ? loggedKcalTotal - target.kcal * loggedCount : null; // negative = deficit

  // Goal progress placeholder — needs goal data; for now show kcal toward today's target as %
  const goalPct = target?.kcal ? Math.min(100, Math.round((totals.kcal / target.kcal) * 100)) : 0;

  return (
    /* INSIGHTS & ANALYTICS */
    <div style={{ marginBottom: 18 }}>

      {/* SECTION HEADER */}
      <div style={{ paddingTop: 2, marginBottom: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Insights & Analytics</div>
      </div>

      {/* 2×2 CARD GRID — gridAutoRows:1fr keeps all four cards the same height
         even when one card's value text wraps (e.g. "kcal deficit") at narrow
         widths, so the rows never look mismatched. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridAutoRows: "1fr", gap: 10 }}>

        {/* EXPENDITURE */}
        <InsightCard title="Expenditure" subtitle={loggedLabel} value={avgKcal != null ? avgKcal.toLocaleString() : "—"} valueUnit={avgKcal != null ? "kcal" : ""}>
          <SquareLine values={weekVals} color={C.orange} />
        </InsightCard>

        {/* WEIGHT TREND */}
        <InsightCard title="Weight Trend" subtitle="Last 7 Days" value={lastWeight ? lastWeight.weight_lb.toFixed(1) : "—"} valueUnit={lastWeight ? "lbs" : ""}>
          <DotLine values={last7Weights.map((w) => w.weight_lb)} color={C.purple} />
        </InsightCard>

        {/* ENERGY BALANCE */}
        <InsightCard title="Energy Balance" subtitle={loggedLabel} value={energyDiff != null ? Math.abs(Math.round(energyDiff)).toLocaleString() : "—"} valueUnit={energyDiff != null ? (energyDiff < 0 ? "kcal deficit" : "kcal surplus") : ""}>
          <DashedTrend values={weekVals} />
        </InsightCard>

        {/* GOAL PROGRESS */}
        <InsightCard title="Goal Progress" subtitle="Last 3 Days" value={`${goalPct}`} valueUnit="%">
          <ProgressBar pct={goalPct} color={C.green} />
        </InsightCard>
      </div>
    </div>
  );
}

function InsightCard({
  title,
  subtitle,
  value,
  valueUnit,
  children,
}: {
  title: string;
  subtitle: string;
  value: string;
  valueUnit: string;
  children: React.ReactNode;
}) {
  return (
    /* INSIGHT CARD — MF-measured 183.5×163.7 CSS, so this card targets
       163.7 CSS tall; with the chart growing to fill, the values below sit
       at a consistent baseline. */
    <div className="fg-tile" style={{ borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 4, minHeight: 164 }}>

      {/* TITLE */}
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</div>

      {/* SUBTITLE */}
      <div style={{ fontSize: 11, color: C.textMuted, marginTop: -1 }}>{subtitle}</div>

      {/* VISUAL — flex:1 so it fills the remaining card height up to the
         value-row at the bottom; matches MF's card layout */}
      <div style={{ flex: 1, marginTop: 8, minHeight: 50 }}>{children}</div>

      {/* VALUE + CHEVRON */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
          {value}
          {valueUnit && <span style={{ fontSize: 10, fontWeight: 400, color: C.textMuted, marginLeft: 4 }}>{valueUnit}</span>}
        </span>
        <ChevronRight size={14} style={{ color: C.textDim }} />
      </div>
    </div>
  );
}

function SquareLine({ values, color }: { values: number[]; color: string }) {
  // Expenditure card: line graph (SVG) + square nodes (HTML divs so they stay square)
  if (values.length === 0) return <EmptyViz />;
  const PAD_PCT = 6;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => ({
    xPct: values.length > 1 ? PAD_PCT + (i / (values.length - 1)) * (100 - PAD_PCT * 2) : 50,
    yPct: PAD_PCT + (1 - (v - min) / range) * (100 - PAD_PCT * 2),
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.xPct.toFixed(2)},${p.yPct.toFixed(2)}`).join(" ");
  return (
    /* SQUARE LINE — line in SVG, square nodes overlaid as HTML so they aren't stretched */
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
        <path d={path} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {pts.map((p, i) => (
        /* SQUARE NODE */
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${p.xPct}%`,
            top: `${p.yPct}%`,
            width: 5,
            height: 5,
            background: color,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
}

function DotLine({ values, color }: { values: number[]; color: string }) {
  // Weight Trend / Body Metrics: line graph (SVG) + circle nodes (HTML so they stay round)
  if (values.length === 0) return <EmptyViz />;
  const PAD_PCT = 6;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => ({
    xPct: values.length > 1 ? PAD_PCT + (i / (values.length - 1)) * (100 - PAD_PCT * 2) : 50,
    yPct: PAD_PCT + (1 - (v - min) / range) * (100 - PAD_PCT * 2),
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.xPct.toFixed(2)},${p.yPct.toFixed(2)}`).join(" ");
  return (
    /* DOT LINE — line in SVG, circle nodes overlaid as HTML so they stay round */
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
        <path d={path} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {pts.map((p, i) => (
        /* CIRCLE NODE */
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${p.xPct}%`,
            top: `${p.yPct}%`,
            width: 6,
            height: 6,
            background: C.card,
            border: `1.4px solid ${color}`,
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            boxSizing: "border-box",
          }}
        />
      ))}
    </div>
  );
}

function DashedTrend({ values }: { values: number[] }) {
  if (values.length === 0) return <EmptyViz />;
  const W = 100;
  const H = 100;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? W / (values.length - 1) : 0;
  const pts = values.map((v, i) => [i * stepX, H - 10 - ((v - min) / range) * (H - 20)] as const);
  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  return (
    /* DASHED TREND — svg absolutely positioned (like SquareLine/DotLine) so it
       fills the card's flexible visual area WITHOUT contributing intrinsic
       height; a bare height:100% svg here was inflating the insight-card row
       (Energy Balance / Goal Progress rendered ~2x taller than the top row). */
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
        <path d={path} fill="none" stroke={C.orangeDash} strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    /* PROGRESS BAR */
    <div style={{ height: "100%", display: "flex", alignItems: "center" }}>
      <div style={{ width: "100%", height: 8, background: C.divider, borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

function EmptyViz() {
  return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.textVeryDim, fontSize: 11 }}>—</div>;
}

/* ─── HABITS ─── */

function HabitsSection({
  weekData,
  weightHistory,
  activeDates,
}: {
  weekData: Record<string, DailyTotals>;
  weightHistory: WeightEntry[];
  activeDates: Set<string>;
}) {
  const today = todayIso();
  const weighInDates = new Set(weightHistory.map((w) => w.log_date));
  const weekStart = weekStartFor(today);
  const weekDays = Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i));
  const weighInsThisWeek = weekDays.filter((d) => weighInDates.has(d)).length;
  const foodLogsThisWeek = weekDays.filter((d) => (weekData[d]?.kcal ?? 0) > 0).length;
  const grid = Array.from({ length: 30 }, (_, i) => shiftDate(today, -(29 - i)));

  return (
    /* HABITS */
    <div style={{ marginBottom: 18 }}>

      {/* SECTION HEADER */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Habits</div>
      </div>

      {/* 2-CARD GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <HabitCard title="Weigh-In" hitDates={weighInDates} grid={grid} thisWeek={weighInsThisWeek} />
        <HabitCard title="Food Logging" hitDates={activeDates} grid={grid} thisWeek={foodLogsThisWeek} />
      </div>
    </div>
  );
}

function HabitCard({
  title,
  hitDates,
  grid,
  thisWeek,
}: {
  title: string;
  hitDates: Set<string>;
  grid: string[];
  thisWeek: number;
}) {
  return (
    /* HABIT CARD */
    <div className="fg-tile" style={{ borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", gap: 2 }}>

      {/* TITLE */}
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{title}</div>

      {/* SUBTITLE */}
      <div style={{ fontSize: 9, color: C.textMuted }}>Last 30 Days</div>

      {/* MINI 5×6 GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gridAutoRows: 11, gap: 2, marginTop: 4 }}>
        {grid.map((d) => {
          const hit = hitDates.has(d);
          return (
            <div
              key={d}
              title={d}
              style={{
                background: hit ? C.text : C.cardEl,
                borderRadius: 2,
                opacity: hit ? 0.85 : 1,
              }}
            />
          );
        })}
      </div>

      {/* VALUE ROW */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
          {thisWeek}/7<span style={{ fontSize: 9, fontWeight: 400, color: C.textMuted, marginLeft: 3 }}>this week</span>
        </span>
        <ChevronRight size={12} style={{ color: C.textDim }} />
      </div>
    </div>
  );
}

/* ─── NUTRITION ─── */

function NutritionSection({
  totals,
  target,
  nutrients,
  bands,
  cardKeys,
  onSeeAll,
}: {
  totals: DailyTotals;
  target: MacroTarget | null;
  nutrients: Nutrient[];
  bands: ResolvedNutrientTarget[];
  cardKeys: string[];
  onSeeAll: () => void;
}) {
  const router = useRouter();
  // Real nutrient codes (micros) drill into the per-nutrient target editor;
  // synthetic macro cards (kcal/protein/carbs/fat) aren't in `nutrients` and
  // stay non-navigable (macros use the separate macro-goal editor).
  const navCodes = new Set(nutrients.map((n) => n.code));

  if (!target) {
    return (
      /* NO TARGETS PROMPT */
      <div className="fg-tile" style={{ borderRadius: 14, padding: 14, marginBottom: 18 }}>
        <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>No targets set</div>
        <div style={{ color: C.textMuted, fontSize: 13 }}>Set your daily targets to unlock the full dashboard.</div>
      </div>
    );
  }

  // Resolve each configured key into a renderable card. Keys that can't resolve
  // yet (a nutrient card before the reference list loads, or a stale code) drop
  // out — the grid fills in as data arrives.
  const cards = cardKeys
    .map((key) => resolveNutritionCard(key, { totals, target, nutrients, bands }))
    .filter((c): c is ResolvedCard => c !== null);

  return (
    /* NUTRITION */
    <div style={{ marginBottom: 18 }}>

      {/* SECTION HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Nutrition</div>
        <button onClick={onSeeAll} type="button" style={{ background: "none", border: "none", color: C.text, fontWeight: 600, fontSize: 12, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>See All</button>
      </div>

      {cards.length === 0 ? (
        /* EMPTY — no cards configured */
        <div className="fg-tile" style={{ borderRadius: 12, padding: 14 }}>
          <div style={{ color: C.textMuted, fontSize: 13 }}>No nutrition cards. Add some from “Customize Dashboard”.</div>
        </div>
      ) : (
        /* MACRO TILE GRID — driven by the user's saved card layout */
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {cards.map((card) => (
            <MacroTile
              key={card.key}
              label={card.label}
              subtitle={card.subtitle}
              value={card.value}
              unit={card.unit}
              barColor={card.color}
              floor={card.floor}
              target={card.target}
              ceiling={card.ceiling}
              isCustom={card.isCustom}
              onClick={navCodes.has(card.key) ? () => router.push(`/modules/forage/ui/nutrition/${encodeURIComponent(card.key)}`) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MacroTile({
  label,
  subtitle,
  value,
  unit,
  barColor,
  floor,
  target,
  ceiling,
  isCustom,
  onClick,
}: {
  label: string;
  subtitle: string;
  value: number;
  unit: string;
  barColor: string;
  floor: number | null;
  target: number | null;
  ceiling: number | null;
  isCustom: boolean;
  onClick?: () => void;
}) {
  // Same band grammar as the Nutrition page: a floor/target/ceiling band drives
  // the shared meter (goal caret + range band + limit ticks) and a state-colored
  // percent (red over a ceiling, amber under a floor, green in band).
  const band: NutrientBand = { value, floor, target, ceiling };
  const d = bandDisplay(band, unit);
  return (
    /* MACRO TILE — drills into the per-nutrient target editor when navigable */
    <div
      className="fg-tile"
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={{ borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", gap: 2, cursor: onClick ? "pointer" : undefined }}
    >

      {/* LABEL ROW — name (with program-target bullseye) + state-colored percent */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>

        {/* NAME + PROGRAM-TARGET GLYPH — bullseye flags a program-override band */}
        <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          {isCustom && <ProgramTargetMark />}
        </span>

        {/* PERCENT — only when there's a band to measure against */}
        {d.showBar && <span style={{ fontSize: 11, fontWeight: 700, color: d.pctColor, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{d.pctText}</span>}
      </div>

      {/* SUBTITLE */}
      <div style={{ fontSize: 9, color: C.textMuted }}>{subtitle}</div>

      {/* METER — shared floor/target/ceiling bar; falls back to a flat track when
          the card has no band yet (no target set / reference still loading) */}
      {d.showBar ? (
        <div style={{ marginTop: 4 }}><NutrientMeter band={band} fillColor={barColor} /></div>
      ) : (
        <div style={{ height: 5, background: C.cardEl, borderRadius: 999, marginTop: 12 }} />
      )}

      {/* DIVIDER */}
      <div style={{ borderTop: `1px solid ${C.divider}`, marginTop: 6, paddingTop: 4 }}>

        {/* VALUE ROW — consumed value + the band text (/ target or floor–ceiling) */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
            {value}<span style={{ fontSize: 10, fontWeight: 400, color: C.textMuted, marginLeft: 3 }}>{d.targetText.trim()}</span>
          </span>
          <ChevronRight size={12} style={{ color: C.textDim }} />
        </div>
      </div>
    </div>
  );
}

/* ─── BODY METRICS ─── */

function BodyMetricsSection({ weightHistory, onSeeAll }: { weightHistory: WeightEntry[]; onSeeAll: () => void }) {
  const sorted = [...weightHistory].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const last7 = sorted.slice(-7);
  const lastWeight = last7[last7.length - 1] ?? null;
  const last7BF = last7.filter((w) => w.body_fat_pct != null);
  const lastBF = last7BF[last7BF.length - 1] ?? null;

  return (
    /* BODY METRICS */
    <div style={{ marginBottom: 18 }}>

      {/* SECTION HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Body Metrics</div>
        <button onClick={onSeeAll} type="button" style={{ background: "none", border: "none", color: C.text, fontWeight: 600, fontSize: 12, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}>See All</button>
      </div>

      {/* 2-CARD GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <BodyMetricCard title="Scale Weight" values={last7.map((w) => w.weight_lb)} value={lastWeight ? lastWeight.weight_lb.toFixed(1) : "—"} unit="lbs" />
        <BodyMetricCard title="Visual Body Fat" values={last7BF.map((w) => w.body_fat_pct ?? 0)} value={lastBF?.body_fat_pct != null ? lastBF.body_fat_pct.toFixed(1) : "—"} unit="%" />
      </div>
    </div>
  );
}

function BodyMetricCard({
  title,
  values,
  value,
  unit,
}: {
  title: string;
  values: number[];
  value: string;
  unit: string;
}) {
  return (
    /* BODY METRIC CARD */
    <div className="fg-tile" style={{ borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", gap: 2 }}>

      {/* TITLE */}
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{title}</div>

      {/* SUBTITLE */}
      <div style={{ fontSize: 9, color: C.textMuted }}>Last 7 Entries</div>

      {/* SPARKLINE */}
      <div style={{ height: 38, marginTop: 6 }}>
        <DotLine values={values} color={C.green} />
      </div>

      {/* DIVIDER + VALUE */}
      <div style={{ borderTop: `1px solid ${C.divider}`, marginTop: 4, paddingTop: 4, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
          {value}<span style={{ fontSize: 10, fontWeight: 400, color: C.textMuted, marginLeft: 3 }}>{unit}</span>
        </span>
        <ChevronRight size={12} style={{ color: C.textDim }} />
      </div>
    </div>
  );
}

/* ─── GENERAL (Steps placeholder) ─── */

function GeneralSection() {
  // Stubbed Steps card — no data source yet
  const bars = [0.55, 0.7, 0.62, 0.78, 0.65, 0.5, 0.42];
  return (
    /* GENERAL */
    <div style={{ marginBottom: 18 }}>

      {/* SECTION HEADER */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>General</div>
      </div>

      {/* SINGLE CARD ROW (matches MF layout — one card in left column) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>

        {/* STEPS CARD */}
        <div className="fg-tile" style={{ borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", gap: 2 }}>

          {/* TITLE */}
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Steps</div>

          {/* SUBTITLE */}
          <div style={{ fontSize: 9, color: C.textMuted }}>Last 7 Days</div>

          {/* BAR CHART — narrow vertical bars with rounded tops */}
          <div style={{ height: 38, marginTop: 6, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 5, padding: "0 2px" }}>
            {bars.map((h, i) => (
              <div
                key={i}
                style={{
                  width: 6,
                  height: `${h * 100}%`,
                  background: C.protein,
                  borderRadius: "2px 2px 0 0",
                  opacity: 0.85,
                }}
              />
            ))}
          </div>

          {/* DIVIDER + VALUE */}
          <div style={{ borderTop: `1px solid ${C.divider}`, marginTop: 4, paddingTop: 4, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>
              —<span style={{ fontSize: 10, fontWeight: 400, color: C.textMuted, marginLeft: 3 }}>steps</span>
            </span>
            <ChevronRight size={12} style={{ color: C.textDim }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── MORE ─── */

function MoreSection({ onCustomize, onNutritionData }: { onCustomize: () => void; onNutritionData: () => void }) {
  return (
    /* MORE */
    <div style={{ marginBottom: 18 }}>

      {/* SECTION HEADER */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>More</div>
      </div>

      {/* GROUPED ROWS */}
      <div className="fg-tile" style={{ borderRadius: 14, overflow: "hidden" }}>
        <MoreRow icon={<Settings2 size={20} style={{ color: C.text }} />} label="Customize Dashboard" onClick={onCustomize} />
        <div style={{ height: 1, background: C.divider, marginLeft: 52 }} />
        <MoreRow icon={<Database size={20} style={{ color: C.text }} />} label="Nutrition Data Manager" onClick={onNutritionData} />
      </div>
    </div>
  );
}

function MoreRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    /* MORE ROW */
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        background: "transparent",
        border: "none",
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        cursor: "pointer",
        color: C.text,
      }}
    >
      <div style={{ width: 22, display: "flex", justifyContent: "center" }}>{icon}</div>
      <span style={{ flex: 1, textAlign: "left", fontSize: 15, fontWeight: 500 }}>{label}</span>
      <ChevronRight size={16} style={{ color: C.textDim }} />
    </button>
  );
}
