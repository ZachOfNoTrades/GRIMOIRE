// Composer: ties the engine leaves (plateau detection → load decision → warmup ramp) into a full
// prescription (warmups + working sets) for one exercise filling one slot. Pure — no DB, no I/O.
// The DB-backed orchestrator lives in loader.ts; this stays testable in isolation.
import type { ProgressionState, PrescribedSet, E1rmPoint } from './types';
import type { TopSet } from './progression';
import { decideLoad } from './progression';
import { detectPlateau } from './volume';
import { warmupRamp } from './warmup';

export interface ExercisePrescription {
  warmups: PrescribedSet[];
  working: PrescribedSet[];
  load: number;
  reps: number | null;             // null for time-based prescriptions
  timeSeconds: number | null;      // populated for time_effort, null otherwise
  rationale: string;
}

// Fallback RPE used when we prescribe by feel (no history, or a weight with no RPE anchor) and the slot
// itself carries no targetRpe. ~"hard but a rep or two in reserve" — a safe self-regulated target.
const DEFAULT_FEEL_RPE = 8;

// Produce the next prescription for an exercise from its progression state, most recent top set,
// and e1RM history. Plateau (from history) feeds the double-progression override; warmups ramp off
// the decided load; working sets repeat at the decided load/reps for the slot's setTarget.
//
// LOW-CONFIDENCE LOAD → PRESCRIBE BY RPE: a bare weight is only useful when we can stand behind it.
// For rep-based work, when there is no history (baseline) OR the decision is a weight with no RPE anchor
// (slot has no targetRpe), the load is a guess — so drop the weight (0 = unset) and prescribe an RPE
// target instead. The user works to feel and we learn the real load from what they log. time_effort is
// unaffected (it already self-reports duration with no fabricated load).
export function buildPrescription(
  state: ProgressionState,
  topSet: TopSet,
  e1rmSeries: E1rmPoint[],
  options: { metTargetLastTime?: boolean; hasHistory?: boolean } = {},
): ExercisePrescription {
  const plateau = detectPlateau(e1rmSeries);
  const decision = decideLoad(state, topSet, {
    plateau,
    metTargetLastTime: options.metTargetLastTime ?? false,
  });

  const isTimeBased = state.model === 'time_effort';
  const noHistory = options.hasHistory === false;                              // not enough data
  const weightOnlyNoRpe = !isTimeBased && decision.load > 0 && state.targetRpe === null; // bare weight, no anchor
  const rpeBased = !isTimeBased && (noHistory || weightOnlyNoRpe);

  // RPE-based work has no anchor load to ramp from, so skip warmups. Time-based work has no load ramp
  // at all (warmups are a weight-percentage concept).
  const warmups = (isTimeBased || rpeBased) ? [] : warmupRamp(decision.load);

  const workingWeight = rpeBased ? 0 : decision.load;                          // 0 = unset, go by RPE
  const workingRpe = rpeBased ? (state.targetRpe ?? DEFAULT_FEEL_RPE) : state.targetRpe;
  const rationale = rpeBased
    ? (noHistory
        ? 'no history → prescribe by RPE (log your working weight)'
        : 'weight with no RPE anchor → prescribe by RPE instead of a bare weight')
    : decision.rationale;

  const working: PrescribedSet[] = [];
  for (let i = 0; i < state.setTarget; i++) {
    working.push({
      setNumber: i + 1,            // working sets number independently of warmups (schema rule)
      isWarmup: false,
      weight: workingWeight,
      reps: decision.reps,         // null for time_effort
      rpe: workingRpe,
      timeSeconds: decision.timeSeconds, // populated for time_effort, null otherwise
    });
  }

  return { warmups, working, load: workingWeight, reps: decision.reps, timeSeconds: decision.timeSeconds, rationale };
}
