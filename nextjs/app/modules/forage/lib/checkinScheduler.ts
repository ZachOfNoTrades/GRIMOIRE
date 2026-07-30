import { isEmailConfigured } from '@/lib/email';
import { listCheckinNotifCandidates, markCheckinNotifSent } from './settingsFunctions';
import { getActiveProgram } from './programFunctions';
import { isCheckInDue, todayIsoUtc } from './program';
import { sendCheckinReminder } from './checkinNotif';

// In-process scheduler for the Forage weekly check-in reminder. Mirrors the quest digest
// scheduler: each minute we ask the DB which users have:
//   - checkin_notif_enabled = 1
//   - checkin_notif_time <= now (HH:MM, server local clock)
// and, for each, email a reminder when their active program is coached AND the
// check-in is still due for today (UTC, matching lib/program.ts). The de-dupe stamp
// (checkin_notif_last_sent_date) keeps it to at most once per check-in day; the reminder
// keeps firing on every subsequent day until the user actually completes the check-in
// wizard (POST /api/checkin/confirm, which stamps last_checkin_date and clears the due
// state) — intentional now that the recompute is an explicit user action, not an
// automatic side effect of opening Forage.
//
// We stash the interval handle on globalThis so HMR doesn't leak timers in dev, and we
// soft-disable when SMTP env is missing so a fresh clone without secrets stays quiet.

const TICK_MS = 60_000;

type GlobalWithScheduler = typeof globalThis & {
  __forageCheckinSchedulerHandle?: NodeJS.Timeout;
  __forageCheckinSchedulerStarted?: boolean;
};

function nowHHMM(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function tick(): Promise<void> {
  if (!isEmailConfigured()) return;
  try {
    const hhmm = nowHHMM();
    const today = todayIsoUtc();
    const candidates = await listCheckinNotifCandidates(hhmm);
    for (const c of candidates) {
      try {
        if (c.lastSentDate === today) continue;
        const program = await getActiveProgram(c.userId);
        // Only coached programs have a weekly check-in; manual programs never do.
        if (!program || program.program_style !== 'coached' || program.check_in_weekday == null) continue;
        if (!isCheckInDue(program.check_in_weekday, program.last_checkin_date, today)) continue;
        const result = await sendCheckinReminder(c.userId, program.check_in_weekday);
        // Only stamp as sent when the send succeeded, so an SMTP outage retries next tick.
        if (result.ok) await markCheckinNotifSent(c.userId, today);
        else console.warn(`Forage check-in notif send failed for user '${c.userId}': ${result.error}`);
      } catch (e) {
        console.error(`Forage check-in notif tick failed for user '${c.userId}':`, e);
      }
    }
  } catch (e) {
    console.error('Forage check-in scheduler tick failed:', e);
  }
}

export function startForageCheckinScheduler(): void {
  const g = globalThis as GlobalWithScheduler;
  if (g.__forageCheckinSchedulerStarted) return;
  g.__forageCheckinSchedulerStarted = true;
  // Immediate tick (after a short delay) so a restart catches a reminder scheduled in the
  // current minute that we missed during downtime; subsequent ticks happen on the interval.
  setTimeout(() => { void tick(); }, 5_000);
  const handle = setInterval(() => { void tick(); }, TICK_MS);
  // Don't block process exit on this timer.
  if (typeof handle.unref === 'function') handle.unref();
  g.__forageCheckinSchedulerHandle = handle;
  console.log('[forage-notif] check-in reminder scheduler started (60s tick)');
}
