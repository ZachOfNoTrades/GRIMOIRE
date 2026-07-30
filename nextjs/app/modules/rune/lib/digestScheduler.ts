import { listDigestCandidates } from './settingsFunctions';
import { sendDigestForUser } from './digestFunctions';
import { isEmailConfigured } from '@/lib/email';

// In-process scheduler for the Rune daily review notification. Same shape as the Quest digest
// scheduler but with a single leg: each minute we ask the DB which users have digest_enabled = 1
// and digest_time <= now (HH:MM, server local clock), then send to each one. Marking-as-sent
// lives in sendDigestForUser — the scheduler is just the trigger.
//
// We stash the interval handle on globalThis so HMR doesn't leak timers in dev, and we soft-disable
// when SMTP env is missing so a fresh clone without secrets stays quiet.

const TICK_MS = 60_000;

type GlobalWithScheduler = typeof globalThis & {
  __runeDigestSchedulerHandle?: NodeJS.Timeout;
  __runeDigestSchedulerStarted?: boolean;
};

function nowHHMM(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function calendarToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function tick(): Promise<void> {
  if (!isEmailConfigured()) return;
  const hhmm = nowHHMM();
  const today = calendarToday();
  try {
    const candidates = await listDigestCandidates(hhmm);
    for (const c of candidates) {
      try {
        if (c.lastSentDate === today) continue;
        const result = await sendDigestForUser(c.userId, { manual: false, userName: c.name, userEmail: c.email });
        if (!result.ok && !result.skipped) {
          console.warn(`Rune digest send failed for user '${c.userId}' (${c.email}): ${result.reason}`);
        }
      } catch (e) {
        console.error(`Rune digest tick failed for user '${c.userId}':`, e);
      }
    }
  } catch (e) {
    console.error('Rune digest scheduler tick failed:', e);
  }
}

export function startRuneDigestScheduler(): void {
  const g = globalThis as GlobalWithScheduler;
  if (g.__runeDigestSchedulerStarted) return;
  g.__runeDigestSchedulerStarted = true;
  // Run an immediate tick after a short delay so a server restart catches anything scheduled in
  // the current minute that we missed during downtime; subsequent ticks happen on the minute.
  setTimeout(() => { void tick(); }, 5_000);
  const handle = setInterval(() => { void tick(); }, TICK_MS);
  if (typeof handle.unref === 'function') handle.unref();
  g.__runeDigestSchedulerHandle = handle;
  console.log('[rune-notif] scheduler started (60s tick)');
}
