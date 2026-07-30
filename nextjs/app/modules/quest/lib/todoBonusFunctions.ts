import crypto from 'crypto';
import { computeTaskAge } from './taskFunctions';

export interface TodoBonusConfig {
  enabled: boolean;
  dailyChance: number; // percentage in [0, 100] that today is a bonus day
  multiplier: number;  // payout multiplier when bonus fires (e.g. 3 = 3x)
  ageBias: number;     // exponent on (age + 1); 0 = uniform, +N = favour older, -N = favour newer
}

export interface BonusCandidate {
  id: string;
  ts_created: Date | string;
  // YYYY-MM-DD the todo was completed, or null if still open. Used to drop todos completed on a
  // prior day from the eligibility pool while keeping ones completed today (see pickTodayBonus).
  ts_completed: string | null;
}

export interface BonusPick {
  taskId: string | null;
  multiplier: number;
}

// SHA-256 of `input`, first 4 bytes as uint32, normalised to [0, 1). Deterministic — same input
// always returns the same value. Used so the daily roll and pick are stable for a given user/day
// across multiple requests in the same day.
function hashToUnit(input: string): number {
  const buf = crypto.createHash('sha256').update(input).digest();
  return buf.readUInt32BE(0) / 0x100000000;
}

// Given the user's effective `today`, their bonus config, and the candidate todos (ALL todos for
// the user, regardless of status), returns either a chosen task id + multiplier or null. Eligible
// candidates are todos created strictly before `today` that are either still open OR were completed
// today. Todos created today are excluded so the pick doesn't shift when new todos are added during
// the day; todos completed on a PRIOR day are excluded so the multiplier never lands on a stale,
// long-finished task. Todos completed today are KEPT in the pool: this makes the deterministic pick
// stable across the day, so completing the chosen bonus todo does NOT cause the pick to migrate to a
// different open todo (the bug where checking off the bonus reassigned the bonus to a new task).
export function pickTodayBonus(
  userId: string,
  candidates: BonusCandidate[],
  today: string,
  config: TodoBonusConfig,
): BonusPick {
  if (!config.enabled) return { taskId: null, multiplier: 1 };
  if (config.dailyChance <= 0 || config.multiplier <= 0) return { taskId: null, multiplier: 1 };

  // Filter eligibility to todos that existed before today (created strictly before today) and are
  // either still open (ts_completed is null) or were completed today. Todos completed on a prior day
  // are dropped. Keeping today's completed todos in the pool keeps the deterministic pick stable for
  // the whole day, so checking off the chosen bonus todo doesn't reassign the bonus to another todo.
  // ts_completed is a YYYY-MM-DD string (null when open).
  const todayMs = new Date(`${today}T00:00:00`).getTime();
  const eligible = candidates.filter((t) => {
    const created = t.ts_created instanceof Date ? t.ts_created : new Date(t.ts_created);
    if (created.getTime() >= todayMs) return false;
    return t.ts_completed === null || t.ts_completed === today;
  });
  if (eligible.length === 0) return { taskId: null, multiplier: 1 };

  // Daily roll: is today a bonus day? hashToUnit is [0,1); compare against dailyChance/100.
  const rollSeed = hashToUnit(`${userId}:${today}:roll`);
  if (rollSeed * 100 >= config.dailyChance) return { taskId: null, multiplier: 1 };

  // Stable ordering before weighting so SQL row order can't shift the selection.
  const sorted = eligible.slice().sort((a, b) => a.id.localeCompare(b.id));
  const weights: number[] = [];
  let total = 0;
  for (const t of sorted) {
    const age = computeTaskAge(t.ts_created, today);
    // (age + 1) so a brand-new but eligible todo (age=0) has weight 1 instead of 0.
    const w = Math.pow(age + 1, config.ageBias);
    weights.push(w);
    total += w;
  }
  if (!Number.isFinite(total) || total <= 0) return { taskId: null, multiplier: 1 };

  // Weighted pick.
  const pickSeed = hashToUnit(`${userId}:${today}:pick`);
  let r = pickSeed * total;
  for (let i = 0; i < sorted.length; i++) {
    r -= weights[i];
    if (r <= 0) return { taskId: sorted[i].id, multiplier: config.multiplier };
  }
  // Floating-point fallback — pick last.
  return { taskId: sorted[sorted.length - 1].id, multiplier: config.multiplier };
}
