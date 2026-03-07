export type HistoryRange = "6m" | "1y" | "all" | "custom";

// Converts a range key into startDate/endDate query params.
// "all" and "custom" return empty strings (custom is handled by the caller).
export function getDateRangeParams(range: HistoryRange): { startDate: string; endDate: string } {
  if (range === "all" || range === "custom") return { startDate: "", endDate: "" };

  const today = new Date();
  const start = new Date(today);
  if (range === "6m") start.setMonth(start.getMonth() - 6);
  if (range === "1y") start.setDate(start.getDate() - 365);

  return {
    startDate: toDateString(start),
    endDate: toDateString(today),
  };
}

function toDateString(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
