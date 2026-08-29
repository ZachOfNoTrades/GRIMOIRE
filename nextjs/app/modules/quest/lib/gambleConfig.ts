// Shared config for the "gamble for health" short-rest mechanic. Kept in its own module (no
// server-only imports like mssql) so both the server lib (userStateFunctions) and the client
// page can import the same numbers without the cost/die-size drifting out of sync.

// Coins spent on the FIRST short rest of the day. Tune freely — it's the "x coins" the user pays.
export const GAMBLE_COST = 2;

// Every further roll in the same quest WEEK costs this much more than the one before it, so the
// week's rolls run 2, 4, 6, 8 ... — resting repeatedly is meant to hurt. The escalation resets when
// the user's week-start weekday comes round again (tracked as
// quest_user_state.gamble_rolls_date/_count against quest_settings.gamble_week_start_day).
export const GAMBLE_COST_STEP = 2;

/** Coins the next short rest costs, given how many rolls the user already made this week. */
export function gambleCostForRoll(rollsThisWeek: number): number {
  return GAMBLE_COST + GAMBLE_COST_STEP * Math.max(0, rollsThisWeek);
}

// Weekday the quest week (and therefore the short-rest escalation window) starts on, in the JS
// Date.getDay() convention: 0 = Sunday ... 6 = Saturday. Monday by default.
export const DEFAULT_GAMBLE_WEEK_START_DAY = 1;

export const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

/** Coerces anything (DB value, request body, undefined) to a valid 0..6 weekday, else the default. */
export function normalizeWeekStartDay(day: unknown): number {
  const n = Number(day);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : DEFAULT_GAMBLE_WEEK_START_DAY;
}

/**
 * YYYY-MM-DD of the most recent `weekStartDay` weekday on or before `todayYMD` — i.e. the first day
 * of the quest week `todayYMD` falls in. A roll stamped on or after this date still counts toward
 * the escalation; anything older reads as zero, so the weekly reset needs no scheduled job.
 */
export function gambleWeekStart(todayYMD: string, weekStartDay?: number): string {
  const [y, m, d] = todayYMD.split('-').map(Number);
  // Midday UTC so neither the host timezone nor a DST boundary can shift the calendar date.
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  const daysIntoWeek = (t.getUTCDay() - normalizeWeekStartDay(weekStartDay) + 7) % 7;
  t.setUTCDate(t.getUTCDate() - daysIntoWeek);
  return t.toISOString().slice(0, 10);
}

/** Human label for the day the escalation resets, e.g. "Monday". */
export function weekStartDayName(weekStartDay?: number): string {
  return WEEKDAY_NAMES[normalizeWeekStartDay(weekStartDay)];
}

// Sides on the recovery die. A d20 — like the Baldur's Gate roll the overlay animates. The heal
// is the rolled value (1..GAMBLE_DIE_SIDES) capped at the user's missing HP.
export const GAMBLE_DIE_SIDES = 20;
