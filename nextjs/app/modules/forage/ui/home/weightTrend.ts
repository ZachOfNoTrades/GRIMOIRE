import { WeightEntry } from "../../types/weight";
import { shiftDate } from "../_diary";

/* ─── WEIGHT TREND NORMALIZATION ───
   The scale is noisy — a pound of water morning-to-morning is routine and says
   nothing about body composition. The dashboard took the raw series at face
   value twice over: it showed the LAST weigh-in as the "trend" (one heavy
   morning redrew the card), and its sparkline normalized to the series' own
   min/max, so a 0.3 lb wobble was drawn at the card's full height and read as a
   cliff. Both are fixed by normalizing through a tolerance:

     • the value is an exponentially-smoothed trend weight over a per-day
       series, and its change reads "steady" while it stays inside tolerance;
     • the plot's y-range is floored (normalizedDomain below), so movement
       smaller than the noise band renders flat instead of filling the card.

   Smoothing is exponential here, unlike the centered mean lib/expenditure.ts
   fits its slope to. A centered window has no future days at the last point —
   which is exactly the point this displays — and the lag an EMA carries is the
   wanted behaviour for a displayed trend weight, not a bias to correct for. */

// A move smaller than this is scale noise, not a change in weight.
export const WEIGHT_TOLERANCE_LB = 0.5;
// Floor on a weight sparkline's plotted range (4× tolerance): noise stays
// visibly flat while a real week's movement still fills most of the card.
export const WEIGHT_CHART_MIN_SPAN_LB = 2;
// EMA span in days; alpha = 2 / (span + 1).
const TREND_SPAN_DAYS = 7;

export interface WeightTrendSummary {
  // Smoothed weight as of the last weigh-in (null when there are none).
  current: number | null;
  // Change in the smoothed weight across the window (null with under 2 days).
  change: number | null;
  // True when `change` sits inside the tolerance band — i.e. flat, not a move.
  isSteady: boolean;
  // Smoothed value per day across the window, oldest first — the sparkline.
  series: number[];
}

// Whole days between two yyyy-mm-dd dates (b − a).
function dayDiff(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split("-").map(Number);
  const [by, bm, bd] = bIso.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// One weigh-in per date, oldest first. Same-day entries are averaged rather
// than dropped, which also keeps the interpolation below from dividing by a
// zero-day gap.
function dailyWeighIns(weighIns: WeightEntry[]): { date: string; weightLb: number }[] {
  const byDate = new Map<string, { sum: number; count: number }>();
  for (const weighIn of weighIns) {
    const bucket = byDate.get(weighIn.log_date) ?? { sum: 0, count: 0 };
    bucket.sum += weighIn.weight_lb;
    bucket.count += 1;
    byDate.set(weighIn.log_date, bucket);
  }
  return [...byDate.entries()]
    .map(([date, bucket]) => ({ date, weightLb: bucket.sum / bucket.count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* Weigh-ins → one exponentially-smoothed value per calendar day across the
   logged span. Gaps are linearly interpolated to a daily value first, so an
   irregular cadence (three days running, then a nine-day gap) stops silently
   weighting the clustered days more heavily than the sparse ones. */
export function weightTrendSeries(weighIns: WeightEntry[]): { date: string; value: number }[] {
  const points = dailyWeighIns(weighIns);
  if (points.length === 0) return [];
  const startIso = points[0].date;
  const offsets = points.map((p) => dayDiff(startIso, p.date));
  const weights = points.map((p) => p.weightLb);
  const lastOffset = offsets[offsets.length - 1];

  // INTERPOLATED DAILY SERIES
  const daily: number[] = [];
  for (let day = 0; day <= lastOffset; day++) {
    if (points.length === 1) {
      daily.push(weights[0]);
      continue;
    }
    let i = 0;
    while (i < offsets.length - 2 && offsets[i + 1] <= day) i++;
    const fraction = (day - offsets[i]) / (offsets[i + 1] - offsets[i]);
    daily.push(weights[i] + fraction * (weights[i + 1] - weights[i]));
  }

  // EXPONENTIAL SMOOTHING
  const alpha = 2 / (TREND_SPAN_DAYS + 1);
  let smoothed = daily[0];
  return daily.map((value, day) => {
    if (day > 0) smoothed += alpha * (value - smoothed);
    return { date: shiftDate(startIso, day), value: smoothed };
  });
}

/* Trend weight and its tolerance-aware change over the trailing `windowDays`
   days of the smoothed series. */
export function weightTrendSummary(weighIns: WeightEntry[], windowDays: number): WeightTrendSummary {
  const window = weightTrendSeries(weighIns).slice(-windowDays);
  if (window.length === 0) {
    return { current: null, change: null, isSteady: false, series: [] };
  }
  const current = window[window.length - 1].value;
  const change = window.length > 1 ? current - window[0].value : null;
  return {
    current,
    change,
    isSteady: change != null && Math.abs(change) <= WEIGHT_TOLERANCE_LB,
    series: window.map((point) => point.value),
  };
}

/* Y-domain for a sparkline, widened to at least `minSpan` around the series
   midpoint. Without a floor every chart is drawn edge-to-edge whatever its
   actual range, so noise and a real trend look identical. */
export function normalizedDomain(values: number[], minSpan?: number): { min: number; max: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!minSpan || max - min >= minSpan) return { min, max };
  const mid = (min + max) / 2;
  return { min: mid - minSpan / 2, max: mid + minSpan / 2 };
}
