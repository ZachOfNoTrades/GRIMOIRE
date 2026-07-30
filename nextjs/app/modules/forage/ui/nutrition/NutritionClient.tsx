"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Toaster } from "react-hot-toast";
import { DailyTotals } from "../../types/entry";
import { MacroTarget } from "../../types/target";
import { Nutrient, ResolvedNutrientTarget } from "../../types/food";
import { todayIso } from "../_diary";
import { FAT_BREAKDOWN_CODES, CARB_BREAKDOWN_CODES, PROTEIN_BREAKDOWN_CODES } from "../../utils/nutrientGroups";
import { sectionColor, byNutrientOrder } from "../../utils/nutrientLedger";
import { NutritionRange, getNutritionRangeParams } from "../../utils/dateRange";
import { NutrientMeter, bandDisplay, fmtNutrient, ProgramTargetMark } from "./nutrientMeter";
import NutritionRangeSelector from "./NutritionRangeSelector";
import { useAppHeight } from "@/lib/useAppHeight";
import ForageBottomBar from "../ForageBottomBar";
import "../home/home.css";
import "./nutrition.css";

/* ─── COLOR TOKENS ───
   Same semantic aliases the dashboard uses (HomeClient C object) so this
   drill-down of the Nutrition section tracks the app theme. No hardcoded
   colors — every value resolves to a CSS custom property. */
const C = {
  card: "var(--card-bg)",
  cardEl: "var(--hover-bg)",
  divider: "var(--card-border)",
  text: "var(--color-primary)",
  textMuted: "var(--color-secondary)",
  textDim: "var(--color-gray)",
  kcal: "var(--fg-cal)",        // blue
  protein: "var(--fg-protein)", // orange
  fat: "var(--fg-fat)",         // purple
  carb: "var(--fg-carb)",       // green
  good: "var(--fg-carb)",       // green — at/above floor, within band, met target
  amber: "var(--alert-yellow-text)", // under a floor (deficient)
  danger: "var(--alert-red-text)",   // over a ceiling (excess)
};

// Per-section accent for the (thin) consumption fill comes from the ledger's
// SECTION_COLORS (single source of truth, shared with the food-detail breakdown
// in _diary). The range band, ticks, and track stay neutral.

interface NutrientRow {
  key: string;
  name: string;
  unit: string;
  value: number;          // consumed for the day
  color: string | null;   // per-row fill override (macros); null → use section color
  // Effective target band — each optional (null = no marker).
  floor: number | null;
  target: number | null;
  ceiling: number | null;
}

// Shared band shape for the meter/display helpers.
const rowBand = (row: NutrientRow) => ({ value: row.value, floor: row.floor, target: row.target, ceiling: row.ceiling });

const fmt = fmtNutrient;

export default function NutritionClient({ initialDate }: { initialDate: string }) {
  const router = useRouter();

  // Firefox-Android viewport-height fix (shared across forage screens).
  useAppHeight();

  // DATA
  // In single-day ("today") mode `totals` is the viewed day's totals; in a
  // multi-day range it's the per-logged-day AVERAGE (see /api/nutrition-summary).
  const [totals, setTotals] = useState<DailyTotals>({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, micros: {} });
  const [target, setTarget] = useState<MacroTarget | null>(null);
  const [nutrients, setNutrients] = useState<Nutrient[]>([]);
  const [bands, setBands] = useState<ResolvedNutrientTarget[]>([]);
  // Distinct days with ≥1 entry in the active window (the averaging divisor); only
  // surfaced in range mode to caption the average.
  const [loggedDays, setLoggedDays] = useState(0);

  // INPUT
  const [range, setRange] = useState<NutritionRange>("today");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  // Bumped after a log lands to force a totals refetch.
  const [refreshKey, setRefreshKey] = useState(0);
  // The "Today" preset's anchor day (server-resolved ?date=, else today). Every
  // other preset/custom range resolves its own window relative to today.
  const anchorDay = initialDate || todayIso();
  // "today" = a single day; any other range = a multi-day average view (values
  // are per-logged-day averages, captioned below the header).
  const isRangeMode = range !== "today";
  // Resolve the active window — the anchor day for "today", else the resolved
  // preset/custom bounds.
  const { startDate, endDate } = isRangeMode
    ? getNutritionRangeParams(range, customStartDate, customEndDate)
    : { startDate: anchorDay, endDate: anchorDay };
  // A custom range is incomplete until both ends are picked — don't fetch yet.
  const rangeReady = !(range === "custom" && (!customStartDate || !customEndDate));

  // Nutrient metadata + resolved target bands are day-independent — fetch once.
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/modules/forage/api/nutrients").then((r) => r.json()),
      fetch("/modules/forage/api/nutrient-targets").then((r) => r.json()),
    ])
      .then(([nData, bData]) => {
        if (!alive) return;
        if (Array.isArray(nData)) setNutrients(nData);
        if (Array.isArray(bData)) setBands(bData);
      })
      .catch((e) => console.error(e));
    return () => { alive = false; };
  }, []);

  // Totals + macro target refetch whenever the active window changes. Both single
  // day and multi-day range go through nutrition-summary (a single day resolves to
  // start == end, whose per-logged-day average is just that day's totals). The
  // macro target is read for the window's end date (== the viewed day in single
  // mode). Skipped until a custom range has both ends.
  useEffect(() => {
    if (!rangeReady) return;
    let alive = true;
    setIsLoading(true);
    Promise.all([
      fetch(`/modules/forage/api/nutrition-summary?startDate=${startDate}&endDate=${endDate}`).then((r) => r.json()),
      fetch(`/modules/forage/api/targets?date=${endDate}`).then((r) => r.json()),
    ])
      .then(([sData, tData]) => {
        if (!alive) return;
        setTotals(sData?.totals ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, micros: {} });
        setLoggedDays(Number(sData?.loggedDays ?? 0));
        setTarget(tData ?? null);
      })
      .catch((e) => console.error(e))
      .finally(() => { if (alive) setIsLoading(false); });
    return () => { alive = false; };
  }, [startDate, endDate, rangeReady, refreshKey]);

  // ─── ASSEMBLE ROWS ───
  const bandByCode = new Map(bands.map((b) => [b.code, b]));
  // Real nutrient codes (micros) — these rows drill into the per-nutrient target
  // editor. Synthetic macro rows (kcal/protein/carbs/fat) aren't in `nutrients`,
  // so they stay non-navigable (macros use the separate macro-goal editor).
  const navCodes = new Set(nutrients.map((n) => n.code));
  // Codes whose band is a custom override set by the active program (vs FDA
  // default), so the list can flag them — derived straight from the resolved
  // band's source, no per-row state to keep in sync.
  const customCodes = new Set(bands.filter((b) => b.source === "manual").map((b) => b.code));
  const openNutrient = (code: string) => router.push(`/modules/forage/ui/nutrition/${encodeURIComponent(code)}`);

  // Macros are synthetic — each hangs its macro target on `target` (reach-a-goal,
  // single tick). No floor/ceiling band; a real calorie band would come from the
  // per-nutrient target editor, not a guessed tolerance.
  const macroRows: NutrientRow[] = [];
  if (target) {
    macroRows.push(
      { key: "kcal", name: "Calories", unit: "kcal", value: totals.kcal, color: C.kcal, floor: null, target: target.kcal, ceiling: null },
      { key: "protein", name: "Protein", unit: "g", value: totals.protein_g, color: C.protein, floor: null, target: target.protein_g, ceiling: null },
      { key: "carbs", name: "Carbs", unit: "g", value: totals.carbs_g, color: C.carb, floor: null, target: target.carbs_g, ceiling: null },
      { key: "fat", name: "Fat", unit: "g", value: totals.fat_g, color: C.fat, floor: null, target: target.fat_g, ceiling: null },
    );
  }

  function microRow(n: Nutrient): NutrientRow {
    const value = totals.micros[n.code] ?? 0;
    // Resolved per-user band when it loaded; otherwise fall back to the
    // nutrient's FDA defaults (carried on /api/nutrients) so a floor/ceiling
    // nutrient STILL gets a bar even if the resolved-targets fetch failed.
    const b = bandByCode.get(n.code);
    const floor = b ? b.floor : n.default_floor;
    const target = b ? b.target : n.default_target;
    const ceiling = b ? b.ceiling : n.default_ceiling;
    // color null → the bar uses its SECTION color, so e.g. carbs (macro) and
    // sugars/fiber (Carb Breakdown) all read the same green.
    return { key: n.code, name: n.name, unit: n.unit, value, color: null, floor, target, ceiling };
  }

  // Sort by the ledger's canonical order, not DB display_order.
  const byOrder = (a: Nutrient, b: Nutrient) => byNutrientOrder(a, b);
  const pick = (codes: Set<string>) => nutrients.filter((n) => codes.has(n.code)).sort(byOrder).map(microRow);
  const fatBreakdown = pick(FAT_BREAKDOWN_CODES);
  const carbBreakdown = pick(CARB_BREAKDOWN_CODES);
  const proteinBreakdown = pick(PROTEIN_BREAKDOWN_CODES);
  const vitamins = nutrients.filter((n) => n.category === "vitamin").sort(byOrder).map(microRow);
  const minerals = nutrients.filter((n) => n.category === "mineral").sort(byOrder).map(microRow);
  const breakdownCodes = new Set([...FAT_BREAKDOWN_CODES, ...CARB_BREAKDOWN_CODES, ...PROTEIN_BREAKDOWN_CODES]);
  const other = nutrients.filter((n) => n.category === "other" && !breakdownCodes.has(n.code)).sort(byOrder).map(microRow);

  // Section list assembled in render order, so the staggered reveal can index
  // each block and empty sections drop out without leaving a gap in the cadence.
  const sections: { title: string; rows: NutrientRow[] }[] = [
    { title: "Macros", rows: macroRows },
    { title: "Fat Breakdown", rows: fatBreakdown },
    { title: "Carb Breakdown", rows: carbBreakdown },
    { title: "Protein Breakdown", rows: proteinBreakdown },
    { title: "Vitamins", rows: vitamins },
    { title: "Minerals", rows: minerals },
    { title: "Other", rows: other },
  ].filter((s) => s.rows.length > 0);

  return (
    /* PAGE — locked shell with an inner scroll region so the bottom tab bar
       stays pinned (matches the dashboard / strategy layout). */
    <div className="page-with-bottom-bar forage-nutrition">

      {/* PAGE SCROLL — the only scrollable surface. */}
      <div className="page-scroll">

      {/* PAGE CONTAINER */}
      <div className="page-container" style={{ maxWidth: 640, margin: "0 auto" }}>

        {/* HEADER — eyebrow + title. The eyebrow tracks the active window: the
            anchor day for "Today", the start–end span for a multi-day range. */}
        <div className="nutr-header">

          {/* EYEBROW — full date (single day) or range span (multi-day) */}
          <div className="nutr-eyebrow">{isRangeMode ? rangeSpanLabel(startDate, endDate) : fullDateLabel(anchorDay)}</div>

          {/* TITLE */}
          <div className="nutr-title">Nutrition</div>
        </div>

        {/* RANGE SELECTOR — full-width segmented control driving the whole view */}
        <NutritionRangeSelector
          range={range}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          onRangeChange={setRange}
          onCustomDateChange={(s, e) => { setCustomStartDate(s); setCustomEndDate(e); }}
        />

        {/* AVERAGE CAPTION — clarifies that range-mode values are per-day averages */}
        {isRangeMode && rangeReady && !isLoading && target && (
          <div className="nutr-avg-note">
            {loggedDays > 0
              ? `Daily average over ${loggedDays} logged ${loggedDays === 1 ? "day" : "days"}`
              : "No food logged in this range"}
          </div>
        )}

        {isLoading && nutrients.length === 0 ? (
          /* LOADING */
          <div style={{ display: "flex", justifyContent: "center", padding: "2rem 0" }}>
            <div style={{ width: 24, height: 24, border: `2px solid ${C.divider}`, borderTopColor: C.text, borderRadius: 999, animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : !target ? (
          /* NO TARGETS PROMPT */
          <div className="fg-tile" style={{ borderRadius: 12, padding: 16 }}>
            <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>No targets set</div>
            <div style={{ color: C.textMuted, fontSize: 13 }}>Set your daily macro targets to see goal indicators on each bar.</div>
          </div>
        ) : (
          <>
            {/* NUTRIENT SECTIONS — each a single grouped surface with divided rows */}
            {sections.map((section, i) => (
              <NutrientGroup key={section.title} title={section.title} rows={section.rows} delay={i * 60} navCodes={navCodes} customCodes={customCodes} onNavigate={openNutrient} />
            ))}
          </>
        )}
      </div>

      </div>

      {/* BOTTOM BAR — shared quick-add flow; a log refreshes the totals via the
          refreshKey bump. Quick-adds always land on today (the page no longer
          browses individual past days). */}
      <ForageBottomBar active="dashboard" date={todayIso()} onLogged={() => setRefreshKey((k) => k + 1)} />

      {/* TOAST */}
      <Toaster position="top-center" />
    </div>
  );
}

// Full date for the header eyebrow — "SUNDAY, JUNE 6" (matches the dashboard).
function fullDateLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const dow = d.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  return `${dow}, ${monthDay}`.toUpperCase();
}

// Eyebrow label for a multi-day range — "JUN 16 – JUN 22" (or just the single day
// when the bounds collapse, e.g. a one-day custom range).
function rangeSpanLabel(startIso: string, endIso: string): string {
  if (!startIso || !endIso) return "SELECT A RANGE";
  const fmtDay = (iso: string) =>
    new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
  return startIso === endIso ? fmtDay(startIso) : `${fmtDay(startIso)} – ${fmtDay(endIso)}`;
}

/* ─── GROUP ───
   A titled section (Macros / Fat Breakdown / … / Other) with one card per
   nutrient, mirroring the MacroFactor "Nutrition Overview" breakdown. The
   section's accent tints each bar's consumption fill. */
function NutrientGroup({ title, rows, delay, navCodes, customCodes, onNavigate }: { title: string; rows: NutrientRow[]; delay: number; navCodes: Set<string>; customCodes: Set<string>; onNavigate: (code: string) => void }) {
  const accent = sectionColor(title);
  return (
    /* SECTION — one labelled, grouped surface (matches the dashboard's More
       block + the settings groups) instead of a stack of floating cards. */
    <div className="nutr-section nutr-reveal" style={{ animationDelay: `${delay}ms` }}>

      {/* SECTION HEADER — title + trailing rule + nutrient count */}
      <div className="nutr-section-head">
        <h2>{title}</h2>
        <div className="nutr-section-rule" />
        <span className="nutr-section-count">{rows.length}</span>
      </div>

      {/* GROUPED LIST — divided rows share a single border */}
      <div className="nutr-group">
        {rows.map((row) => (
          <NutrientRow
            key={row.key}
            row={row}
            accent={accent}
            isCustom={customCodes.has(row.key)}
            onNavigate={navCodes.has(row.key) ? () => onNavigate(row.key) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── NUTRIENT ROW ───
   One hairline-divided row inside the section's grouped surface: name + "consumed
   / band unit" + % on the top line, the meter below. The bar places
   floor/target/ceiling per the headroom model (see Meter). No band at all →
   "No Target", no bar. */
function NutrientRow({ row, accent, isCustom, onNavigate }: { row: NutrientRow; accent: string; isCustom: boolean; onNavigate?: () => void }) {
  const d = bandDisplay(rowBand(row), row.unit);

  return (
    /* NUTRIENT ROW — drills into the per-nutrient target editor when navigable */
    <div
      className="nutr-row"
      data-nav={onNavigate ? "true" : undefined}
      role={onNavigate ? "button" : undefined}
      tabIndex={onNavigate ? 0 : undefined}
      onClick={onNavigate}
      onKeyDown={onNavigate ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate(); } } : undefined}
    >

      {/* NAME + VALUE + PERCENT */}
      <div className="nutr-row-top">

        {/* NAME + PROGRAM-TARGET FLAG — a bullseye/target mark flags nutrients
            whose band is a program override (vs the FDA default) */}
        <span className="nutr-name-wrap">

          {/* NAME */}
          <span className="nutr-name">{row.name}</span>

          {/* PROGRAM-TARGET GLYPH — bullseye, shared with the food-detail bars */}
          {isCustom && <ProgramTargetMark />}
        </span>

        {/* VALUE + PERCENT */}
        <div className="nutr-figures">

          {/* VALUE */}
          <span className="nutr-value">
            <b>{fmt(row.value)}</b>{d.targetText}
          </span>

          {/* PERCENT / NO TARGET */}
          <span className="nutr-pct" data-bar={d.showBar ? "true" : "false"} style={{ color: d.pctColor }}>{d.pctText}</span>
        </div>
      </div>

      {/* METER */}
      {d.showBar && <div style={{ marginTop: 7 }}><NutrientMeter band={rowBand(row)} fillColor={row.color ?? accent} /></div>}
    </div>
  );
}

