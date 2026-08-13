// Shape checks for the date/time a diary entry is filed under, shared by the
// entries POST (log/copy) and PUT (edit/move) routes.
//
// These exist because `mssql` hands a bad string straight to SQL Server, which
// then either throws (a 500 the user reads as "the app is broken") or silently
// coerces it — an empty entry_time used to convert to midnight, so a blank time
// field quietly re-filed the entry at 00:00. Both are validation problems, so
// they belong in the API layer as a 400, per the repo's API/Lib error contract.

// Real clock times only — the loose /^\d{2}:\d{2}/ shape this replaced accepted
// "25:99", which reached SQL Server and 500'd on conversion.
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const ENTRY_TIME_ERROR = 'entry_time must be HH:MM or HH:MM:SS';
export const ENTRY_DATE_ERROR = 'entry_date must be a real date as YYYY-MM-DD';

// A blank/whitespace string is NOT a valid time — callers that mean "leave the
// existing time alone" omit the key or send null, they don't send "".
export function isValidEntryTime(value: unknown): boolean {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

// Rejects both the wrong shape ("not-a-date") and impossible calendar dates
// ("2026-13-45"), which SQL Server would otherwise throw a conversion error on.
export function isValidEntryDate(value: unknown): boolean {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  // Round-tripping catches overflow (Feb 30 becomes Mar 2) and year 0000.
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day &&
    year >= 1900
  );
}
