// Shared time-range options for the forage nutrition pages (mirrors golem's
// history-range pattern). A range resolves to an inclusive [startDate, endDate]
// pair of YYYY-MM-DD strings. "today" collapses to a single day; "custom" defers
// to the caller-supplied bounds (possibly empty until both are picked); every
// other preset ends today.

export type NutritionRange = "today" | "1w" | "1m" | "3m" | "1y" | "custom";

// Short labels — the selector renders these as a compact segmented control, so
// the presets stay on one row on a narrow phone.
export const NUTRITION_RANGE_OPTIONS: { value: NutritionRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "1w", label: "1W" },
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "1y", label: "1Y" },
  { value: "custom", label: "Custom" },
];

function toDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Turn a range (+ optional custom bounds) into inclusive start/end query params.
// "custom" passes the caller's bounds straight through; the caller is responsible
// for waiting until both are set before fetching.
export function getNutritionRangeParams(
  range: NutritionRange,
  customStartDate: string = "",
  customEndDate: string = "",
): { startDate: string; endDate: string } {
  if (range === "custom") return { startDate: customStartDate, endDate: customEndDate };
  const today = new Date();
  const end = toDateString(today);
  if (range === "today") return { startDate: end, endDate: end };
  const start = new Date(today);
  // "1 Week" is the last 7 days inclusive of today (today minus 6).
  if (range === "1w") start.setDate(start.getDate() - 6);
  if (range === "1m") start.setMonth(start.getMonth() - 1);
  if (range === "3m") start.setMonth(start.getMonth() - 3);
  if (range === "1y") start.setFullYear(start.getFullYear() - 1);
  return { startDate: toDateString(start), endDate: end };
}
