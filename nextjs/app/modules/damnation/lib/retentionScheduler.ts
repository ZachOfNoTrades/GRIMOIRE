import { expireIdleSessions, purgeOldSessions } from "./sessionFunctions";

// Hourly housekeeping for Damnation: finish sessions idle past the expiry window (freeing
// their join codes) and delete finished sessions older than 30 days. Display names are the
// only personal data these rows hold. Handle on globalThis so HMR can't stack timers.

const TICK_MS = 60 * 60 * 1000;

type GlobalWithScheduler = typeof globalThis & {
  __damnationRetentionHandle?: NodeJS.Timeout;
};

async function tick(): Promise<void> {
  try {
    const expired = await expireIdleSessions();
    const purged = await purgeOldSessions();
    if (expired > 0 || purged > 0) {
      console.log(`[damnation] retention: expired ${expired} idle session(s), purged ${purged} old session(s)`);
    }
  } catch (error) {
    console.error("[damnation] retention tick failed:", error);
  }
}

export function startDamnationRetentionScheduler(): void {
  const globalScheduler = globalThis as GlobalWithScheduler;
  if (globalScheduler.__damnationRetentionHandle) return;
  globalScheduler.__damnationRetentionHandle = setInterval(() => void tick(), TICK_MS);
  globalScheduler.__damnationRetentionHandle.unref?.();
}
