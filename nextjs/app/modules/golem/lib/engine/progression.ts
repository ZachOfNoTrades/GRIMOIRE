// Progression-model state machine. Given a slot's progression state + the most recent top working set,
// decide the next prescription's load and reps. Pure; types-only import (erased under Node strip-types).
import type { ProgressionState, LoadDecision } from './types';

// The relevant facts about the most recent best working set on the exercise filling a slot.
// timeSeconds is the best logged hold/effort duration (timed exercises); null for rep-based exercises.
export interface TopSet {
  weight: number;
  reps: number;
  rpe: number | null;
  timeSeconds: number | null;
}

// Round a load to the nearest allowed increment (5 lb, machine plate, …).
export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

// DOUBLE PROGRESSION (the default model — see plan §7, data showed RPE too sparse historically for RPE-anchored loading).
// Rules, in priority order:
//   1. RPE overreach (logged RPE well above target) → hold load, reset to bottom of rep range (back off).
//   2. Hit top of rep range at acceptable RPE, OR a plateau was detected → step the load up, reset reps.
//   3. Otherwise → keep the load, climb one rep toward the top of the range.
export function nextDoubleProgression(
  state: ProgressionState,
  topSet: TopSet,
  options: { plateau: boolean } = { plateau: false },
): LoadDecision {
  const [low, high] = state.repRange;

  // 1. Overreach: only when both target and logged RPE exist and we're more than a full point over.
  const overreached =
    topSet.rpe !== null && state.targetRpe !== null && topSet.rpe > state.targetRpe + 1;
  if (overreached) {
    return { load: topSet.weight, reps: low, timeSeconds: null, rationale: 'RPE overreach → hold load, reset reps' };
  }

  // 2. Load step: top of range reached at acceptable RPE, or a plateau override forces it.
  const rpeAcceptable =
    topSet.rpe === null || state.targetRpe === null || topSet.rpe <= state.targetRpe + 0.5;
  const hitTop = topSet.reps >= high && rpeAcceptable;
  if (hitTop || options.plateau) {
    const load = roundToStep(topSet.weight * (1 + state.loadStepPct), state.roundToStep);
    const rationale = options.plateau
      ? 'plateau detected → load step, reset reps'
      : 'hit top of rep range → load step, reset reps';
    return { load, reps: low, timeSeconds: null, rationale };
  }

  // 3. Climb reps at the same load.
  return {
    load: topSet.weight,
    reps: Math.min(topSet.reps + 1, high),
    timeSeconds: null,
    rationale: 'climb reps at same load',
  };
}

// LINEAR progression: add one load step if last cycle met its target, else repeat.
export function nextLinear(
  state: ProgressionState,
  topSet: TopSet,
  metTargetLastTime: boolean,
): LoadDecision {
  if (metTargetLastTime) {
    return {
      load: roundToStep(topSet.weight * (1 + state.loadStepPct), state.roundToStep),
      reps: state.repRange[0],
      timeSeconds: null,
      rationale: 'met target → linear load step',
    };
  }
  return { load: topSet.weight, reps: state.repRange[0], timeSeconds: null, rationale: 'missed target → repeat load' };
}

// TIME / EFFORT: no load steps — progress DURATION (seconds) at the same load (often bodyweight).
// Two paths by how the slot is configured (set in generationLoader by category):
//   • CARDIO (timeRange set): the duration is a prescribed dose — start at the floor, climb toward the
//     ceiling. The range is exercise-agnostic ("do 10–15 min"), so a shared range is appropriate.
//   • STRENGTH holds (timeRange null): NO guardrails — capacity varies too much across holds for a shared
//     range to be meaningful. Drive purely off the exercise's own logged history; with no history, prescribe
//     no target (null) so the user self-reports, then progress from there next time.
function durationBump(current: number): number {
  return Math.max(5, Math.round((current * 0.1) / 5) * 5); // ~+10%, min +5s, rounded to 5s
}
export function nextTimeEffort(state: ProgressionState, topSet: TopSet): LoadDecision {
  const current = topSet.timeSeconds ?? 0;

  // Cardio: prescribe within the configured range (floor → capped ceiling).
  if (state.timeRange) {
    const [low, high] = state.timeRange;
    const next = current < low ? low : Math.min(current + durationBump(current), high);
    return { load: topSet.weight, reps: null, timeSeconds: next, rationale: 'time/effort (cardio) → progress duration toward target' };
  }

  // Strength hold, no history → self-report (no prescribed target).
  if (current <= 0) {
    return { load: topSet.weight, reps: null, timeSeconds: null, rationale: 'time/effort → no history, self-report duration' };
  }
  // Strength hold with history → progress from your last logged time, no ceiling.
  return { load: topSet.weight, reps: null, timeSeconds: current + durationBump(current), rationale: 'time/effort → progress duration from history' };
}

// Dispatcher: route to the right model. (rpe_pct1rm lands in a later pass → falls back to double-progression.)
export function decideLoad(
  state: ProgressionState,
  topSet: TopSet,
  options: { plateau: boolean; metTargetLastTime: boolean },
): LoadDecision {
  switch (state.model) {
    case 'linear':
      return nextLinear(state, topSet, options.metTargetLastTime);
    case 'time_effort':
      return nextTimeEffort(state, topSet);
    case 'rpe_pct1rm':
    case 'double_progression':
    default:
      return nextDoubleProgression(state, topSet, { plateau: options.plateau });
  }
}
