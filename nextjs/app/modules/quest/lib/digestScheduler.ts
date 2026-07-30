import { listDigestCandidates, listBonusNotifCandidates } from './settingsFunctions';
import { getCurrentDate } from './settingsFunctions';
import { sendDigestForUser } from './digestFunctions';
import { sendBonusNotifForUser } from './bonusNotifFunctions';
import { isEmailConfigured } from '@/lib/email';
import {
  listDueReminders,
  isTaskActiveToday,
  isWithinLateFireWindow,
  markFired,
  sendReminderNotification,
} from './reminderFunctions';

// In-process scheduler for the Quest daily digest. We avoid an external cron because the Next.js
// process is the canonical long-running runtime on this VM (pm2-managed). On each minute boundary
// we ask the DB which users have:
//   - digest_enabled = 1
//   - digest_time <= now (HH:MM, server local clock)
//   - digest_last_sent_date != their effective `today` (simulation-date aware)
// and send each one a digest. Marking-as-sent and de-duping live in sendDigestForUser /
// markDigestSent — the scheduler is just the trigger.
//
// We stash the interval handle on globalThis so HMR doesn't leak timers in dev, and we soft-disable
// when SMTP env is missing so a fresh clone without secrets stays quiet.

const TICK_MS = 60_000;

type GlobalWithScheduler = typeof globalThis & {
  __questDigestSchedulerHandle?: NodeJS.Timeout;
  __questDigestSchedulerStarted?: boolean;
};

function nowHHMM(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function tick(): Promise<void> {
  if (!isEmailConfigured()) return;
  const hhmm = nowHHMM();
  // Digest leg.
  try {
    const candidates = await listDigestCandidates(hhmm);
    for (const c of candidates) {
      try {
        const today = await getCurrentDate(c.userId);
        if (c.lastSentDate === today) continue;
        const result = await sendDigestForUser(c.userId, { manual: false, userName: c.name, userEmail: c.email });
        if (!result.ok && !result.skipped) {
          console.warn(`Quest digest send failed for user '${c.userId}' (${c.email}): ${result.reason}`);
        }
      } catch (e) {
        console.error(`Quest digest tick failed for user '${c.userId}':`, e);
      }
    }
  } catch (e) {
    console.error('Quest digest scheduler tick failed:', e);
  }
  // Bonus-task notification leg.
  try {
    const candidates = await listBonusNotifCandidates(hhmm);
    for (const c of candidates) {
      try {
        const today = await getCurrentDate(c.userId);
        if (c.lastSentDate === today) continue;
        const result = await sendBonusNotifForUser(c.userId, { manual: false, userName: c.name, userEmail: c.email, always: c.always });
        if (!result.ok && !result.skipped) {
          console.warn(`Quest bonus-notif send failed for user '${c.userId}' (${c.email}): ${result.reason}`);
        }
      } catch (e) {
        console.error(`Quest bonus-notif tick failed for user '${c.userId}':`, e);
      }
    }
  } catch (e) {
    console.error('Quest bonus-notif scheduler tick failed:', e);
  }
  // Task reminder leg. listDueReminders pulls rows whose fire_time has passed today's @nowHHMM and
  // that haven't fired yet for the user's effective today; we then filter in TS for "active today"
  // (cadence + done-today) and the 30-min late-fire window.
  try {
    const now = new Date();
    // The scheduler historically uses server-local clock for HH:MM gating. Use the same here so a
    // 9:00 reminder fires whenever the server's wall clock crosses 09:00.
    const userIdsByToday = new Map<string, string>();
    const hhmm = nowHHMM();
    // For listDueReminders we need a single @today date, but each user can have a simulated date.
    // Two-pass: first query with calendar-today, then per-row resolve the user's effective today.
    const calendarToday = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    })();
    const due = await listDueReminders(calendarToday, hhmm);
    for (const r of due) {
      try {
        let today = userIdsByToday.get(r.userId);
        if (!today) {
          today = await getCurrentDate(r.userId);
          userIdsByToday.set(r.userId, today);
        }
        // Re-check the "fired today" gate against the user's effective today, in case sim-date
        // moves last_fired_date relative to the calendar date used in the SQL filter.
        if (r.lastCompletedDate === today) continue;
        if (!isTaskActiveToday(r, today)) continue;
        if (!isWithinLateFireWindow(r.fireTime, now)) continue;
        const ok = await sendReminderNotification({
          userId: r.userId,
          taskTitle: r.taskTitle,
          taskKind: r.taskKind,
          fireTime: r.fireTime,
        });
        if (ok) await markFired(r.reminderId, today);
      } catch (e) {
        console.error(`Quest reminder fire failed for task '${r.taskId}':`, e);
      }
    }
  } catch (e) {
    console.error('Quest reminder scheduler tick failed:', e);
  }
}

export function startQuestDigestScheduler(): void {
  const g = globalThis as GlobalWithScheduler;
  if (g.__questDigestSchedulerStarted) return;
  g.__questDigestSchedulerStarted = true;
  // Run an immediate tick so a server restart catches any digests scheduled in the current minute
  // that we missed during the downtime; subsequent ticks happen on the minute interval.
  setTimeout(() => { void tick(); }, 5_000);
  const handle = setInterval(() => { void tick(); }, TICK_MS);
  // Don't block process exit on this timer.
  if (typeof handle.unref === 'function') handle.unref();
  g.__questDigestSchedulerHandle = handle;
  console.log('[quest-notif] scheduler started (60s tick: digest + bonus-task + reminders)');
}
