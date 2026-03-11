// Convert total seconds to "HH:MM:SS" string
export function secondsToHHMMSS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Parse "HH:MM:SS" string to total seconds
export function hhmmssToSeconds(value: string): number {
  const parts = value.split(":").map((s) => parseInt(s) || 0);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const paddedHours = hours === 0 ? "00" : String(hours);
  return `${paddedHours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// "Thursday, February 26, 2026"
export function formatDateLong(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// "Thu, Feb 26"
export function formatDateShort(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// "Thu, Feb 26, 2026"
export function formatDateShortWithYear(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// "Thu, Feb 26, 2026, 3:45:12 PM"
export function formatTimestamp(date: Date): string {
  return new Date(date).toLocaleString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

// "(3d ago) 2026-03-01"
export function formatLastUsed(date: Date | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let relative: string;
  if (diffDays === 0) relative = "Today";
  else if (diffDays === 1) relative = "1d ago";
  else if (diffDays < 7) relative = `${diffDays}d ago`;
  else if (diffDays < 30) relative = `${Math.floor(diffDays / 7)}w ago`;
  else if (diffDays < 365) relative = `${Math.floor(diffDays / 30)}mo ago`;
  else relative = `${Math.floor(diffDays / 365)}y ago`;

  return `(${relative}) ${dateStr}`;
}

// "2026-03-03 3:45 PM"
export function formatDateTimeShort(date: Date): string {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${yyyy}-${mm}-${dd} ${time}`;
}

// "Workout - Mar 4, 2026"
export function formatSessionName(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `Workout - ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

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
