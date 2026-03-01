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
