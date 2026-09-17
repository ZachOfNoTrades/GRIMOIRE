"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { BackLink } from "@/components/BackLink";
import DateRangeSelector from "@/components/DateRangeSelector";
import SegmentedToggle, { SegmentedOption } from "@/components/ui/SegmentedToggle";
import { useWindowCache } from "@/lib/useWindowCache";
import { DateRangePreset, dateRangeOptions } from "@/lib/dateRange";
import { getNutritionRangeParams, windowKeyFor, parseWindowKey } from "../../../utils/dateRange";
import { InsightMetric, InsightsPayload } from "../../../types/insights";
import { weightTrendSeries, WEIGHT_TOLERANCE_LB, WEIGHT_CHART_MIN_SPAN_LB } from "../../home/weightTrend";
import { goalCardSummary, MAINTENANCE_BAND_LB } from "../../home/goalCard";
import InsightLineChart, { ChartPoint, shortDate } from "./InsightLineChart";
import BalanceBarChart from "./BalanceBarChart";
import "../../nutrition/[code]/detail.css";
import "./insights.css";

// Color tokens — the same hues the dashboard's insight cards use for each metric.
const C = {
  expenditure: "var(--fg-protein)",
  weight: "var(--fg-fat)",
  intake: "var(--fg-cal)",
  neutral: "var(--color-gray)",
  good: "var(--fg-carb)",
  amber: "var(--alert-yellow-text)",
};

// A logged day under this is never counted as complete (see EnergyBalanceView).
const PARTIAL_FLOOR_KCAL = 800;

// kcal per lb of body-mass change — the 7,700 kcal/kg lib/program.ts uses.
const KCAL_PER_LB = 7700 / 2.2046226218;

// Every preset but "today": each page reads a trend, and one day has none.
const RANGE_OPTIONS = dateRangeOptions(["1w", "1m", "3m", "6m", "1y", "custom"]);

// Where each page opens. Expenditure and the goal move slowly, so they open wide
// enough to show a direction; intake and weight move day to day.
const DEFAULT_RANGE: Record<InsightMetric, DateRangePreset> = {
  expenditure: "3m",
  "weight-trend": "1m",
  "energy-balance": "1m",
  goal: "3m",
};

const TITLES: Record<InsightMetric, string> = {
  expenditure: "Expenditure",
  "weight-trend": "Weight Trend",
  "energy-balance": "Energy Balance",
  goal: "Goal",
};

type Baseline = "expenditure" | "target";
const BASELINE_OPTIONS: SegmentedOption<Baseline>[] = [
  { value: "expenditure", label: "Expenditure" },
  { value: "target", label: "Target" },
];

// ─── Formatting ───
const int = (n: number) => Math.round(n).toLocaleString();
const lb1 = (n: number) => n.toFixed(1);
function signed(n: number, digits = 1): string {
  const rounded = Number(n.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(digits)}`;
}
const signedInt = (n: number) => {
  const r = Math.round(n);
  return r === 0 ? "0" : `${r > 0 ? "+" : "−"}${Math.abs(r).toLocaleString()}`;
};

function dayDiff(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split("-").map(Number);
  const [by, bm, bd] = bIso.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// "YYYY-MM-DD" → "Sep 17" (UTC parts, so no TZ drift on a bare date).
function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

interface FieldRow {
  key: string;
  label: string;
  help: string;
  value: string;
  unit?: string;
}

// Read-only label/value rows — the nutrient detail page's band-field surface.
function Fields({ rows }: { rows: FieldRow[] }) {
  return (
    /* FIELD GROUP */
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
            {row.value}
            {row.unit && row.value !== "—" && <span className="nutr-detail-unit">{row.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function InsightDetailClient({ metric }: { metric: InsightMetric }) {

  // INPUT — the date range every section on the page is scoped to.
  const [range, setRange] = useState<DateRangePreset>(DEFAULT_RANGE[metric]);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  // A custom range is incomplete until both ends are picked — don't fetch yet.
  const rangeReady = !(range === "custom" && (!customStartDate || !customEndDate));
  const { startDate, endDate } = getNutritionRangeParams(range, customStartDate, customEndDate);
  const activeKey = rangeReady ? windowKeyFor(range, startDate, endDate) : null;
  const prefetchKeys = useMemo(
    () =>
      RANGE_OPTIONS.filter((o) => o.value !== "custom").map((o) => {
        const b = getNutritionRangeParams(o.value);
        return windowKeyFor(o.value, b.startDate, b.endDate);
      }),
    [],
  );

  const loadWindow = useCallback(async (cacheKey: string): Promise<InsightsPayload> => {
    const { startDate: s, endDate: e } = parseWindowKey(cacheKey);
    const res = await fetch(`/modules/forage/api/insights?startDate=${s}&endDate=${e}`);
    if (!res.ok) throw new Error(`insights ${res.status}`);
    return res.json();
  }, []);

  const { data, isLoading, isError } = useWindowCache(activeKey, loadWindow, { prefetchKeys });

  // The goal page is titled by the goal it shows, matching its dashboard card.
  const goalTitle = data ? goalCardSummary(data.goal, data.weigh_ins).title : TITLES.goal;
  const title = metric === "goal" ? goalTitle : TITLES[metric];

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container nutr-detail insight-detail">

        {/* BACK */}
        <BackLink fallback="/modules/forage/ui/home" className="units-back">
          <ChevronLeft className="w-5 h-5" /> Dashboard
        </BackLink>

        {/* PAGE TITLE */}
        <h1 className="text-page-title settings-title">{title}</h1>

        {/* RANGE FILTER */}
        <div className="insight-range">
          <DateRangeSelector
            options={RANGE_OPTIONS}
            range={range}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onRangeChange={setRange}
            onCustomDateChange={(s, e) => { setCustomStartDate(s); setCustomEndDate(e); }}
            label={`${title} date range`}
          />
        </div>

        {isLoading ? (
          /* LOADING */
          <div className="loading-container"><div className="loading-spinner" /></div>
        ) : !data ? (
          /* ERROR */
          <p className="nutr-detail-foods-empty">{isError ? "Couldn't load this page — try again." : "Pick both dates to see this range."}</p>
        ) : metric === "expenditure" ? (
          <ExpenditureView data={data} />
        ) : metric === "weight-trend" ? (
          <WeightTrendView data={data} />
        ) : metric === "energy-balance" ? (
          <EnergyBalanceView data={data} />
        ) : (
          <GoalView data={data} />
        )}
      </div>
    </div>
  );
}

/* ─── EXPENDITURE ─── */

function ExpenditureView({ data }: { data: InsightsPayload }) {
  const x = data.expenditure;
  const isAdaptive = x.method === "adaptive";
  const daily = x.daily;
  const change = daily.length >= 2 ? daily[daily.length - 1].expenditure_kcal - daily[0].expenditure_kcal : null;
  const targets = data.targets.filter((t): t is { date: string; kcal: number } => t.kcal != null).map((t) => ({ date: t.date, value: t.kcal }));

  const rows: FieldRow[] = [
    { key: "now", label: "Expenditure", help: "Estimated today", value: int(x.expenditure_kcal), unit: "kcal" },
    {
      key: "method",
      label: "Method",
      help: isAdaptive ? "From logged intake and weight change" : "Not enough history for the adaptive estimate",
      value: isAdaptive ? "Adaptive" : "Bodyweight",
    },
    ...(isAdaptive
      ? [
          { key: "intake", label: "Average intake", help: `Logged stretches · ${x.window_days}-day window`, value: x.avg_intake_kcal != null ? int(x.avg_intake_kcal) : "—", unit: "kcal" },
          { key: "trend", label: "Weight trend", help: "During logged stretches", value: x.weight_trend_lb_per_week != null ? signed(x.weight_trend_lb_per_week, 2) : "—", unit: "lb/wk" },
        ]
      : []),
    ...(change != null
      ? [{ key: "change", label: "Change", help: `Since ${longDate(daily[0].date)}`, value: signedInt(change), unit: "kcal" }]
      : []),
  ];

  return (
    <>
      {/* SUMMARY FIELDS */}
      <Fields rows={rows} />

      {/* ESTIMATE OVER TIME — the estimate as it stood on each day, against the target in force */}
      {daily.length >= 2 && (
        <div className="insight-section">
          <InsightLineChart
            title="Estimate by day"
            startDate={data.start_date}
            endDate={data.end_date}
            series={[
              { key: "x", label: "Expenditure", color: C.expenditure, kind: "line", points: daily.map((p) => ({ date: p.date, value: p.expenditure_kcal })) },
              ...(targets.length ? [{ key: "t", label: "Target", color: C.neutral, kind: "line" as const, points: targets }] : []),
            ]}
            format={int}
            unit="kcal"
          />
        </div>
      )}

      {/* HOW IT'S CALCULATED */}
      <div className="insight-section">

        {/* HEADING */}
        <h2 className="nutr-detail-foods-head">How it&apos;s calculated</h2>

        {isAdaptive ? (
          <>
            {/* EXPLANATION */}
            <p className="insight-prose">
              Expenditure is what you ate minus what your body stored: <b>average intake − weight change × 3,500 kcal/lb</b>.
              It&apos;s measured over the last 28, 56 and 90 days, using only stretches where you logged food — a gap of more
              than 3 days is left out, along with the weight that changed during it. Each window counts in proportion to how
              much data it has, and the result is averaged over the last {x.smoothing_days} days so one weigh-in can&apos;t swing it.
            </p>

            {/* HORIZON ROWS */}
            <div className="settings-group">
              {x.horizons.map((h) => (
                /* HORIZON ROW */
                <div key={h.horizon_days} className="nutr-detail-field">

                  {/* LABEL BLOCK */}
                  <div className="nutr-detail-field-text">
                    <span className="nutr-detail-field-label">{h.horizon_days} days · {Math.round(h.weight * 100)}% of estimate</span>
                    <span className="nutr-detail-field-help">
                      {int(h.avg_intake_kcal)} kcal/day {h.weight_trend_lb_per_week >= 0 ? "−" : "+"} {int(Math.abs(h.weight_trend_lb_per_week) * KCAL_PER_LB / 7)} kcal ({signed(h.weight_trend_lb_per_week, 2)} lb/wk)
                    </span>
                    <span className="nutr-detail-field-help">
                      {h.logged_days} logged of {dayDiff(h.balance_start_date, h.balance_end_date) + 1} days · {h.stretches} {h.stretches === 1 ? "stretch" : "stretches"} · {h.weigh_ins} weigh-ins
                    </span>
                  </div>

                  {/* VALUE */}
                  <div className="nutr-detail-value">
                    {int(h.expenditure_kcal)}<span className="nutr-detail-unit">kcal</span>
                  </div>
                </div>
              ))}
            </div>

            {/* WINDOWS NOT SHOWN */}
            {x.horizons.length < 3 && (
              <p className="nutr-detail-note">
                Windows not listed didn&apos;t have enough data — at least 6 logged days, 3 weigh-ins spanning 2 weeks, and a quarter of the days logged.
              </p>
            )}
          </>
        ) : (
          /* FALLBACK EXPLANATION */
          <p className="insight-prose">
            There isn&apos;t enough history yet, so this uses your bodyweight: <b>30 kcal/kg, raised for training</b>.
            Log food and weigh in for a couple of weeks — at least 6 logged days and 3 weigh-ins spanning 2 weeks — and it switches to the adaptive estimate.
          </p>
        )}

        {/* SOURCE NOTE */}
        <p className="nutr-detail-note">
          Your calorie target is set from this number at each weekly check-in. Goals are set in the <Link className="nutr-detail-link" href="/modules/forage/ui/strategy">strategy menu</Link>.
        </p>
      </div>
    </>
  );
}

/* ─── WEIGHT TREND ─── */

function WeightTrendView({ data }: { data: InsightsPayload }) {
  const inRange = (iso: string) => iso >= data.start_date && iso <= data.end_date;
  const trend = weightTrendSeries(data.weigh_ins).filter((p) => inRange(p.date));
  const trendOn = new Map(weightTrendSeries(data.weigh_ins).map((p) => [p.date, p.value]));
  const weighIns = data.weigh_ins.filter((w) => inRange(w.log_date));
  const latest = weighIns[weighIns.length - 1] ?? null;

  const current = trend.length ? trend[trend.length - 1] : null;
  const change = trend.length >= 2 ? trend[trend.length - 1].value - trend[0].value : null;
  const spanDays = trend.length >= 2 ? dayDiff(trend[0].date, trend[trend.length - 1].date) : 0;
  const steady = change != null && Math.abs(change) <= WEIGHT_TOLERANCE_LB;

  const rows: FieldRow[] = [
    { key: "trend", label: "Trend weight", help: current ? `Smoothed · ${longDate(current.date)}` : "No weigh-ins in range", value: current ? lb1(current.value) : "—", unit: "lb" },
    { key: "latest", label: "Latest weigh-in", help: latest ? longDate(latest.log_date) : "No weigh-ins in range", value: latest ? lb1(latest.weight_lb) : "—", unit: "lb" },
    { key: "change", label: "Change", help: steady ? `Steady — within ±${WEIGHT_TOLERANCE_LB} lb` : "Trend weight across the range", value: change != null ? signed(change) : "—", unit: "lb" },
    { key: "rate", label: "Rate", help: "Average per week", value: change != null && spanDays > 0 ? signed((change / spanDays) * 7, 2) : "—", unit: "lb/wk" },
    { key: "count", label: "Weigh-ins", help: "In this range", value: String(weighIns.length) },
  ];

  return (
    <>
      {/* SUMMARY FIELDS */}
      <Fields rows={rows} />

      {/* TREND CHART — smoothed line over the raw readings */}
      {trend.length >= 2 && (
        <div className="insight-section">
          <InsightLineChart
            title="Weight"
            startDate={data.start_date}
            endDate={data.end_date}
            series={[
              { key: "raw", label: "Weigh-in", color: C.neutral, kind: "dots", points: weighIns.map((w) => ({ date: w.log_date, value: w.weight_lb })) },
              { key: "trend", label: "Trend", color: C.weight, kind: "line", points: trend },
            ]}
            format={lb1}
            unit="lb"
            minSpan={WEIGHT_CHART_MIN_SPAN_LB}
          />
        </div>
      )}

      {/* HOW THE TREND WORKS */}
      <p className="nutr-detail-note">
        The scale moves a pound or more day to day from water and food. The trend smooths that out (a 7-day exponential average,
        with gaps between weigh-ins filled in), so a change inside ±{WEIGHT_TOLERANCE_LB} lb reads as steady.
      </p>

      {/* WEIGH-IN LIST */}
      <div className="insight-section">

        {/* HEADING */}
        <h2 className="nutr-detail-foods-head">Weigh-ins</h2>

        {weighIns.length === 0 ? (
          /* EMPTY */
          <p className="nutr-detail-foods-empty">No weigh-ins in this range. Log them from the <Link className="nutr-detail-link" href="/modules/forage/ui/strategy?view=weigh-ins">strategy menu</Link>.</p>
        ) : (
          /* ROWS — newest first */
          <div className="settings-group">
            {[...weighIns].reverse().map((w) => {
              const t = trendOn.get(w.log_date);
              return (
                /* WEIGH-IN ROW */
                <div key={w.id} className="nutr-detail-field insight-row">

                  {/* DATE + VS TREND */}
                  <div className="nutr-detail-field-text">
                    <span className="nutr-detail-field-label">{longDate(w.log_date)}</span>
                    {t != null && <span className="nutr-detail-field-help">{signed(w.weight_lb - t)} lb vs trend</span>}
                  </div>

                  {/* WEIGHT */}
                  <div className="nutr-detail-value">{lb1(w.weight_lb)}<span className="nutr-detail-unit">lb</span></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/* ─── ENERGY BALANCE ─── */

function EnergyBalanceView({ data }: { data: InsightsPayload }) {

  // INPUT — what intake is measured against: estimated expenditure (the energy
  // balance proper) or the calorie target in force that day.
  const [baseline, setBaseline] = useState<Baseline>("expenditure");

  const expenditureOn = new Map(data.expenditure.daily.map((p) => [p.date, p.expenditure_kcal]));
  const targetOn = new Map(data.targets.map((t) => [t.date, t.kcal]));

  // Logged days only — an unlogged day is a missing reading, not a zero-calorie
  // day. Each day is measured against its OWN baseline, since both move.
  //
  // A PARTIAL log (breakfast entered, the rest forgotten) reads as a huge deficit
  // and can outweigh a month of real days, so it is listed but not counted — by
  // the same rule the expenditure estimate uses (lib/expenditure): under half the
  // median logged day, or under 800 kcal.
  const loggedValues = data.intake.map((p) => p.value).filter((v) => v > 0).sort((a, b) => a - b);
  const mid = Math.floor(loggedValues.length / 2);
  const median = loggedValues.length === 0 ? 0 : loggedValues.length % 2 ? loggedValues[mid] : (loggedValues[mid - 1] + loggedValues[mid]) / 2;
  const partialBelow = Math.max(PARTIAL_FLOOR_KCAL, median * 0.5);
  const listed = data.intake
    .filter((p) => p.value > 0)
    .map((p) => {
      const base = baseline === "expenditure" ? expenditureOn.get(p.date) ?? data.expenditure.expenditure_kcal : targetOn.get(p.date) ?? null;
      return base == null ? null : { date: p.date, intake: p.value, base, balance: p.value - base, partial: p.value < partialBelow };
    })
    .filter((d): d is { date: string; intake: number; base: number; balance: number; partial: boolean } => d !== null);
  const days = listed.filter((d) => !d.partial);
  const partialCount = listed.length - days.length;

  const rangeDays = dayDiff(data.start_date, data.end_date) + 1;
  const n = days.length;
  const sum = (f: (d: (typeof days)[number]) => number) => days.reduce((s, d) => s + f(d), 0);
  const total = sum((d) => d.balance);
  const avg = n ? total / n : null;
  const baseLabel = baseline === "expenditure" ? "expenditure" : "target";

  // What the scale did over the same range, for comparison with the logged balance.
  const trend = weightTrendSeries(data.weigh_ins).filter((p) => p.date >= data.start_date && p.date <= data.end_date);
  const weightChange = trend.length >= 2 ? trend[trend.length - 1].value - trend[0].value : null;

  const rows: FieldRow[] = [
    {
      key: "days",
      label: "Logged days",
      help: partialCount > 0 ? `${partialCount} partial ${partialCount === 1 ? "log" : "logs"} left out` : n < rangeDays ? "Unlogged days are left out" : "Every day logged",
      value: `${n} / ${rangeDays}`,
    },
    { key: "intake", label: "Average intake", help: "Per logged day", value: n ? int(sum((d) => d.intake) / n) : "—", unit: "kcal" },
    { key: "base", label: `Average ${baseLabel}`, help: baseline === "expenditure" ? "Estimate on each logged day" : "Target in force on each logged day", value: n ? int(sum((d) => d.base) / n) : "—", unit: "kcal" },
    { key: "avg", label: "Average balance", help: "Per logged day", value: avg != null ? int(Math.abs(avg)) : "—", unit: avg == null ? "" : avg < 0 ? "kcal deficit" : "kcal surplus" },
    { key: "total", label: "Total balance", help: "Across logged days", value: n ? signedInt(total) : "—", unit: "kcal" },
    ...(baseline === "expenditure"
      ? [
          { key: "implied", label: "Implied change", help: "Total balance ÷ 3,500 kcal/lb", value: n ? signed(total / KCAL_PER_LB) : "—", unit: "lb" },
          { key: "actual", label: "Trend change", help: "What the scale trend did", value: weightChange != null ? signed(weightChange) : "—", unit: "lb" },
        ]
      : []),
  ];

  return (
    <>
      {/* BASELINE TOGGLE */}
      <SegmentedToggle options={BASELINE_OPTIONS} value={baseline} onChange={setBaseline} style={{ margin: "0 auto 14px" }} />

      {/* SUMMARY FIELDS */}
      <Fields rows={rows} />

      {/* NOTE — why implied and actual differ */}
      {baseline === "expenditure" && n > 0 && (
        <p className="nutr-detail-note">
          Implied change only counts logged days, so it runs low when days go unlogged. Short-term scale moves are mostly water, not tissue.
        </p>
      )}

      {/* DAILY BALANCE CHART */}
      {n >= 1 && (
        <div className="insight-section">
          <BalanceBarChart
            title={`Intake vs ${baseLabel}`}
            startDate={data.start_date}
            endDate={data.end_date}
            points={days.map((d) => ({ date: d.date, value: d.balance }) satisfies ChartPoint)}
          />
        </div>
      )}

      {/* DAY LIST */}
      <div className="insight-section">

        {/* HEADING */}
        <h2 className="nutr-detail-foods-head">By day</h2>

        {listed.length === 0 ? (
          /* EMPTY */
          <p className="nutr-detail-foods-empty">No food logged in this range.</p>
        ) : (
          /* ROWS — newest first */
          <div className="settings-group">
            {[...listed].reverse().map((d) => (
              /* DAY ROW */
              <div key={d.date} className="nutr-detail-field insight-row">

                {/* DATE + INTAKE VS BASELINE */}
                <div className="nutr-detail-field-text">
                  <span className="nutr-detail-field-label">{longDate(d.date)}</span>
                  <span className="nutr-detail-field-help">
                    {int(d.intake)} eaten · {int(d.base)} {baseLabel}{d.partial ? " · partial log, not counted" : ""}
                  </span>
                </div>

                {/* BALANCE */}
                <div className="nutr-detail-value" style={{ color: d.partial ? C.neutral : d.balance >= 0 ? C.expenditure : C.intake }}>
                  {d.partial ? "—" : signedInt(d.balance)}{!d.partial && <span className="nutr-detail-unit">kcal</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ─── GOAL ─── */

function GoalView({ data }: { data: InsightsPayload }) {
  const goal = data.goal;
  if (!goal) {
    return (
      /* NO GOAL */
      <p className="nutr-detail-foods-empty">
        No active goal. Set one in the <Link className="nutr-detail-link" href="/modules/forage/ui/strategy">strategy menu</Link>.
      </p>
    );
  }

  const summary = goalCardSummary(goal, data.weigh_ins);
  const goalStart = goal.created_at.slice(0, 10);
  const fullTrend = weightTrendSeries(data.weigh_ins);
  const baselinePoint = fullTrend.find((p) => p.date >= goalStart) ?? null;
  const current = fullTrend.length ? fullTrend[fullTrend.length - 1] : null;
  const moved = baselinePoint && current ? current.value - baselinePoint.value : null;
  const days = baselinePoint && current ? dayDiff(baselinePoint.date, current.date) : 0;
  const chartStart = data.start_date > goalStart ? data.start_date : goalStart;
  const trend = fullTrend.filter((p) => p.date >= chartStart && p.date <= data.end_date);

  const goalLabel =
    goal.goal_kind === "maintain"
      ? "Maintain"
      : `${goal.goal_kind === "lose" ? "Lose" : "Gain"}${goal.rate_lb_per_week != null ? ` ${Number(goal.rate_lb_per_week.toFixed(2))} lb/wk` : ""}`;

  const rows: FieldRow[] = [
    { key: "goal", label: "Goal", help: `Since ${longDate(goalStart)} · ${days}d`, value: goalLabel },
    { key: "start", label: "Starting weight", help: "Trend weight when the goal began", value: baselinePoint ? lb1(baselinePoint.value) : "—", unit: "lb" },
    { key: "now", label: "Current weight", help: current ? `Trend weight · ${longDate(current.date)}` : "No weigh-ins", value: current ? lb1(current.value) : "—", unit: "lb" },
  ];
  if (goal.goal_kind === "maintain") {
    rows.push(
      { key: "drift", label: "Drift", help: `Allowed band ±${MAINTENANCE_BAND_LB} lb`, value: moved != null ? signed(moved) : "—", unit: "lb" },
      { key: "status", label: "Status", help: "Trend weight against the band", value: summary.tone === "none" ? "—" : summary.tone === "onTrack" ? "In band" : "Out of band" },
    );
  } else if (goal.target_weight_lb != null) {
    rows.push(
      { key: "target", label: "Target weight", help: "Where the goal ends", value: lb1(goal.target_weight_lb), unit: "lb" },
      { key: "progress", label: "Progress", help: "Share of the distance covered", value: summary.value, unit: summary.valueUnit },
      { key: "left", label: "Remaining", help: "Trend weight to target", value: current ? signed(goal.target_weight_lb - current.value) : "—", unit: "lb" },
    );
  } else {
    rows.push(
      { key: "pace", label: "Pace", help: "Achieved since the goal began", value: moved != null && days > 0 ? signed((moved / days) * 7, 2) : "—", unit: "lb/wk" },
    );
  }

  const refLines = [];
  if (goal.goal_kind === "maintain" && baselinePoint) {
    refLines.push(
      { key: "hi", label: `+${MAINTENANCE_BAND_LB} lb`, color: C.amber, value: baselinePoint.value + MAINTENANCE_BAND_LB },
      { key: "start", label: "Start", color: C.good, value: baselinePoint.value },
      { key: "lo", label: `−${MAINTENANCE_BAND_LB} lb`, color: C.amber, value: baselinePoint.value - MAINTENANCE_BAND_LB },
    );
  } else if (goal.target_weight_lb != null) {
    refLines.push({ key: "target", label: "Target", color: C.good, value: goal.target_weight_lb });
  }

  return (
    <>
      {/* SUMMARY FIELDS */}
      <Fields rows={rows} />

      {/* TREND AGAINST THE GOAL */}
      {trend.length >= 2 && (
        <div className="insight-section">
          <InsightLineChart
            title="Trend weight"
            startDate={chartStart}
            endDate={data.end_date}
            series={[{ key: "trend", label: "Trend", color: C.weight, kind: "line", points: trend }]}
            refLines={refLines}
            format={lb1}
            unit="lb"
            minSpan={WEIGHT_CHART_MIN_SPAN_LB}
          />
        </div>
      )}

      {/* SOURCE NOTE */}
      <p className="nutr-detail-note">
        Measured on trend weight, not single weigh-ins. The chart starts at {shortDate(chartStart)}
        {chartStart === goalStart ? ", when the goal began" : ""}. Goals are changed in the <Link className="nutr-detail-link" href="/modules/forage/ui/strategy">strategy menu</Link>.
      </p>
    </>
  );
}
