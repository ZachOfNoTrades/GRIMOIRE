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

// Fallback RPE used when we prescribe by feel (no history) or when the slot carries no targetRpe of its
// own. ~"hard but a rep or two in reserve" — a safe self-regulated target.
const DEFAULT_FEEL_RPE = 8;

// Produce the next prescription for an exercise from its progression state, most recent top set,
// and e1RM history. Plateau (from history) feeds the double-progression override; warmups ramp off
// the decided load; working sets repeat at the decided load/reps for the slot's setTarget.
//
// NO HISTORY → PRESCRIBE BY RPE: a bare weight is only useful when we can stand behind it. For rep-based
// work with no logged history the load would be fabricated, so drop the weight (0 = unset) and prescribe
// an RPE target instead — the user works to feel and we learn the real load from what they log.
// A load derived from REAL logged history is NOT a guess, so it is always kept, even when the slot defines
// no targetRpe: dropping it there stripped the weight off well-established lifts (a 25 lb Hammer Curl
// rendering as "BW x 10"). Such a slot instead gets DEFAULT_FEEL_RPE alongside the weight as an advisory
// intensity anchor. time_effort is unaffected (it self-reports duration with no fabricated load).
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
  const rpeBased = !isTimeBased && noHistory;                                  // cold start → go by feel
  // History-backed load on a slot that defines no target RPE: keep the weight, add a feel-RPE guide.
  const weightNeedsRpeGuide = !isTimeBased && !noHistory && decision.load > 0 && state.targetRpe === null;

  // RPE-based work has no anchor load to ramp from, so skip warmups. Time-based work has no load ramp
  // at all (warmups are a weight-percentage concept).
  const warmups = (isTimeBased || rpeBased) ? [] : warmupRamp(decision.load);

  const workingWeight = rpeBased ? 0 : decision.load;                          // 0 = unset, go by RPE
  const workingRpe = (rpeBased || weightNeedsRpeGuide) ? (state.targetRpe ?? DEFAULT_FEEL_RPE) : state.targetRpe;
  const rationale = rpeBased
    ? 'no history → prescribe by RPE (log your working weight)'
    : weightNeedsRpeGuide
      ? `${decision.rationale} (slot has no target RPE → RPE ${DEFAULT_FEEL_RPE} as a guide)`
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
