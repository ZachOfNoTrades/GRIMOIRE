// Shared time-range presets for every date-filtered surface (forage's nutrition
// pages, rune's deck study history). A preset resolves to an inclusive
// [startDate, endDate] pair of YYYY-MM-DD strings — the shape both the API query
// params and the client-side filters want.
//
// "today" collapses to a single day; "all" resolves to empty bounds (no filter at
// all, rather than a computed floor); "custom" defers to caller-supplied bounds,
// which may be empty until the user has picked both. Every other preset ends today.
//
// Golem's exercise history predates this and keeps its own HistoryRange in
// golem/utils/format.ts — same contract, a <select> instead of the segmented
// control, and a "1y" measured as 365 days rather than a calendar year.

export type DateRangePreset = "today" | "1w" | "1m" | "3m" | "6m" | "1y" | "all" | "custom";

// Short labels — the selector renders these as a compact segmented control, so the
// presets stay on one row on a narrow phone.
const DATE_RANGE_LABELS: Record<DateRangePreset, string> = {
  today: "Today",
  "1w": "1W",
  "1m": "1M",
  "3m": "3M",
  "6m": "6M",
  "1y": "1Y",
  all: "All",
  custom: "Custom",
};

export interface DateRangeOption {
  value: DateRangePreset;
  label: string;
}

// Build a selector's option list. Each surface picks the presets that suit it —
// a nutrition page starts at "Today", a study history at "All" — while the labels
// stay identical everywhere.
export function dateRangeOptions(presets: DateRangePreset[]): DateRangeOption[] {
  return presets.map((value) => ({ value, label: DATE_RANGE_LABELS[value] }));
}

// A date's calendar day in the VIEWER's timezone, as YYYY-MM-DD. Bounds are built
// with it, so client-side filters must compare against it too — a UTC-derived day
// would put an evening session on the wrong side of a boundary.
export function toLocalDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Turn a preset (+ optional custom bounds) into inclusive start/end dates.
// "custom" passes the caller's bounds straight through; the caller is responsible
// for waiting until both are set before fetching or filtering.
export function getDateRangeBounds(
  preset: DateRangePreset,
  customStartDate: string = "",
  customEndDate: string = "",
): { startDate: string; endDate: string } {
  if (preset === "custom") return { startDate: customStartDate, endDate: customEndDate };
  if (preset === "all") return { startDate: "", endDate: "" };

  const today = new Date();
  const end = toLocalDateString(today);
  if (preset === "today") return { startDate: end, endDate: end };

  const start = new Date(today);
  // "1 Week" is the last 7 days inclusive of today (today minus 6).
  if (preset === "1w") start.setDate(start.getDate() - 6);
  if (preset === "1m") start.setMonth(start.getMonth() - 1);
  if (preset === "3m") start.setMonth(start.getMonth() - 3);
  if (preset === "6m") start.setMonth(start.getMonth() - 6);
  if (preset === "1y") start.setFullYear(start.getFullYear() - 1);
  return { startDate: toLocalDateString(start), endDate: end };
}
