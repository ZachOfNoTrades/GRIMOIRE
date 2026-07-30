// Deterministic warmup-ramp generation from a working load. Pure; types-only import.
import type { PrescribedSet } from './types';

// Round a load to the nearest allowed increment (duplicated here to keep this module
// runtime-import-free, so Node type-stripping can load it standalone).
function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export interface WarmupOptions {
  percents: number[];   // fractions of the working load, ascending
  reps: number[];        // reps per warmup set, parallel to percents
  step: number;          // load rounding increment
  minWorkingLoad: number; // below this (e.g. bodyweight / very light), skip warmups
}

const DEFAULT_WARMUP: WarmupOptions = {
  percents: [0.5, 0.7, 0.85],
  reps: [8, 5, 3],
  step: 5,
  minWorkingLoad: 45, // ~empty barbell; lighter loads don't need a ramp
};

// Build ascending warmup sets below the working load. Drops any set that rounds to <= 0
// or >= the working load (no redundant near-working warmups), and skips entirely for light/bodyweight work.
export function warmupRamp(workingLoad: number, options: Partial<WarmupOptions> = {}): PrescribedSet[] {
  const opts: WarmupOptions = { ...DEFAULT_WARMUP, ...options };
  if (workingLoad < opts.minWorkingLoad) return [];

  const sets: PrescribedSet[] = [];
  let setNumber = 1;
  for (let i = 0; i < opts.percents.length; i++) {
    const load = roundToStep(workingLoad * opts.percents[i], opts.step);
    if (load <= 0 || load >= workingLoad) continue;
    // Avoid duplicate consecutive loads after rounding.
    if (sets.length > 0 && sets[sets.length - 1].weight === load) continue;
    sets.push({
      setNumber: setNumber++,
      isWarmup: true,
      weight: load,
      reps: opts.reps[i] ?? opts.reps[opts.reps.length - 1],
      rpe: null,
      timeSeconds: null,
    });
  }
  return sets;
}
