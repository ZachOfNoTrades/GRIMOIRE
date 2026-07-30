// Core types for the deterministic generation engine (Layer 3 — loading/progression).
// See .claude/plans/golem-deterministic-generation.md (§0 implementation status, §4/§5/§6).
// NOTE: this file is types-only on purpose — engine modules import it with `import type`,
// so a Node type-stripping run (verify.mjs) erases the import entirely (no runtime resolution).

// Which math advances an exercise week-over-week. Double-progression is the default
// (data showed RPE only 6% all-time / 61% recent — see plan §7); rpe_pct1rm/time_effort come later.
export type ProgressionModel =
  | 'double_progression'
  | 'linear'
  | 'rpe_pct1rm'
  | 'time_effort';

// The persisted, per-slot progression state. Advances each cycle and SURVIVES exercise swaps;
// absolute load is re-anchored at generation time to whichever exercise fills the slot (plan §5).
export interface ProgressionState {
  model: ProgressionModel;
  repRange: [number, number];      // [low, high] reps (rep-based models)
  timeRange: [number, number] | null; // [low, high] seconds (time_effort only; null otherwise)
  targetRpe: number | null;        // null when RPE is not used/available for this slot
  loadStepPct: number;             // fractional load bump on progression, e.g. 0.05 = +5%
  roundToStep: number;             // smallest load increment (5 lb, or a machine plate)
  setTarget: number;               // working-set count, filled by the volume allocator
}

// A single logged set as read from session_segment_sets.
export interface LoggedSet {
  weight: number;
  reps: number | null;             // null for timed exercises
  rpe: number | null;
  timeSeconds: number | null;
  isWarmup: boolean;
  isCompleted: boolean;
}

// A prescribed set the engine emits (maps onto GeneratedSegment.sets).
export interface PrescribedSet {
  setNumber: number;
  isWarmup: boolean;
  weight: number;
  reps: number | null;
  rpe: number | null;
  timeSeconds: number | null;
}

// The next-cycle decision for one exercise, before warmups are attached. Exactly one of reps/timeSeconds
// is populated: rep-based models set reps (timeSeconds null); time_effort sets timeSeconds (reps null).
export interface LoadDecision {
  load: number;
  reps: number | null;
  timeSeconds: number | null;
  rationale: string;               // human-readable trace of which rule fired
}

// One e1RM observation over time, for trend/plateau analysis.
export interface E1rmPoint {
  date: Date;
  e1rm: number;
}

// One completed working set's date + the muscle it trained, for calendar-week volume bucketing.
export interface MuscleSetEvent {
  date: Date;
  muscle: string;
}

// Aggregated weekly working-set volume for one muscle in one calendar week.
export interface WeeklyMuscleVolume {
  weekStart: Date;                 // Monday anchor
  muscle: string;
  sets: number;
}
