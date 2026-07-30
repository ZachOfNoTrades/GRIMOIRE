import sql from 'mssql';
import { ModuleBadge } from '@/types/dashboardBadge';
import { getFoodConnection } from './db';
import { getActiveProgram } from './programFunctions';
import { getSettings } from './settingsFunctions';
import { isCheckInDue, todayIsoLocal } from './program';

// Homepage badges for the Forage card:
//   - "Check-in due" — the active coached program's weekly check-in hasn't been done for the
//     current occurrence (same predicate the Strategy tab's dot uses, via isCheckInDue).
//   - "Nothing logged" — the user's configured cutoff time has passed and today's diary is
//     still empty (opt-out, time configurable in Forage settings -> Home badge).
// Read-only by construction: this must never trigger the check-in recompute (painting a badge
// can't be allowed to mark the check-in as done), which is why it calls getActiveProgram
// rather than the /api/program route.

// Whether the user has logged any food for `date` (local calendar date, matching how
// food_entries.entry_date is written everywhere else).
async function hasEntriesOn(userId: string, date: string): Promise<boolean> {
  const pool = await getFoodConnection();
  const res = await pool
    .request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('date', sql.Date, date)
    .query<{ n: number }>(
      `SELECT TOP 1 1 AS n FROM food_entries WHERE user_id = @userId AND entry_date = @date`
    );
  return res.recordset.length > 0;
}

// Minutes since midnight on the server's local clock — compared against the user's HH:MM cutoff.
function nowMinutesLocal(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export async function getForageBadges(userId: string): Promise<ModuleBadge[]> {
  const badges: ModuleBadge[] = [];
  const today = todayIsoLocal();
  const [program, settings] = await Promise.all([getActiveProgram(userId), getSettings(userId)]);

  // CHECK-IN DUE — only coached programs have a weekly check-in; manual programs never do.
  if (
    program &&
    program.program_style === 'coached' &&
    program.check_in_weekday != null &&
    isCheckInDue(program.check_in_weekday, program.last_checkin_date, today)
  ) {
    badges.push({
      key: 'forage-checkin-due',
      label: 'Check-in due',
      tone: 'yellow',
      detail: "This week's coached check-in hasn't been completed yet.",
    });
  }

  // NOTHING LOGGED YET — gated on the user's cutoff time so it can't nag all morning.
  if (settings.unlogged_badge_enabled) {
    const cutoff = hhmmToMinutes(settings.unlogged_badge_time);
    if (nowMinutesLocal() >= cutoff && !(await hasEntriesOn(userId, today))) {
      badges.push({
        key: 'forage-nothing-logged',
        label: 'Nothing logged',
        tone: 'red',
        detail: `No food logged today as of ${settings.unlogged_badge_time}.`,
      });
    }
  }

  return badges;
}
