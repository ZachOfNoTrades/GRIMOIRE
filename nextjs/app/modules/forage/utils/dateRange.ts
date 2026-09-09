// Nutrition-page range filtering. The presets and the preset→dates resolver are
// the app-wide ones in lib/dateRange (shared with rune's deck study history);
// what stays here is the window-cache keying, which is specific to these pages
// refetching a whole payload per selected window.

import { DateRangePreset, dateRangeOptions, getDateRangeBounds } from "@/lib/dateRange";

// The nutrition pages offer every preset except "all": these views average a
// bounded window, and an unbounded one has no meaningful per-day average.
export type NutritionRange = DateRangePreset;

export const NUTRITION_RANGE_OPTIONS = dateRangeOptions(["today", "1w", "1m", "3m", "1y", "custom"]);

// Inclusive start/end query params for the selected window. "custom" passes the
// caller's bounds straight through; the caller waits until both are set.
export function getNutritionRangeParams(
  range: NutritionRange,
  customStartDate: string = "",
  customEndDate: string = "",
): { startDate: string; endDate: string } {
  return getDateRangeBounds(range, customStartDate, customEndDate);
}

// ─── WINDOW KEYS ───
// A selected range collapses to one cache key so its payload can be kept and
// re-served instantly on re-selection (see lib/useWindowCache). The key carries
// the resolved bounds plus whether the view is a single day or a multi-day
// average, because those read differently even when the bounds coincide ("Today"
// vs a one-day custom range).

export function windowKeyFor(range: NutritionRange, startDate: string, endDate: string): string {
  return `${range === "today" ? "day" : "range"}|${startDate}|${endDate}`;
}

export function parseWindowKey(key: string): { isRange: boolean; startDate: string; endDate: string } {
  const [mode, startDate = "", endDate = ""] = key.split("|");
  return { isRange: mode === "range", startDate, endDate };
}

// Every preset's resolved window, in selector order (narrowest span first, the
// 1-year window last) — the background warm-up list for a range-filtered page.
// "custom" is excluded: its bounds only exist once the user picks them.
export function presetWindowKeys(): string[] {
  return NUTRITION_RANGE_OPTIONS
    .filter((o) => o.value !== "custom")
    .map((o) => {
      const { startDate, endDate } = getNutritionRangeParams(o.value);
      return windowKeyFor(o.value, startDate, endDate);
    });
}
