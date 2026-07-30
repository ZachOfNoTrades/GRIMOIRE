// Estimated-1RM math and RPE-aware load prescription.
// Pure functions, no imports — safe to run under Node type-stripping.

// Epley: 1RM = weight × (1 + reps/30). Matches the existing utils/calc.ts helper.
export function epley1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  return weight * (1 + reps / 30);
}

// Brzycki: 1RM = weight × 36 / (37 − reps). This is what ExerciseSummary.estimated_one_rep_max uses.
// Guard reps ≥ 37 (formula blows up / goes negative).
export function brzycki1RM(weight: number, reps: number): number {
  if (reps <= 1) return weight;
  if (reps >= 37) return epley1RM(weight, reps);
  return (weight * 36) / (37 - reps);
}

// Pick the most credible e1RM from a single set. Defaults to Epley to match calc.ts.
export function estimate1RM(weight: number, reps: number, method: 'epley' | 'brzycki' = 'epley'): number {
  const raw = method === 'brzycki' ? brzycki1RM(weight, reps) : epley1RM(weight, reps);
  return Math.round(raw);
}

// RPE-aware load: what load lets you do `reps` at the target `rpe`, given an estimated 1RM.
// Model: reps-to-failure = reps + RIR, where RIR = 10 − rpe. Invert Epley:
//   load = e1rm / (1 + repsToFailure/30).
// This is the RIR-extended Epley — consistent with estimate1RM but accounts for reps left in reserve.
// Example (plan §-sim): e1rm 234, 8 reps @ RPE 7 → RIR 3 → rtf 11 → 234/(1+11/30) ≈ 171.
export function loadForRepsAtRpe(e1rm: number, reps: number, rpe: number): number {
  const repsInReserve = Math.max(0, 10 - rpe);
  const repsToFailure = reps + repsInReserve;
  return e1rm / (1 + repsToFailure / 30);
}
