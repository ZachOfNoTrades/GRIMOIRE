// Shared between the dashboard's server preload (page.tsx) and its client
// fallback fetch (HomeClient.tsx), so both load the same windows.

import { ExpenditureSummary } from "../../types/expenditure";
import { Goal } from "../../types/goal";
import { WeightEntry } from "../../types/weight";

// How many body-fat readings the Visual Body Fat card plots. Matches the Scale
// Weight card's 7-point sparkline, but counted in readings rather than days.
export const BODY_FAT_CARD_POINTS = 7;

// Trailing days of weigh-ins and logged dates the history cards read (today
// inclusive).
export const HISTORY_DAYS = 30;

// Days of weigh-ins fetched before the active goal began, so the goal card's
// smoothed baseline has settled by the goal's start.
export const GOAL_WEIGHT_LEAD_DAYS = 30;

// The history-derived data the dashboard's first paint needs beyond the day/week
// macros and nutrition config.
export interface DashboardPreload {
  weightHistory: WeightEntry[];
  bodyFatHistory: WeightEntry[];
  activeDates: string[];
  expenditure: ExpenditureSummary | null;
  goal: Goal | null;
  goalWeightHistory: WeightEntry[];
}
