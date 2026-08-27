// Progression-model state machine. Given a slot's progression state + the most recent top working set,
// decide the next prescription's load and reps. Pure; types-only import (erased under Node strip-types).
import type { ProgressionState, LoadDecision } from './types';
import { estimate1RM, loadForRepsAtRpe } from './oneRepMax';

// The relevant facts about the most recent best working set on the exercise filling a slot.
// timeSeconds is the best logged hold/effort duration (timed exercises); null for rep-based exercises.
// daysSince is how long ago that set was performed — null when unknown (no history / caller can't say).
export interface TopSet {
  weight: number;
  reps: number;
  rpe: number | null;
  timeSeconds: number | null;
  daysSince: number | null;
}

// Round a load to the nearest allowed increment (5 lb, machine plate, …).
export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

// LAYOFF REGRESSION — the last logged top set is only evidence of TODAY's capacity if it is recent.
// Selection already discounts staleness (freshnessHalfLifeDays); loading did not, so a lift untouched for
// ten weeks still got "hit top of rep range → load step" and came back HEAVIER than it ever was trained
// (real case: Machine Chest Press 130x7 logged 2026-06-17 → prescribed 3x4 @135 on 2026-08-26, 70 days later).
//
// Model: strength is held for a few weeks off training, then bleeds away slowly. So nothing happens inside
// a grace window; past it, retained capacity decays a few percent per week down to a floor (detraining costs
// you a chunk of peak strength, not the whole lift — and coming back too light is cheap to fix, coming back
// too heavy is an injury). Past LAYOFF_BASELINE_DAYS the history is too old to anchor a load at all and the
// caller drops to the cold-start/RPE baseline path instead (see orchestrator.ts).
export const LAYOFF_GRACE_DAYS = 21;        // no regression at all inside three weeks
export const LAYOFF_DECAY_PER_WEEK = 0.03;  // ~3% of capacity per week beyond the grace window
export const LAYOFF_MAX_DECAY = 0.30;       // floor: never regress more than 30% off the last load
export const LAYOFF_BASELINE_DAYS = 180;    // older than this → not history any more, prescribe by feel

// Fraction of the last logged capacity we still credit, given how long ago it was performed.
// 1 = no layoff (or unknown date → behave exactly as before).
export function layoffRetention(daysSince: number | null | undefined): number {
  if (daysSince == null || daysSince <= LAYOFF_GRACE_DAYS) return 1;
  const weeksOut = (daysSince - LAYOFF_GRACE_DAYS) / 7;
  return Math.max(1 - LAYOFF_MAX_DECAY, 1 - weeksOut * LAYOFF_DECAY_PER_WEEK);
}

// The regressed prescription for a rep-based model after a layoff: scale the load down by the retained
// fraction and HOLD the rep target (clamped into the slot's range) — a layoff is not a completed cycle, so
// nothing about it earns a load step or a rep climb. A logged set below the range floor is re-anchored to
// the floor at the decayed e1RM, the same matched-effort math rule 3 uses.
function regressForLayoff(state: ProgressionState, topSet: TopSet, retention: number): LoadDecision {
  const [low, high] = state.repRange;
  const pctOff = Math.round((1 - retention) * 100);
  const reps = Math.min(Math.max(topSet.reps, low), high);
  const load = topSet.reps < low
    ? roundToStep(
        loadForRepsAtRpe(estimate1RM(topSet.weight, topSet.reps) * retention, low, state.targetRpe ?? topSet.rpe ?? 8),
        state.roundToStep,
      )
    : roundToStep(topSet.weight * retention, state.roundToStep);
  return {
    load,
    reps,
    timeSeconds: null,
    rationale: `${topSet.daysSince} days since last performed → regress load ${pctOff}% off a stale top set, hold reps`,
  };
}

// DOUBLE PROGRESSION (the default model — see plan §7, data showed RPE too sparse historically for RPE-anchored loading).
// Rules, in priority order:
//   1. RPE overreach (logged RPE well above target) → hold load, reset to bottom of rep range (back off).
//   2. Hit top of rep range at acceptable RPE, OR a plateau was detected → step the load up, reset reps.
//   3. Logged set below the range floor (exercise last trained at a different rep target) → re-anchor to
//      the floor, scaling the load down at matched estimated 1RM.
//   4. Otherwise → keep the load, climb one rep toward the top of the range.
// Rule 0 sits in front of all of them: a top set old enough to have decayed is regressed, never progressed.
export function nextDoubleProgression(
  state: ProgressionState,
  topSet: TopSet,
  options: { plateau: boolean } = { plateau: false },
): LoadDecision {
  const [low, high] = state.repRange;

  // 0. Layoff: the set we'd progress off is stale, so it no longer describes today's capacity. Regress
  // instead — and short-circuit, because every rule below (including the plateau override, which a layoff
  // reliably TRIPS since the recent e1RMs are the old ones) would otherwise read the gap as a reason to
  // add load.
  const retention = layoffRetention(topSet.daysSince);
  if (retention < 1) return regressForLayoff(state, topSet, retention);

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

  // 3. Re-anchor UP into the range. The logged set can sit below the slot's floor when the exercise was
  // last trained at a different rep target — a squat logged as a heavy 5 landing in a 12-20 hypertrophy
  // slot. Climbing one rep would prescribe 6 reps in a slot that asked for 12, training the wrong quality
  // at the wrong load for weeks. Move to the floor and scale the load down at matched estimated 1RM, so
  // the effort is equivalent rather than impossible. (Rules 1 and 2 already reset to `low`; only this
  // branch leaked, because Math.min clamps to the ceiling but nothing clamped to the floor.)
  if (topSet.reps < low) {
    const anchorRpe = state.targetRpe ?? topSet.rpe ?? 8;
    const e1rm = estimate1RM(topSet.weight, topSet.reps);
    const load = roundToStep(loadForRepsAtRpe(e1rm, low, anchorRpe), state.roundToStep);
    return {
      load,
      reps: low,
      timeSeconds: null,
      rationale: 'history below rep range → re-anchor to range floor at matched e1RM',
    };
  }

  // 4. Climb reps at the same load.
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
  // Layoff beats "met target last time" — that target was met before the gap, not through it.
  const retention = layoffRetention(topSet.daysSince);
  if (retention < 1) return regressForLayoff(state, topSet, retention);

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

  // LAYOFF — work capacity fades like strength does, so a stale duration gets scaled back rather than
  // bumped. Cardio still respects its prescribed range (never below the floor); an uncapped hold just
  // restarts shorter. With no logged duration there is nothing to regress, so fall through.
  const retention = layoffRetention(topSet.daysSince);
  if (retention < 1 && current > 0) {
    const regressed = Math.max(5, Math.round((current * retention) / 5) * 5);
    const next = state.timeRange
      ? Math.min(Math.max(regressed, state.timeRange[0]), state.timeRange[1])
      : regressed;
    return {
      load: topSet.weight,
      reps: null,
      timeSeconds: next,
      rationale: `${topSet.daysSince} days since last performed → regress duration off a stale effort`,
    };
  }

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
