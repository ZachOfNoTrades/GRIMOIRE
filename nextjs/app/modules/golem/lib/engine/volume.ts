// Calendar-week volume bucketing + trend/plateau analysis (Layer-3 self-tuning inputs).
// Fixes the `weeks`-table blindness found in the live data check (plan §7): 776/791 completed
// sessions are standalone (week_id NULL) and invisible to the old landmark calc — bucketing by
// calendar date instead exposes the whole history. Pure functions; types-only import.
import type { MuscleSetEvent, WeeklyMuscleVolume, E1rmPoint } from './types';

// The Monday (00:00, local) of the week containing `date` — the calendar-week bucket anchor.
export function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();                 // 0=Sun … 6=Sat
  const offset = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setDate(d.getDate() + offset);
  return d;
}

// Aggregate per-muscle working-set counts into calendar weeks. One input event = one completed working set.
export function weeklyVolumeByMuscle(events: MuscleSetEvent[]): WeeklyMuscleVolume[] {
  const counts = new Map<string, { weekStart: Date; muscle: string; sets: number }>();
  for (const ev of events) {
    const weekStart = mondayOf(ev.date);
    const key = `${weekStart.getTime()}::${ev.muscle}`;
    const existing = counts.get(key);
    if (existing) {
      existing.sets += 1;
    } else {
      counts.set(key, { weekStart, muscle: ev.muscle, sets: 1 });
    }
  }
  return Array.from(counts.values()).sort(
    (a, b) => a.weekStart.getTime() - b.weekStart.getTime() || a.muscle.localeCompare(b.muscle),
  );
}

// Realized progression rate: least-squares slope of e1RM over time, in lb per week.
// Returns null with fewer than 2 points. Personalizes the load increment instead of a fixed guess (plan §7).
export function realizedProgressionRate(series: E1rmPoint[]): number | null {
  if (series.length < 2) return null;
  const t0 = series[0].date.getTime();
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const points = series.map((p) => ({ x: (p.date.getTime() - t0) / msPerWeek, y: p.e1rm }));

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null; // all on the same day
  return (n * sumXY - sumX * sumY) / denom;
}

// Plateau detection: has the best e1RM in the recent window failed to beat the prior best by `minGainPct`?
// Drives the novelty trigger (plan §6) and the double-progression plateau override (progression.ts).
export function detectPlateau(
  series: E1rmPoint[],
  options: { recentCount: number; minGainPct: number } = { recentCount: 3, minGainPct: 0.01 },
): boolean {
  if (series.length < 2) return false; // not enough evidence to call a plateau
  const sorted = [...series].sort((a, b) => a.date.getTime() - b.date.getTime());
  const recent = sorted.slice(-options.recentCount);
  const prior = sorted.slice(0, -options.recentCount);
  if (prior.length === 0) return false;

  const bestRecent = Math.max(...recent.map((p) => p.e1rm));
  const bestPrior = Math.max(...prior.map((p) => p.e1rm));
  return bestRecent <= bestPrior * (1 + options.minGainPct);
}
