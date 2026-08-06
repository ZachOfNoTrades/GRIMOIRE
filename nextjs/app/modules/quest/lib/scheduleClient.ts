// Client-safe mirror of the PURE occurrence helpers in lib/taskFunctions.ts (isOccurrence /
// activeOccurrenceStart / isWindowSatisfied / occurrenceWindowEndingOn). taskFunctions.ts imports
// `mssql`, so it can't be pulled into a client bundle — this module duplicates only the pure
// scheduling math the calendar needs. Keep it in sync with the server copy.
//
// Each scheduled occurrence stays completable for window_days days; one completion in that span
// satisfies it (window_days = 1 ⇒ the scheduled day only).

import { Frequency, RepeatMode } from '../types/task';

// Minimal schedule shape — the subset of Task fields the cadence math reads.
export interface ScheduleShape {
  frequency: Frequency;
  days_of_week: string | null;
  every_n: number;
  start_date: string | null;
  // Monthly / yearly calendar anchor. Optional + null-tolerant: NULL reads as 'day_of_month'.
  repeat_mode?: RepeatMode | null;
  window_days: number;
  deferred_to_date?: string | null;
}

// Which <weekday> of its month a date is: the 1st..5th Monday, etc.
export function weekdayOrdinal(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

// Does `date` sit on the same monthly anchor as `start`? 'day_of_month' compares the day number;
// 'nth_weekday' compares (weekday, ordinal-within-month), so a month with no 5th <weekday> has no
// occurrence at all.
function matchesMonthAnchor(t: ScheduleShape, start: Date, date: Date): boolean {
  if (t.repeat_mode === 'nth_weekday') {
    return date.getDay() === start.getDay() && weekdayOrdinal(date) === weekdayOrdinal(start);
  }
  return date.getDate() === start.getDate();
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseYMD(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

export function addDays(s: string, n: number): string {
  const d = parseYMD(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

function windowDaysOf(t: ScheduleShape): number {
  const n = t.window_days ?? 1;
  return n >= 1 ? n : 1;
}

// Base-cadence occurrence test (no grace window, no deferred override).
function isOccurrenceRaw(t: ScheduleShape, dateYMD: string): boolean {
  const date = parseYMD(dateYMD);
  const everyN = t.every_n || 1;
  const startD = t.start_date ? parseYMD(t.start_date) : null;
  if (t.frequency === 'daily') {
    if (t.days_of_week) {
      const wd = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()];
      const allowed = t.days_of_week.split(',').map((s) => s.trim()).filter(Boolean);
      if (!allowed.includes(wd)) return false;
    }
    if (everyN > 1 && startD) {
      const days = Math.round((date.getTime() - startD.getTime()) / 86400000);
      return days >= 0 && days % everyN === 0;
    }
    return startD ? date >= startD : true;
  }
  if (t.frequency === 'weekly') {
    if (!startD) return false;
    const days = Math.round((date.getTime() - startD.getTime()) / 86400000);
    return days >= 0 && days % (7 * everyN) === 0;
  }
  if (t.frequency === 'monthly') {
    if (!startD) return false;
    if (!matchesMonthAnchor(t, startD, date)) return false;
    const monthsDiff = (date.getFullYear() - startD.getFullYear()) * 12 + (date.getMonth() - startD.getMonth());
    return monthsDiff >= 0 && monthsDiff % everyN === 0;
  }
  if (t.frequency === 'yearly') {
    if (!startD) return false;
    // Yearly is monthly's anchor pinned to one month.
    if (date.getMonth() !== startD.getMonth()) return false;
    if (!matchesMonthAnchor(t, startD, date)) return false;
    const yearsDiff = date.getFullYear() - startD.getFullYear();
    return yearsDiff >= 0 && yearsDiff % everyN === 0;
  }
  return true;
}

// Occurrence date whose grace window covers dateYMD, or null.
export function activeOccurrenceStart(t: ScheduleShape, dateYMD: string): string | null {
  const n = windowDaysOf(t);
  const base = parseYMD(dateYMD);
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const s = ymd(d);
    if (isOccurrenceRaw(t, s)) return s;
  }
  return null;
}

// True when dateYMD lies within some occurrence's grace window (incl. a one-shot deferred override).
export function isOccurrenceOn(t: ScheduleShape, dateYMD: string): boolean {
  if (t.deferred_to_date && t.deferred_to_date === dateYMD) return true;
  return activeOccurrenceStart(t, dateYMD) !== null;
}

// True when last_completed satisfies the grace window active on dateYMD (completed on/after start).
export function isWindowSatisfied(t: ScheduleShape, lastCompleted: string | null, dateYMD: string): boolean {
  if (!lastCompleted) return false;
  const start = activeOccurrenceStart(t, dateYMD);
  return start !== null && lastCompleted >= start;
}

// The inclusive last day of the grace window active on dateYMD, or null if no occurrence covers it.
export function occurrenceWindowEnd(t: ScheduleShape, dateYMD: string): string | null {
  const start = activeOccurrenceStart(t, dateYMD);
  if (start === null) return null;
  return addDays(start, windowDaysOf(t) - 1);
}
