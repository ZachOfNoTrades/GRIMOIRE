// Client-safe shape of GET /modules/forage/api/insights — the one payload behind
// the dashboard's insight detail pages (expenditure, weight trend, energy
// balance, goal) for a date range.

import { ExpenditureSummary } from './expenditure';
import { Goal } from './goal';
import { WeightEntry } from './weight';
import { NutrientDailyPoint } from './food';

export type InsightMetric = 'expenditure' | 'weight-trend' | 'energy-balance' | 'goal';

export const INSIGHT_METRICS: InsightMetric[] = ['expenditure', 'weight-trend', 'energy-balance', 'goal'];

export interface InsightsPayload {
  start_date: string;
  end_date: string;
  // Logged calories per day in the range; days with nothing logged are absent.
  intake: NutrientDailyPoint[];
  // Ascending by date. Starts up to 30 days before the range (and before the
  // goal's start) so a smoothed trend is settled by the first day shown.
  weigh_ins: WeightEntry[];
  // Today's estimate, with `daily` narrowed to the range.
  expenditure: ExpenditureSummary;
  // The calorie target in force on every date of the range (null before any).
  targets: { date: string; kcal: number | null }[];
  goal: Goal | null;
}
