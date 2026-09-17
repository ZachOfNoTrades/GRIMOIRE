import { TrainingKind } from '../types/program';
import { ExpenditureHorizon, ExpenditureMethod } from '../types/expenditure';
import {
  KCAL_PER_KG_MASS,
  LB_PER_KG,
  lbToKg,
  naiveMaintenanceKcal,
  todayIsoLocal,
} from './program';
import { listWeights } from './weightFunctions';
import { getNutrientDailySeries } from './entryFunctions';

// Data-derived expenditure (TDEE). The old model pegged maintenance at a flat
// 30 kcal/kg × training-multiplier, which systematically mis-estimates anyone
// whose real activity differs from that coarse rule. This estimates expenditure
// the MacroFactor way — from the ENERGY BALANCE the user actually demonstrated:
//
//   over a trailing window,  Σintake − TDEE·days = Δbody-energy
//   ⇒  TDEE = avgDailyIntake − (weight-trend slope in kg/day) × 7,700 kcal/kg
//
// The weight side is read off a smoothed daily curve (not raw weigh-ins), which
// absorbs day-to-day water/scale noise, and only across stretches where intake
// was actually logged (see MAX_UNLOGGED_GAP_DAYS). When there isn't enough clean data to trust the
// balance we fall back to the coarse bodyweight formula so brand-new users still
// get a number.
//
// THE ESTIMATE IS NOT ONE WINDOW. Measuring the balance over a single fixed
// window makes the number an artifact of that window's length: on 2026-08-22 the
// same data read 2,287 kcal over 28 days and 2,635 over 56. Worse, a single
// window has no memory — every estimate is computed fresh, so as the window
// slides, one heavy logged day dropping off the back moves the answer hundreds
// of kcal with nothing about the user having changed. Observed 2026-08-16 →
// 08-17: a 407 kcal step in one calendar day, purely because the intake/weigh-in
// overlap relocated. On a `maintain` goal the target IS this number, so that
// lands on the user's budget 1:1 and the weekly check-in whipsaws.
//
// So the estimate is built in two layers:
//
//   1. BLEND ACROSS HORIZONS. The balance is measured at 28, 56 and 90 days and
//      combined, each horizon weighted by how much evidence it actually carries
//      (see observeHorizon). The long horizons are the "average expenditure over
//      time" anchor — they move slowly because most of their data is unchanged
//      week to week — while the short one keeps the estimate responsive to a
//      genuine shift. A sparse short window down-weights itself automatically
//      instead of shouting over horizons that saw more days.
//   2. SMOOTH ACROSS DAYS. The headline is the mean of that blend over the
//      trailing SMOOTH_DAYS. This is deliberately RECOMPUTED, not accumulated:
//      a stateful filter (prior + gain × residual) needs a seed and a warmup, and
//      this user's history has a three-month logging hole that leaves such a
//      filter stranded on a stale seed for months afterwards. Recomputing from
//      the raw series every time is stateless, needs no migration, and cannot
//      drift.
//
// Backtested over 200 days of real history, the two layers take the mean
// day-to-day movement of the estimate from 36 kcal to 7, the worst single-day
// step from 199 kcal to 31, and the number of days with no adaptive estimate at
// all from 154 to 44.

// Horizons the balance is measured over, shortest first. 28 is the responsive
// end (roughly one weigh-in cycle plus slack), 90 the anchor; 56 keeps the
// weighting from jumping between the two.
const HORIZON_DAYS = [28, 56, 90] as const;
const LONGEST_HORIZON_DAYS = HORIZON_DAYS[HORIZON_DAYS.length - 1];

// How many trailing days of the horizon blend the headline averages. 10 is long
// enough to absorb a single new weigh-in re-fitting every horizon's trend at
// once (the residual source of day-to-day movement once the blend is in place)
// and short enough that a real shift still shows up inside a check-in cycle.
const SMOOTH_DAYS = 10;

// How many trailing DAILY estimates the rolling series carries when a caller asks
// for one. Each point re-runs the whole blend-and-smooth over its own history
// ending that day, so the series shows how the estimate has been moving rather
// than one aggregate figure. 14 reads well in a sparkline-sized chart.
export const DAILY_SERIES_DAYS = 14;

// Partial-log days (forgot dinner) under-state intake and would inflate the
// derived TDEE, so they're dropped from the intake mean and complete-day count.
// "Partial" is judged per-user: below half the user's median logged day, but
// never counting a day under an absolute floor as complete regardless.
const ABS_PARTIAL_FLOOR_KCAL = 800;
const REL_PARTIAL_FRACTION = 0.5;

// Per-horizon data gates. These are deliberately looser than the single-window
// model's were (it demanded 10 complete days out of 28): a horizon that clears
// the bar only weakly gets a small blend weight rather than being the whole
// answer, so the cost of admitting it is bounded. What replaced the day count as
// the real gate is COVERAGE — see below.
const MIN_COMPLETE_DAYS = 6;
const MIN_WEIGH_INS = 3;
// Need a wide-enough span between first and last weigh-in for the slope to mean
// anything — a week of scale jitter isn't a trend.
const MIN_WEIGH_SPAN_DAYS = 14;

// The fraction of the balance window that must be covered by complete logged
// days. Σintake − TDEE·days = Δbody-energy needs intake for EVERY day of the
// span; the mean over logged days is only a stand-in for the unlogged ones. At
// 52% coverage (12 logged days of a 23-day window, this user in Aug 2026) half
// the intake side is an assumption, and because unlogged days skew heavy in
// practice the error is systematically DOWNWARD — the model charges real weight
// gain against an intake it never saw and concludes the user has a small TDEE.
// The old model had no coverage notion at all.
//
// 0.25 is a floor, not a target: below it the horizon is discarded outright,
// and between there and full coverage it scales the horizon's blend weight
// linearly, so a thinly-logged stretch nudges the estimate instead of setting
// it. A hard gate at a respectable coverage (0.7, say) was tried and rejected —
// this user logs ~50% of days in a normal month, so it would have frozen the
// estimate permanently rather than easing it.
const MIN_COVERAGE = 0.25;
// Coverage at which a horizon stops being penalised. Above this its weight is
// governed by the other quality terms.
const FULL_COVERAGE = 0.8;

// Saturation points for the remaining evidence terms — a horizon carrying at
// least this much data is not further rewarded for carrying more.
const AMPLE_COMPLETE_DAYS = 14;
const AMPLE_WEIGH_INS = 8;
const AMPLE_WEIGH_SPAN_DAYS = 21;

// Ceiling on how much of the estimate the weight-trend term may claim. A trend
// of 1.5 lb/wk already contributes ~750 kcal/day to the balance; anything past
// that, over the weeks these horizons span, is water and glycogen rather than
// tissue, and letting it through is how one heavy morning walks off with the
// estimate. Applied to the slope BEFORE the balance, so the reported trend is
// what was actually used.
const MAX_TREND_LB_PER_WEEK = 1.5;

// Half-width of the centered moving average applied to the daily weight series
// before it is read (±3 days ⇒ a 7-day window).
const TREND_SMOOTH_HALF_WINDOW_DAYS = 3;

// The balance is taken over LOGGED STRETCHES only, not across the whole window.
// A run of complete days separated by at most this many unlogged/partial days is
// one stretch; a longer gap splits it, and the weight that moved during the gap
// is left out of the balance along with the intake that caused it.
//
// Without this the window-wide slope charges every pound gained while nothing was
// logged against the mean of the days that were. On 2026-09-17 that was the whole
// story of a low estimate: 13 unlogged days (Aug 19–31) covered a 201 → 206 lb
// move, the model read it as a 0.81 lb/wk gain on 2,823 kcal/day and put
// expenditure at 2,420; the stretches on either side read 2,671 and 2,939 on
// their own. Gap-aware, the same history reads 2,701, with the same day-to-day
// stability (mean step 9 kcal, max 24, backtested over 60 days).
//
// 3 keeps a weekend off inside the stretch (its intake is taken to be the
// stretch's mean, as before) while a week off is excluded.
const MAX_UNLOGGED_GAP_DAYS = 3;
// A stretch shorter than this carries no usable weight change — the smoothed
// curve barely moves across it — so it would only pull the estimate toward
// intake. Dropped.
const MIN_STRETCH_DAYS = 3;
// Physiological sanity band on the final number, guarding against a bad slope
// (e.g. a single freak weigh-in the regression can't fully smooth).
const TDEE_MIN_KCAL = 1200;
const TDEE_MAX_KCAL = 6000;

// One day's estimate in the rolling series — the blend re-run over the history
// ENDING on that date. Days before enough data accumulated carry the formula
// fallback, so `method` travels with each point rather than only with the latest.
export interface ExpenditureDailyPoint {
  date: string;
  expenditure_kcal: number;
  method: ExpenditureMethod;
  // True when this day's own history couldn't support the balance model and the
  // point carries the previous adaptive estimate forward. See buildDailySeries
  // for why that beats letting the point drop to the bodyweight formula.
  carried: boolean;
}

export interface ExpenditureEstimate {
  expenditure_kcal: number;
  method: ExpenditureMethod;
  // Debug/UI context, taken from the horizon that carried the most weight in the
  // most recent blend (all null on the formula fallback except window_days and
  // smoothing_days).
  logged_days: number | null;
  weigh_ins: number | null;
  avg_intake_kcal: number | null;
  weight_trend_lb_per_week: number | null;
  // The dominant horizon's length. Not the only stretch the estimate saw — see
  // `horizons` for the full picture — but the one that shaped it most.
  window_days: number;
  coverage: number | null;
  // How many trailing days of the horizon blend the headline averaged.
  smoothing_days: number;
  // The stretch the dominant horizon's balance was taken over — null on the
  // formula fallback.
  balance_start_date: string | null;
  balance_end_date: string | null;
  // Every horizon that contributed to the latest blend, shortest first. Empty on
  // the formula fallback.
  horizons: ExpenditureHorizon[];
  // Trailing rolling estimates, oldest first. Empty unless the caller asked for
  // a series (see the dailySeriesDays option) — the wizards and check-in only
  // need the latest number, so they don't pay for the extra history.
  daily: ExpenditureDailyPoint[];
}

function shiftDateIso(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// Whole days between two yyyy-mm-dd dates (b − a).
function dayDiff(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split('-').map(Number);
  const [by, bm, bd] = bIso.split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}

// Zero-padded ISO dates compare correctly as plain strings.
const maxIso = (a: string, b: string) => (a > b ? a : b);
const minIso = (a: string, b: string) => (a < b ? a : b);

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);
const round2 = (n: number) => Math.round(n * 100) / 100;

// Median of an unsorted list (0 for empty). Even-length ⇒ mean of the two middle.
function medianOf(vals: number[]): number {
  if (vals.length === 0) return 0;
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function formulaEstimate(
  latestWeightLb: number | null,
  trainingKind: TrainingKind,
): ExpenditureEstimate {
  const weightKg = latestWeightLb != null ? lbToKg(latestWeightLb) : 70;
  return {
    expenditure_kcal: round(naiveMaintenanceKcal(weightKg, trainingKind)),
    method: 'formula',
    logged_days: null,
    weigh_ins: null,
    avg_intake_kcal: null,
    weight_trend_lb_per_week: null,
    window_days: HORIZON_DAYS[0],
    coverage: null,
    smoothing_days: SMOOTH_DAYS,
    balance_start_date: null,
    balance_end_date: null,
    horizons: [],
    daily: [],
  };
}

// The weight curve the balance reads, as one SMOOTHED value per calendar day
// from the first weigh-in to the last. Reading raw weigh-ins lets one noisy scale
// reading at a stretch boundary stand in for the whole stretch, which is how a
// single high morning can swing the derived TDEE by hundreds of kcal. Two steps
// fix that:
//
//   1. Linearly interpolate between weigh-ins to one value per day, so an
//      irregular logging cadence (three days in a row, then a nine-day gap)
//      stops silently weighting the clustered days more heavily.
//   2. Take a CENTERED moving average of that daily series. Centered, not
//      exponential, on purpose: an EMA lags its input, and reading a lagged
//      curve understates every stretch's weight change — a systematic bias that
//      would drag every estimate toward avgIntake. A centered mean of a straight
//      line sits exactly on that line, so a real trend survives the smoothing.
//
// Returns a lookup by date, clamped to the curve's ends.
function smoothedWeightCurve(
  weighIns: { log_date: string; weight_lb: number }[],
): (iso: string) => number {
  const startIso = weighIns[0].log_date;
  const xs = weighIns.map((w) => dayDiff(startIso, w.log_date));
  const ys = weighIns.map((w) => w.weight_lb);
  const lastDay = xs[xs.length - 1];

  // One interpolated weight per day across the span.
  const daily: number[] = [];
  for (let day = 0; day <= lastDay; day++) {
    if (xs.length === 1) {
      daily.push(ys[0]);
      continue;
    }
    let i = 0;
    while (i < xs.length - 2 && xs[i + 1] <= day) i++;
    const fraction = (day - xs[i]) / (xs[i + 1] - xs[i]);
    daily.push(ys[i] + fraction * (ys[i + 1] - ys[i]));
  }

  const half = TREND_SMOOTH_HALF_WINDOW_DAYS;
  const smoothed = daily.map((_, day) => {
    const lo = Math.max(0, day - half);
    const hi = Math.min(daily.length - 1, day + half);
    let sum = 0;
    for (let k = lo; k <= hi; k++) sum += daily[k];
    return sum / (hi - lo + 1);
  });

  return (iso: string) => smoothed[clamp(dayDiff(startIso, iso), 0, smoothed.length - 1)];
}

// Split complete days into logged stretches: a gap of more than
// MAX_UNLOGGED_GAP_DAYS between consecutive complete days starts a new stretch.
// Input ascending by date.
function loggedStretches(completeDays: { date: string; value: number }[]): { date: string; value: number }[][] {
  const stretches: { date: string; value: number }[][] = [];
  for (const day of completeDays) {
    const current = stretches[stretches.length - 1];
    if (current && dayDiff(current[current.length - 1].date, day.date) - 1 <= MAX_UNLOGGED_GAP_DAYS) {
      current.push(day);
    } else {
      stretches.push([day]);
    }
  }
  return stretches;
}

// The balance model for ONE horizon ending on `endIso`, plus the weight that
// horizon should carry in the blend. Pure — it takes the whole fetched series
// and narrows them itself, so the same code serves every horizon of every day of
// the rolling series without re-querying. Both inputs must be ascending by date.
// Returns null when the horizon's data can't support the balance at all.
function observeHorizon(
  kcalSeries: { date: string; value: number }[],
  sortedWeights: { log_date: string; weight_lb: number }[],
  endIso: string,
  horizonDays: number,
): ExpenditureHorizon | null {
  const windowStart = shiftDateIso(endIso, -(horizonDays - 1));
  const inWindow = (iso: string) => iso >= windowStart && iso <= endIso;
  const windowKcal = kcalSeries.filter((p) => inWindow(p.date));
  const windowWeights = sortedWeights.filter((w) => inWindow(w.log_date));

  // Intake: average over COMPLETE logged days only. A day counts as complete
  // when it clears both an absolute floor and half the user's median logged day
  // — so a genuine light day for a small eater isn't mistaken for a partial log,
  // while an obvious forgot-dinner day for a big eater is.
  const loggedVals = windowKcal.map((p) => p.value).filter((v) => v > 0);
  const median = medianOf(loggedVals);
  const completenessFloor = Math.max(ABS_PARTIAL_FLOOR_KCAL, REL_PARTIAL_FRACTION * median);
  const allCompleteDays = windowKcal.filter((p) => p.value >= completenessFloor);
  if (allCompleteDays.length === 0 || windowWeights.length === 0) return null;

  // Align the two series before taking the balance. Σintake − TDEE·days =
  // Δbody-energy only holds when both sides describe the SAME stretch of time,
  // and intake and weigh-ins are logged independently, so their coverage rarely
  // lines up on its own. Left unaligned this quietly corrupts the estimate:
  // stop logging food for a week while still stepping on the scale and that
  // week's weight change gets charged against an intake mean that never saw it
  // (a few pounds of holiday water can knock ~300 kcal off the estimate);
  // logged days before the first weigh-in are uncovered the same way in reverse.
  const balanceStart = maxIso(allCompleteDays[0].date, windowWeights[0].log_date);
  const balanceEnd = minIso(
    allCompleteDays[allCompleteDays.length - 1].date,
    windowWeights[windowWeights.length - 1].log_date,
  );
  const inBalanceWindow = (iso: string) => iso >= balanceStart && iso <= balanceEnd;

  const completeDays = allCompleteDays.filter((p) => inBalanceWindow(p.date));
  const balanceWeights = windowWeights.filter((w) => inBalanceWindow(w.log_date));
  const balanceDays = dayDiff(balanceStart, balanceEnd) + 1;
  const coverage = completeDays.length / balanceDays;
  if (
    completeDays.length < MIN_COMPLETE_DAYS ||
    balanceWeights.length < MIN_WEIGH_INS ||
    coverage < MIN_COVERAGE
  ) {
    return null;
  }

  // Require a wide-enough weigh-in span for a trend to mean anything — a week of
  // scale jitter isn't one.
  const weighSpanDays = dayDiff(
    balanceWeights[0].log_date,
    balanceWeights[balanceWeights.length - 1].log_date,
  );
  if (weighSpanDays < MIN_WEIGH_SPAN_DAYS) return null;
  const weightOn = smoothedWeightCurve(balanceWeights);
  const lastWeighIn = balanceWeights[balanceWeights.length - 1].log_date;

  // Per logged stretch: intake over its calendar days (short gaps inside it take
  // the stretch's own mean) and the smoothed weight change from its first
  // morning to the morning after its last day. Gaps between stretches contribute
  // neither side. See MAX_UNLOGGED_GAP_DAYS.
  let intakeKcal = 0;
  let stretchDays = 0;
  let weightChangeLb = 0;
  let stretchLoggedDays = 0;
  let stretchCount = 0;
  for (const stretch of loggedStretches(completeDays)) {
    const first = stretch[0].date;
    const last = stretch[stretch.length - 1].date;
    const days = dayDiff(first, last) + 1;
    if (days < MIN_STRETCH_DAYS) continue;
    const mean = stretch.reduce((s, p) => s + p.value, 0) / stretch.length;
    intakeKcal += mean * days;
    stretchDays += days;
    stretchLoggedDays += stretch.length;
    stretchCount++;
    weightChangeLb += weightOn(minIso(shiftDateIso(last, 1), lastWeighIn)) - weightOn(first);
  }
  if (stretchLoggedDays < MIN_COMPLETE_DAYS) return null;

  const slopeLbPerDay = clamp(
    weightChangeLb / stretchDays,
    -MAX_TREND_LB_PER_WEEK / 7,
    MAX_TREND_LB_PER_WEEK / 7,
  );
  const slopeKgPerDay = slopeLbPerDay / LB_PER_KG;
  const avgIntake = intakeKcal / stretchDays;

  // Energy balance: eating avgIntake while the trend moves slopeKgPerDay ⇒ the
  // difference must be expenditure. A downward trend (negative slope) means TDEE
  // exceeds intake, so it ADDS to the estimate.
  const tdee = clamp(avgIntake - slopeKgPerDay * KCAL_PER_KG_MASS, TDEE_MIN_KCAL, TDEE_MAX_KCAL);

  // How much this horizon should count for. Every term is a fraction of "as much
  // data as we'd want", so a horizon that saw a fully-logged, densely-weighed
  // stretch approaches 1 and a thin one lands near 0. Multiplicative rather than
  // averaged because these are all necessary conditions — a horizon with perfect
  // coverage but three weigh-ins two weeks apart is still a guess.
  const weight =
    Math.min(1, coverage / FULL_COVERAGE) *
    Math.min(1, stretchLoggedDays / AMPLE_COMPLETE_DAYS) *
    Math.min(1, balanceWeights.length / AMPLE_WEIGH_INS) *
    Math.min(1, weighSpanDays / AMPLE_WEIGH_SPAN_DAYS);
  if (weight <= 0) return null;

  return {
    horizon_days: horizonDays,
    expenditure_kcal: tdee,
    avg_intake_kcal: avgIntake,
    weight_trend_lb_per_week: slopeLbPerDay * 7,
    logged_days: stretchLoggedDays,
    weigh_ins: balanceWeights.length,
    coverage,
    stretches: stretchCount,
    balanced_days: stretchDays,
    balance_start_date: balanceStart,
    balance_end_date: balanceEnd,
    weight,
  };
}

interface HorizonBlend {
  expenditure_kcal: number;
  // Shortest horizon first; `weight` normalised to a share of the blend.
  parts: ExpenditureHorizon[];
  // The horizon that carried the most weight — what the summary fields report.
  dominant: ExpenditureHorizon;
}

// Every horizon's balance for one day, combined into a single number by evidence
// weight. Null when no horizon could produce an observation at all.
function blendHorizons(
  kcalSeries: { date: string; value: number }[],
  sortedWeights: { log_date: string; weight_lb: number }[],
  endIso: string,
): HorizonBlend | null {
  const parts = HORIZON_DAYS.map((h) => observeHorizon(kcalSeries, sortedWeights, endIso, h)).filter(
    (o): o is ExpenditureHorizon => o !== null,
  );
  if (parts.length === 0) return null;
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  if (totalWeight <= 0) return null;
  const expenditure = parts.reduce((s, p) => s + p.weight * p.expenditure_kcal, 0) / totalWeight;
  const normalised = parts.map((p) => ({ ...p, weight: p.weight / totalWeight }));
  const dominant = normalised.reduce((best, p) => (p.weight > best.weight ? p : best));
  return { expenditure_kcal: expenditure, parts: normalised, dominant };
}

// Turn the raw per-day estimates into a series that plots as ONE model.
//
// Even with the blend and the trailing mean, a day early enough in the history
// can have nothing to say at all, and charting the coarse bodyweight formula
// next to adaptive neighbours reads as a real swing in the user's metabolism
// when it is really just the model changing underfoot. Two rules keep the line
// honest:
//
//   1. LEADING formula days (before any adaptive estimate exists) are dropped —
//      the series simply starts where the balance model starts having something
//      to say. Nothing is invented to fill them.
//   2. INTERIOR formula days carry the previous adaptive estimate forward and are
//      flagged `carried`. A flat segment reads correctly: the estimate did not
//      update that day.
//
// A user with no adaptive estimate at all keeps the raw formula series, so a
// brand-new account still gets a line rather than an empty card.
function buildDailySeries(raw: ExpenditureDailyPoint[]): ExpenditureDailyPoint[] {
  if (!raw.some((p) => p.method === 'adaptive')) return raw;
  const series: ExpenditureDailyPoint[] = [];
  let lastAdaptive: number | null = null;
  for (const point of raw) {
    if (point.method === 'adaptive') {
      lastAdaptive = point.expenditure_kcal;
      series.push(point);
    } else if (lastAdaptive != null) {
      series.push({ ...point, expenditure_kcal: lastAdaptive, method: 'adaptive', carried: true });
    }
  }
  return series;
}

export async function estimateExpenditure(
  userId: string,
  opts: {
    trainingKind: TrainingKind;
    latestWeightLb: number | null;
    todayIso?: string;
    // Number of trailing DAILY estimates to compute alongside the headline one.
    // 0 (the default) keeps one number, for callers that render no chart. The
    // underlying history is fetched either way — the smoothing layer needs it —
    // so this only controls how much of the series is computed and returned.
    dailySeriesDays?: number;
  },
): Promise<ExpenditureEstimate> {
  const today = opts.todayIso ?? todayIsoLocal();
  const seriesDays = Math.max(0, opts.dailySeriesDays ?? 0);
  // Reach back far enough that the OLDEST day of the series still gets its full
  // smoothing window, and the oldest day of THAT window still gets its longest
  // horizon. Fetch the whole span once and slice it per horizon rather than
  // querying per day.
  const historyDays =
    LONGEST_HORIZON_DAYS + (SMOOTH_DAYS - 1) + Math.max(0, seriesDays - 1);
  const fetchStartIso = shiftDateIso(today, -(historyDays - 1));

  // Pull the span's data in parallel: per-day logged calories (gaps omitted) and
  // every weigh-in since the span start.
  const [kcalSeries, weights] = await Promise.all([
    getNutrientDailySeries(userId, 'kcal', fetchStartIso, today),
    listWeights(userId, fetchStartIso),
  ]);
  const sortedW = [...weights].sort((a, b) => (a.log_date < b.log_date ? -1 : 1));

  // Consecutive smoothing windows overlap by SMOOTH_DAYS − 1, and the series
  // walks a day at a time, so the same day's blend is asked for repeatedly.
  const blendCache = new Map<string, HorizonBlend | null>();
  const blendOn = (iso: string): HorizonBlend | null => {
    let cached = blendCache.get(iso);
    if (cached === undefined) {
      cached = blendHorizons(kcalSeries, sortedW, iso);
      blendCache.set(iso, cached);
    }
    return cached;
  };

  // The headline for the day ending on `endIso`: the mean of the horizon blend
  // over the trailing SMOOTH_DAYS, alongside the most recent blend in that
  // window (whose dominant horizon supplies the summary fields). Days inside the
  // window with no blend are skipped rather than treated as zero, so a gap
  // widens the effective averaging period instead of dragging the number down.
  const smoothedOn = (endIso: string): { kcal: number; latest: HorizonBlend } | null => {
    let sum = 0;
    let count = 0;
    let latest: HorizonBlend | null = null;
    for (let back = SMOOTH_DAYS - 1; back >= 0; back--) {
      const blend = blendOn(shiftDateIso(endIso, -back));
      if (!blend) continue;
      sum += blend.expenditure_kcal;
      count++;
      latest = blend;
    }
    return count > 0 && latest ? { kcal: sum / count, latest } : null;
  };

  const headline = smoothedOn(today);

  // Every point of the series is the same model re-run, so the chart and the big
  // number can never disagree about how the estimate is arrived at.
  const raw: ExpenditureDailyPoint[] = [];
  for (let daysBack = seriesDays - 1; daysBack >= 0; daysBack--) {
    const date = shiftDateIso(today, -daysBack);
    const point = daysBack === 0 ? headline : smoothedOn(date);
    raw.push({
      date,
      expenditure_kcal: point
        ? round(point.kcal)
        : formulaEstimate(opts.latestWeightLb, opts.trainingKind).expenditure_kcal,
      method: point ? 'adaptive' : 'formula',
      carried: false,
    });
  }
  const daily = buildDailySeries(raw);

  if (!headline) {
    return { ...formulaEstimate(opts.latestWeightLb, opts.trainingKind), daily };
  }

  const { dominant, parts } = headline.latest;
  return {
    expenditure_kcal: round(headline.kcal),
    method: 'adaptive',
    logged_days: dominant.logged_days,
    weigh_ins: dominant.weigh_ins,
    avg_intake_kcal: round(dominant.avg_intake_kcal),
    weight_trend_lb_per_week: round2(dominant.weight_trend_lb_per_week),
    window_days: dominant.horizon_days,
    coverage: round2(dominant.coverage),
    smoothing_days: SMOOTH_DAYS,
    balance_start_date: dominant.balance_start_date,
    balance_end_date: dominant.balance_end_date,
    horizons: parts.map((p) => ({
      ...p,
      expenditure_kcal: round(p.expenditure_kcal),
      avg_intake_kcal: round(p.avg_intake_kcal),
      weight_trend_lb_per_week: round2(p.weight_trend_lb_per_week),
      coverage: round2(p.coverage),
      weight: round2(p.weight),
    })),
    daily,
  };
}
