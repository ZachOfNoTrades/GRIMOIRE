import { DamnationError } from "./errors";

// Fixed-window counters for the public guest endpoints. Kept on globalThis so every route
// bundle shares one table under `next dev` (same reason as lib/generationJobStore.ts).
// In-memory is enough: grimoire runs as a single PM2 fork-mode process.

interface Window {
  count: number;
  resetAt: number;
}

const globalStore = globalThis as typeof globalThis & {
  __damnationRateLimits?: Map<string, Window>;
  __damnationRateLimitSweep?: ReturnType<typeof setInterval>;
};

if (!globalStore.__damnationRateLimits) {
  globalStore.__damnationRateLimits = new Map();
}
const windows = globalStore.__damnationRateLimits;

if (!globalStore.__damnationRateLimitSweep) {
  globalStore.__damnationRateLimitSweep = setInterval(() => {
    const now = Date.now();
    for (const [key, window] of windows) {
      if (window.resetAt <= now) windows.delete(key);
    }
  }, 5 * 60 * 1000);
  globalStore.__damnationRateLimitSweep.unref?.();
}

// CF-Connecting-IP is only trustworthy for traffic that arrived through the Cloudflare
// tunnel; a direct LAN request can set it to anything, which is acceptable on the LAN.
export function clientAddress(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function enforceRateLimit(bucket: string, request: Request, limit: number, windowMs: number): void {
  const key = `${bucket}:${clientAddress(request)}`;
  const now = Date.now();
  const window = windows.get(key);
  if (!window || window.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  window.count += 1;
  if (window.count > limit) {
    throw new DamnationError(429, "Too many attempts — wait a few minutes and try again");
  }
}

export const RATE_LIMITS = {
  // Code lookups that miss: throttles guessing at live codes.
  codeMiss: { limit: 30, windowMs: 10 * 60 * 1000 },
  // Join / claim attempts per address.
  join: { limit: 20, windowMs: 10 * 60 * 1000 },
} as const;
