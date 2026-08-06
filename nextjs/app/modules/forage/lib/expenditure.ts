import { TrainingKind } from '../types/program';
import { ExpenditureMethod } from '../types/expenditure';
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
// A least-squares slope over the window's weigh-ins (not raw endpoints) absorbs
// day-to-day water/scale noise. When there isn't enough clean data to trust the
// balance (too few complete logged days or too short a weigh-in span) we fall
// back to the coarse bodyweight formula so brand-new users still get a number.

const WINDOW_DAYS = 28;
// Partial-log days (forgot dinner) under-state intake and would inflate the
// derived TDEE, so they're dropped from the intake mean and complete-day count.
// "Partial" is judged per-user: below half the user's median logged day, but
// never counting a day under an absolute floor as complete regardless.
const ABS_PARTIAL_FLOOR_KCAL = 800;
const REL_PARTIAL_FRACTION = 0.5;
const MIN_COMPLETE_DAYS = 10;
const MIN_WEIGH_INS = 3;
// Need a wide-enough span between first and last weigh-in for the slope to mean
// anything — a week of scale jitter isn't a trend.
const MIN_WEIGH_SPAN_DAYS = 14;
// Half-width of the centered moving average applied to the daily weight series
// before the slope is fitted (±3 days ⇒ a 7-day window).
const TREND_SMOOTH_HALF_WINDOW_DAYS = 3;
// Physiological sanity band on the final number, guarding against a bad slope
// (e.g. a single freak weigh-in the regression can't fully smooth).
const TDEE_MIN_KCAL = 1200;
const TDEE_MAX_KCAL = 6000;

export interface ExpenditureEstimate {
  expenditure_kcal: number;
  method: ExpenditureMethod;
  // Debug/UI context: how the adaptive number was arrived at (all null on the
  // formula fallback except window_days).
  logged_days: number | null; // complete logged days used for the intake mean
  weigh_ins: number | null; // weigh-ins in the window
  avg_intake_kcal: number | null;
  weight_trend_lb_per_week: number | null;
  window_days: number;
  // The stretch both series were narrowed to before the balance was taken —
  // null on the formula fallback. Surfaced so a surprising number can be
  // explained ("this was measured over 07-03 → 07-17") rather than guessed at.
  balance_start_date: string | null;
  balance_end_date: string | null;
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
    window_days: WINDOW_DAYS,
    balance_start_date: null,
    balance_end_date: null,
  };
}

// Least-squares slope of ys against xs (null when every x is identical).
function leastSquaresSlope(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  return den === 0 ? null : num / den;
}

// Weight trend in lb/day, fitted to a SMOOTHED daily series rather than to the
// raw weigh-ins. Fitting the raw points lets one noisy scale reading at the far
// end of the window dominate the fit (highest leverage sits at the extremes of
// the x-range), which is how a single high morning can flip the trend sign and
// swing the derived TDEE by hundreds of kcal. Two steps fix that:
//
//   1. Linearly interpolate between weigh-ins to one value per day, so an
//      irregular logging cadence (three days in a row, then a nine-day gap)
//      stops silently weighting the clustered days more heavily.
//   2. Take a CENTERED moving average of that daily series. Centered, not
//      exponential, on purpose: an EMA lags its input, and fitting a lagged
//      series flattens the slope — a systematic bias that would drag every
//      estimate toward avgIntake. A centered mean of a straight line sits
//      exactly on that line, so a real trend survives the smoothing intact.
//
// Edge windows are necessarily lop-sided (there's no data past the ends), so
// each smoothed point is fitted at the MEAN x of the days actually averaged
// instead of at the window's center — which keeps the "straight line in ⇒ same
// slope out" property true at the edges too.
function smoothedTrendLbPerDay(weighIns: { log_date: string; weight_lb: number }[]): number | null {
  const startIso = weighIns[0].log_date;
  const xs = weighIns.map((w) => dayDiff(startIso, w.log_date));
  const ys = weighIns.map((w) => w.weight_lb);
  const lastDay = xs[xs.length - 1];

  // One interpolated weight per day across the span.
  const daily: number[] = [];
  for (let day = 0; day <= lastDay; day++) {
    let i = 0;
    while (i < xs.length - 2 && xs[i + 1] <= day) i++;
    const fraction = (day - xs[i]) / (xs[i + 1] - xs[i]);
    daily.push(ys[i] + fraction * (ys[i + 1] - ys[i]));
  }

  const half = TREND_SMOOTH_HALF_WINDOW_DAYS;
  const smoothedX: number[] = [];
  const smoothedY: number[] = [];
  for (let day = 0; day < daily.length; day++) {
    const lo = Math.max(0, day - half);
    const hi = Math.min(daily.length - 1, day + half);
    let sumX = 0;
    let sumY = 0;
    for (let k = lo; k <= hi; k++) {
      sumX += k;
      sumY += daily[k];
    }
    const count = hi - lo + 1;
    smoothedX.push(sumX / count);
    smoothedY.push(sumY / count);
  }

  return leastSquaresSlope(smoothedX, smoothedY);
}

export async function estimateExpenditure(
  userId: string,
  opts: {
    trainingKind: TrainingKind;
    latestWeightLb: number | null;
    todayIso?: string;
  },
): Promise<ExpenditureEstimate> {
  const today = opts.todayIso ?? todayIsoLocal();
  const startIso = shiftDateIso(today, -(WINDOW_DAYS - 1));

  // Pull the trailing window's data in parallel: per-day logged calories (gaps
  // omitted) and every weigh-in since the window start.
  const [kcalSeries, weights] = await Promise.all([
    getNutrientDailySeries(userId, 'kcal', startIso, today),
    listWeights(userId, startIso),
  ]);

  // Intake: average over COMPLETE logged days only. A day counts as complete
  // when it clears both an absolute floor and half the user's median logged day
  // — so a genuine light day for a small eater isn't mistaken for a partial log,
  // while an obvious forgot-dinner day for a big eater is.
  const loggedVals = kcalSeries.map((p) => p.value).filter((v) => v > 0);
  const median = medianOf(loggedVals);
  const completenessFloor = Math.max(ABS_PARTIAL_FLOOR_KCAL, REL_PARTIAL_FRACTION * median);
  const allCompleteDays = kcalSeries.filter((p) => p.value >= completenessFloor);
  const sortedW = [...weights].sort((a, b) => (a.log_date < b.log_date ? -1 : 1));
  if (allCompleteDays.length === 0 || sortedW.length === 0) {
    return formulaEstimate(opts.latestWeightLb, opts.trainingKind);
  }

  // Align the two series before taking the balance. Σintake − TDEE·days =
  // Δbody-energy only holds when both sides describe the SAME stretch of time,
  // and intake and weigh-ins are logged independently, so their coverage rarely
  // lines up on its own. Left unaligned this quietly corrupts the estimate:
  // stop logging food for a week while still stepping on the scale and that
  // week's weight change gets charged against an intake mean that never saw it
  // (a few pounds of holiday water can knock ~300 kcal off the estimate);
  // logged days before the first weigh-in are uncovered the same way in reverse.
  // Narrowing BOTH series to their overlap is the honest reading — and when the
  // overlap is too thin to trust, the formula fallback below says "not enough
  // data" instead of inventing a number from mismatched halves.
  const balanceStart = maxIso(allCompleteDays[0].date, sortedW[0].log_date);
  const balanceEnd = minIso(
    allCompleteDays[allCompleteDays.length - 1].date,
    sortedW[sortedW.length - 1].log_date,
  );
  const inBalanceWindow = (iso: string) => iso >= balanceStart && iso <= balanceEnd;

  const completeDays = allCompleteDays.filter((p) => inBalanceWindow(p.date));
  const balanceWeights = sortedW.filter((w) => inBalanceWindow(w.log_date));
  if (completeDays.length < MIN_COMPLETE_DAYS || balanceWeights.length < MIN_WEIGH_INS) {
    return formulaEstimate(opts.latestWeightLb, opts.trainingKind);
  }
  const avgIntake =
    completeDays.reduce((s, p) => s + p.value, 0) / completeDays.length;

  // Weight trend across that same window. Require a wide-enough span for the
  // slope to be meaningful — a week of scale jitter isn't a trend.
  const spanDays = dayDiff(
    balanceWeights[0].log_date,
    balanceWeights[balanceWeights.length - 1].log_date,
  );
  if (spanDays < MIN_WEIGH_SPAN_DAYS) {
    return formulaEstimate(opts.latestWeightLb, opts.trainingKind);
  }
  const slopeLbPerDay = smoothedTrendLbPerDay(balanceWeights);
  if (slopeLbPerDay === null) {
    return formulaEstimate(opts.latestWeightLb, opts.trainingKind);
  }
  const slopeKgPerDay = slopeLbPerDay / LB_PER_KG;

  // Energy balance: eating avgIntake while the trend moves slopeKgPerDay ⇒ the
  // difference must be expenditure. A downward trend (negative slope) means TDEE
  // exceeds intake, so it ADDS to the estimate.
  const tdee = clamp(avgIntake - slopeKgPerDay * KCAL_PER_KG_MASS, TDEE_MIN_KCAL, TDEE_MAX_KCAL);

  return {
    expenditure_kcal: round(tdee),
    method: 'adaptive',
    logged_days: completeDays.length,
    weigh_ins: balanceWeights.length,
    avg_intake_kcal: round(avgIntake),
    weight_trend_lb_per_week: Math.round(slopeLbPerDay * 7 * 100) / 100,
    window_days: WINDOW_DAYS,
    balance_start_date: balanceStart,
    balance_end_date: balanceEnd,
  };
}
