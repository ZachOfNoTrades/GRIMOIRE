"use client";

// The quest calendar's view preferences, shared by the home card and the calendar page so the two
// always agree. They live in the same localStorage bag as the task-list view preferences
// (ui/home/page.tsx) — one blob, patched field by field, rather than a key per setting.

const KEY = "quest_view_prefs";

export type CalendarView = "month" | "week";

interface CalendarPrefs {
  hideDailyTasksInCalendar: boolean;
  calendarView: CalendarView;
  calendarWeekStart: number; // 0=Sun … 6=Sat
}

export const CALENDAR_PREF_DEFAULTS: CalendarPrefs = {
  hideDailyTasksInCalendar: true,
  calendarView: "month",
  calendarWeekStart: 1, // Monday, matching the calendar page's long-standing default
};

function readBag(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {}; // unreadable/invalid preferences fall back to the defaults
  }
}

export function readCalendarPrefs(): CalendarPrefs {
  const bag = readBag();
  const view = bag.calendarView;
  const weekStart = Number(bag.calendarWeekStart);
  return {
    hideDailyTasksInCalendar:
      typeof bag.hideDailyTasksInCalendar === "boolean"
        ? bag.hideDailyTasksInCalendar
        : CALENDAR_PREF_DEFAULTS.hideDailyTasksInCalendar,
    calendarView: view === "week" || view === "month" ? view : CALENDAR_PREF_DEFAULTS.calendarView,
    // Monday or Sunday only — anything else (including a Saturday saved before that option was
    // dropped) falls back to the default.
    calendarWeekStart:
      weekStart === 0 || weekStart === 1 ? weekStart : CALENDAR_PREF_DEFAULTS.calendarWeekStart,
  };
}

// Merge one or more fields, leaving every other preference in the bag untouched.
export function writeCalendarPrefs(patch: Partial<CalendarPrefs>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readBag(), ...patch }));
  } catch {
    // ignore — a full/blocked localStorage just means the choice isn't remembered
  }
}
