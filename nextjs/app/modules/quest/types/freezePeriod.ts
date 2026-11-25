import { gambleWeekStart } from '../lib/gambleConfig';

// A FreezePeriod is the span of days a user's freeze limit counts over
export enum FreezePeriod {
  week = 0, // The quest week, starting on the user's week start day
  month = 1,
  year = 2,
}

export const DEFAULT_IS_FREEZE_LIMITED = false;
export const DEFAULT_FREEZE_LIMIT = 2;
export const DEFAULT_FREEZE_PERIOD = FreezePeriod.month;
export const FREEZE_LIMIT_MAX = 366; // Matches CK_quest_settings_freeze_limit

export const FREEZE_PERIOD_LABELS: Record<FreezePeriod, string> = {
  [FreezePeriod.week]: 'Quest week',
  [FreezePeriod.month]: 'Month',
  [FreezePeriod.year]: 'Year',
};

// Read a stored or sent period, falling back to the default for anything unknown
export function normalizeFreezePeriod(value: unknown): FreezePeriod {
  const numeric = Number(value);
  return numeric === FreezePeriod.week || numeric === FreezePeriod.month || numeric === FreezePeriod.year
    ? numeric
    : DEFAULT_FREEZE_PERIOD;
}

// Find the first and last day of the freeze period holding a date
export function freezePeriodRange(dateYMD: string, period: FreezePeriod, weekStartDay: number): { from: string; to: string } {
  const [year, month] = dateYMD.split('-').map(Number);
  if (period === FreezePeriod.week) {
    const from = gambleWeekStart(dateYMD, weekStartDay);
    const end = new Date(`${from}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 6);
    return { from, to: end.toISOString().slice(0, 10) };
  }
  if (period === FreezePeriod.month) {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate(); // Day 0 of the next month is this month's last day
    const paddedMonth = String(month).padStart(2, '0');
    return { from: `${year}-${paddedMonth}-01`, to: `${year}-${paddedMonth}-${String(lastDay).padStart(2, '0')}` };
  }
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}
