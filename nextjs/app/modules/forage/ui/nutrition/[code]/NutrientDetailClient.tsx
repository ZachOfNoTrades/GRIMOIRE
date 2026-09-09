"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BackLink } from "@/components/BackLink";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Nutrient, ResolvedNutrientTarget, FoodNutrientRanking, NutrientDailyPoint } from "../../../types/food";
import { NutritionRange, NUTRITION_RANGE_OPTIONS, getNutritionRangeParams, windowKeyFor, parseWindowKey, presetWindowKeys } from "../../../utils/dateRange";
import DateRangeSelector from "@/components/DateRangeSelector";
import NutrientTrendChart from "./NutrientTrendChart";
import { useAppHeight } from "@/lib/useAppHeight";
import { useWindowCache } from "@/lib/useWindowCache";
import SegmentedToggle, { SegmentedOption } from "@/components/ui/SegmentedToggle";
import "./detail.css";

// How the foods list is ranked / valued:
//   serving — each food's per-serving density (static, per backing reference)
//   daily   — nutrient eaten from the food per logged day (total ÷ logged days)
type FoodSort = "serving" | "daily";
const FOOD_SORT_OPTIONS: SegmentedOption<FoodSort>[] = [
  { value: "serving", label: "Per serving" },
  { value: "daily", label: "Daily avg" },
];

// Top-N foods shown. Passed to the API as the per-metric limit; the route returns
// the union of the top-N by serving and the top-N by total (≤ 2·N), and the client
// slices back to N by whichever metric is active.
const FOODS_LIMIT = 10;

// Display a band marker; null → an em dash (no marker for this nutrient).
function show(n: number | null): string {
  return n == null ? "—" : String(n);
}

// Format a nutrient amount: under 1 keeps one decimal so trace values don't vanish,
// else whole, thousands-separated so big mg figures stay readable.
function fmtAmount(n: number): string {
  if (n > 0 && n < 1) return n.toFixed(1);
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Label for a food's backing reference (what the amount is "per").
const BASIS_LABEL: Record<FoodNutrientRanking["basis"], string> = {
  serving: "serving",
  "100g": "100 g",
  "100ml": "100 ml",
};

export default function NutrientDetailClient({ nutrient }: { nutrient: Nutrient }) {

  // Lock the shell to the real visible viewport (Firefox Android handling lives
  // in lib/useAppHeight), matching the other forage screens.
  useAppHeight();

  // Macros (calories/protein/carbs/fat) are nutrient rows now, but their goal is
  // the user's daily macro target (a single reach-a-goal value), not a
  // program-scoped micro band — so they're read from /api/targets, not the
  // nutrient-target bands.
  const isMacro = nutrient.category === "macro";

  // DATA — the resolved floor/target/ceiling band for this nutrient (the active
  // program's override if any, else the FDA defaults). Read-only here; editing
  // happens elsewhere (the program flow).
  const [band, setBand] = useState<ResolvedNutrientTarget | null>(null);
  // DATA — the active daily goal for this macro (null until loaded / non-macro).
  const [macroGoal, setMacroGoal] = useState<number | null>(null);

  // (The window-scoped data — foods richest in this nutrient, the average intake
  // line and the daily trend — is cached per range by useWindowCache below.)

  // INPUT — log-date window shared by the average-intake line and the "foods
  // highest" list (both restricted to foods the user logged in the window).
  const [range, setRange] = useState<NutritionRange>("1m");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  // STATE — which metric the foods list is ranked/valued by (per-serving density,
  // daily average, or period total). All three derive from the one fetch (amount +
  // total_consumed) plus the logged-day count, so the toggle re-sorts client-side
  // with no refetch.
  const [foodSort, setFoodSort] = useState<FoodSort>("serving");
  // A custom range is incomplete until both ends are picked — don't fetch yet.
  const rangeReady = !(range === "custom" && (!customStartDate || !customEndDate));
  const { startDate: winStart, endDate: winEnd } = getNutritionRangeParams(range, customStartDate, customEndDate);
  // The selected window as a cache key (null while a custom range is half-picked).
  const activeKey = rangeReady ? windowKeyFor(range, winStart, winEnd) : null;
  // Warm every preset in the background once the selected one has landed.
  const prefetchKeys = useMemo(() => presetWindowKeys(), []);

  // Foods-highest list + average intake + daily trend for ONE window, all three
  // scoped to the same range so they land together.
  const loadWindow = useCallback(async (cacheKey: string) => {
    const { startDate, endDate } = parseWindowKey(cacheKey);

    // Ranked foods — startDate/endDate are optional on this route (absent ⇒ all-time).
    const foodParams = new URLSearchParams({ nutrient_id: nutrient.id, limit: String(FOODS_LIMIT) });
    if (startDate) foodParams.set("startDate", startDate);
    if (endDate) foodParams.set("endDate", endDate);

    // A failed summary throws rather than resolving to `{ error }`, which would
    // read out as a genuine zero intake for the window.
    const [foods, summary, series] = await Promise.all([
      fetch(`/modules/forage/api/foods-by-nutrient?${foodParams.toString()}`).then((r) => (r.ok ? r.json() : [])),
      // nutrition-summary returns every code (incl. macros) under `micros`.
      fetch(`/modules/forage/api/nutrition-summary?startDate=${startDate}&endDate=${endDate}`).then((r) => {
        if (!r.ok) throw new Error(`nutrition-summary ${r.status}`);
        return r.json();
      }),
      fetch(`/modules/forage/api/nutrient-daily?code=${encodeURIComponent(nutrient.code)}&startDate=${startDate}&endDate=${endDate}`).then((r) => (r.ok ? r.json() : [])),
    ]);

    return {
      topFoods: (Array.isArray(foods) ? foods : []) as FoodNutrientRanking[],
      // This nutrient's per-logged-day average intake, with the day count used
      // as the divisor.
      avgIntake: { value: Number(summary?.totals?.micros?.[nutrient.code] ?? 0), loggedDays: Number(summary?.loggedDays ?? 0) },
      // Per-day intake over the window (one point per logged day).
      dailySeries: (Array.isArray(series) ? series : []) as NutrientDailyPoint[],
    };
  }, [nutrient.id, nutrient.code]);

  // Same cache-and-warm treatment as the nutrition overview: every visited window
  // is kept and the un-selected presets load behind the active one, so changing
  // the range swaps the average line, the trend chart and the foods list together
  // instead of collapsing the whole section to a spinner and rebuilding it.
  const { data: windowData, isLoading: windowLoading } = useWindowCache(activeKey, loadWindow, { prefetchKeys });
  const topFoods = windowData?.topFoods ?? [];
  const avgIntake = windowData?.avgIntake ?? null;
  const dailySeries = windowData?.dailySeries ?? [];

  // First paint holds until BOTH initial fetches land (the band/goal AND the foods
  // window), behind ONE spinner. The two sections used to gate independently, so a
  // page load painted two spinners stacked on top of each other. Once loaded the
  // section stays put across range changes — there is no second spinner any more.
  const initialLoading = isLoading || windowLoading;

  // The active sort metric for a row, and the list re-sorted + sliced by it. The API
  // hands back the union of both metrics' top-N, so slicing here yields the true
  // top-N for whichever is selected. `daily` divides the window total by the logged-
  // day count (the same divisor shown in the "over N logged days" line); guard the
  // divisor so an unloaded/zero count never divides by zero.
  const loggedDays = avgIntake?.loggedDays ?? 0;
  const dayDivisor = loggedDays > 0 ? loggedDays : 1;
  const foodMetric = (food: FoodNutrientRanking) =>
    foodSort === "serving" ? food.amount : food.total_consumed / dayDivisor;
  const sortedFoods = [...topFoods].sort((a, b) => foodMetric(b) - foodMetric(a)).slice(0, FOODS_LIMIT);
  const topFoodMetric = sortedFoods.length ? foodMetric(sortedFoods[0]) : 0;

  useEffect(() => {
    let alive = true;
    // Macros: read the active daily macro goal. Micros: read the resolved band.
    const url = isMacro ? "/modules/forage/api/targets" : "/modules/forage/api/nutrient-targets";
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        if (isMacro) {
          // Map the macro code → its MacroTarget field.
          const field: Record<string, "kcal" | "protein_g" | "carbs_g" | "fat_g"> = {
            kcal: "kcal", protein: "protein_g", carbs: "carbs_g", fat: "fat_g",
          };
          const key = field[nutrient.code];
          const val = data && key ? Number(data[key]) : NaN;
          setMacroGoal(Number.isFinite(val) && val > 0 ? val : null);
        } else if (Array.isArray(data)) {
          setBand(data.find((b: ResolvedNutrientTarget) => b.code === nutrient.code) ?? null);
        }
      })
      .catch((e) => console.error(e))
      .finally(() => { if (alive) setIsLoading(false); });
    return () => { alive = false; };
  }, [nutrient.code, isMacro]);


  // Effective markers. Macros: a single daily goal (no floor/ceiling). Micros:
  // the resolved band when loaded, else the nutrient's own FDA defaults so the
  // page still reads correctly if the fetch failed.
  const floor = isMacro ? null : band ? band.floor : nutrient.default_floor;
  const target = isMacro ? macroGoal : band ? band.target : nutrient.default_target;
  const ceiling = isMacro ? null : band ? band.ceiling : nutrient.default_ceiling;
  const isManual = band?.source === "manual";
  // A real band (floor and/or ceiling) lets the trend chart color bars by state;
  // a lone target / macro goal has no over-vs-under verdict, so bars stay neutral.
  const hasBand = !isMacro && (floor != null || ceiling != null);

  const rows: { key: string; label: string; help: string; value: number | null }[] = isMacro
    ? [{ key: "target", label: "Daily target", help: "Your daily goal", value: target }]
    : [
        { key: "floor", label: "Floor", help: "Minimum to reach", value: floor },
        { key: "target", label: "Target", help: "Ideal amount", value: target },
        { key: "ceiling", label: "Ceiling", help: "Limit to stay under", value: ceiling },
      ];

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container nutr-detail">

        {/* BACK */}
        <BackLink fallback="/modules/forage/ui/nutrition" className="units-back">
          <ChevronLeft className="w-5 h-5" /> Nutrition
        </BackLink>

        {/* PAGE TITLE */}
        <h1 className="text-page-title settings-title">{nutrient.name}</h1>

        {initialLoading ? (
          /* LOADING — one spinner for the whole page (band block + foods section) */
          <div className="loading-container"><div className="loading-spinner" /></div>
        ) : (
          <>
            {/* BAND FIELDS — read-only */}
            <div className="settings-group nutr-detail-fields">
              {rows.map((row) => (
                /* FIELD ROW */
                <div key={row.key} className="nutr-detail-field">

                  {/* LABEL BLOCK */}
                  <div className="nutr-detail-field-text">
                    <span className="nutr-detail-field-label">{row.label}</span>
                    <span className="nutr-detail-field-help">{row.help}</span>
                  </div>

                  {/* VALUE + UNIT */}
                  <div className="nutr-detail-value">
                    {show(row.value)}
                    {row.value != null && <span className="nutr-detail-unit">{nutrient.unit}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* SOURCE NOTE — where these values come from and where to change them */}
            <p className="nutr-detail-note">
              {isMacro ? (
                <>This is your daily {nutrient.name.toLowerCase()} goal. It can be changed from the <Link className="nutr-detail-link" href="/modules/forage/ui/strategy">strategy menu</Link>.</>
              ) : isManual ? (
                <>These are custom values set by the active program. They can be edited from the <Link className="nutr-detail-link" href="/modules/forage/ui/strategy">strategy menu</Link>.</>
              ) : (
                <>These values are based on the FDA daily value recommendations. Custom values can be set in the <Link className="nutr-detail-link" href="/modules/forage/ui/strategy">strategy menu</Link>.</>
              )}
            </p>

            {/* FOODS HIGHEST IN THIS NUTRIENT */}
            <div className="nutr-detail-foods">

              {/* SECTION HEADER — title + log-date range selector */}
              <div className="nutr-detail-foods-header">

                {/* HEADING */}
                <h2 className="nutr-detail-foods-head">Foods highest in {nutrient.name}</h2>

                {/* RANGE FILTER — scopes both the average intake + the foods list */}
                <DateRangeSelector
                  options={NUTRITION_RANGE_OPTIONS}
                  range={range}
                  customStartDate={customStartDate}
                  customEndDate={customEndDate}
                  onRangeChange={setRange}
                  onCustomDateChange={(s, e) => { setCustomStartDate(s); setCustomEndDate(e); }}
                />
              </div>

              {/* AVERAGE INTAKE — this nutrient's per-logged-day average over the window */}
              {avgIntake && (
                <p className="nutr-detail-avg">
                  {avgIntake.loggedDays > 0
                    ? <>Averaging <b>{fmtAmount(avgIntake.value)} {nutrient.unit}</b>/day over {avgIntake.loggedDays} logged {avgIntake.loggedDays === 1 ? "day" : "days"}</>
                    : <>No {nutrient.name.toLowerCase()} logged in this range</>}
                </p>
              )}

              {/* DAILY INTAKE TREND — bars per logged day, band lines overlaid */}
              {dailySeries.length >= 2 && (
                <NutrientTrendChart
                  points={dailySeries}
                  unit={nutrient.unit}
                  floor={floor}
                  target={target}
                  ceiling={ceiling}
                  hasBand={hasBand}
                />
              )}

              {/* SORT TOGGLE — rank the list by per-serving density, daily average, or period total */}
              {topFoods.length > 0 && (
                <SegmentedToggle options={FOOD_SORT_OPTIONS} value={foodSort} onChange={setFoodSort} style={{ margin: "4px auto 12px" }} />
              )}

              {topFoods.length === 0 ? (
                /* EMPTY */
                <p className="nutr-detail-foods-empty">No logged foods with {nutrient.name} in this range — log foods to see them here.</p>
              ) : (
                /* FOOD ROWS — ranked by the active metric; bars scaled to that metric's top food */
                <div className="settings-group nutr-detail-foods-list">
                  {sortedFoods.map((food) => (
                    /* FOOD ROW — clickable, navigates to the food's details page */
                    <Link
                      key={food.food_id}
                      className="nutr-detail-food"
                      href={`/modules/forage/ui/library/${food.food_id}`}
                    >

                      {/* NAME + BAR */}
                      <div className="nutr-detail-food-main">

                        {/* NAME */}
                        <span className="nutr-detail-food-name">
                          {food.name}{food.brand && <span className="nutr-detail-food-brand"> · {food.brand}</span>}
                        </span>

                        {/* BAR — width relative to the active metric's top food */}
                        <div className="nutr-detail-food-bar">
                          <div className="nutr-detail-food-bar-fill" style={{ width: `${topFoodMetric > 0 ? Math.max(4, Math.round((foodMetric(food) / topFoodMetric) * 100)) : 0}%` }} />
                        </div>
                      </div>

                      {/* AMOUNT + UNIT — per-serving keeps the backing reference; daily is
                          the per-logged-day average */}
                      <div className="nutr-detail-food-val">
                        {fmtAmount(foodMetric(food))}
                        <span className="nutr-detail-unit">
                          {foodSort === "serving" ? `${nutrient.unit} / ${BASIS_LABEL[food.basis]}` : `${nutrient.unit} / day`}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
