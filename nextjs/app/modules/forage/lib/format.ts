// Format a logged amount for display: trim to ≤2 decimals and drop trailing zeros,
// so "100" stays "100" and "1.50" shows as "1.5".
export function fmtAmount(n: number): string {
  if (!Number.isFinite(n)) return "1";
  return String(Math.round(n * 100) / 100);
}
