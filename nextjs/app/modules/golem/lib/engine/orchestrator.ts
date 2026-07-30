// Session orchestrator: fills a day archetype's slots via the selection scorer, then prescribes loads
// for each via the loading engine — producing the per-slot generated output that maps onto GeneratedSegment[].
// Production composition (value imports of selection/prescribe → wrapped by the API route at runtime).
import type { ProgressionState, PrescribedSet, E1rmPoint } from './types';
import type { TopSet } from './progression';
import type { ScoringCandidate, SlotSpec, SelectionContext } from './selection';
import { selectForSlot } from './selection';
import { buildPrescription } from './prescribe';

// A slot's full definition: who fills it (SlotSpec) + how it progresses (ProgressionState).
export interface SlotDefinition {
  slot: SlotSpec;
  progression: ProgressionState;
  isWarmup?: boolean; // warmup-exercise slot → fixed dose, no load progression, emitted as an is_warmup segment
}

// The history an exercise needs to be loaded: most recent top set + e1RM trend.
export interface ExerciseHistory {
  topSet: TopSet | null;
  e1rmSeries: E1rmPoint[];
}

// One filled, prescribed slot.
export interface GeneratedSlot {
  slotRole: string;
  progressionModel: string;
  exerciseId: string;
  exerciseName: string;
  warmups: PrescribedSet[];
  working: PrescribedSet[];
  rationale: string;
  selectionScore: number;
  isBaseline: boolean; // true when no history → conservative baseline (flag for user confirmation)
  isWarmup: boolean;   // true when this slot is a warmup-exercise slot → maps to an is_warmup segment
}

// A warmup slot's fixed dose: setTarget sets at the range floor, no load, no RPE. Timed when the picked
// exercise logs by duration (or the slot carries a time range) → seconds from the range floor (null = self-report);
// otherwise rep-based at rep_low. All sets are flagged is_warmup so they're excluded from working volume/e1RM.
function warmupDose(progression: ProgressionState, candidateIsTimed: boolean): PrescribedSet[] {
  const timed = candidateIsTimed || progression.timeRange !== null;
  const sets: PrescribedSet[] = [];
  for (let i = 0; i < progression.setTarget; i++) {
    sets.push({
      setNumber: i + 1,
      isWarmup: true,
      weight: 0,
      reps: timed ? null : progression.repRange[0],
      rpe: null,
      timeSeconds: timed ? (progression.timeRange ? progression.timeRange[0] : null) : null,
    });
  }
  return sets;
}

// Generate one day: for each slot in order, score-select an exercise (respecting earlier picks for
// complementarity), then prescribe its loads. Returns per-slot output ready to persist as targets.
export function generateDay(
  slotDefinitions: SlotDefinition[],
  candidatesBySlotIndex: ScoringCandidate[][],
  historyByExerciseId: Map<string, ExerciseHistory>,
  baseContext: Omit<SelectionContext, 'alreadyChosenMuscleSets'>,
): GeneratedSlot[] {
  const generated: GeneratedSlot[] = [];
  const chosenMuscleSets: string[][] = []; // grows as slots fill → drives complementarity
  const chosenExerciseIds: string[] = [];  // grows as slots fill → hard-dedup (no exercise twice in a day)

  for (let i = 0; i < slotDefinitions.length; i++) {
    const definition = slotDefinitions[i];
    const context: SelectionContext = { ...baseContext, alreadyChosenMuscleSets: chosenMuscleSets };
    // Exclude exercises already chosen earlier in this day (in addition to any caller-supplied exclusions).
    const slotWithDedup: SlotSpec = {
      ...definition.slot,
      excludeExerciseIds: [...definition.slot.excludeExerciseIds, ...chosenExerciseIds],
    };

    const picked = selectForSlot(candidatesBySlotIndex[i] ?? [], slotWithDedup, context);
    if (!picked) continue; // nothing eligible (e.g. optional slot with no valid candidate)

    chosenExerciseIds.push(picked.candidate.exerciseId);
    chosenMuscleSets.push(picked.candidate.allMuscles);

    // WARMUP SLOT — a warmup exercise, not a working lift: no load progression, no plateau/RPE anchoring.
    // Prescribe a simple fixed dose (setTarget sets at the range floor) and flag it so it maps to an
    // is_warmup segment. Skips the loading engine entirely (history/e1RM are irrelevant to warmups).
    if (definition.isWarmup) {
      generated.push({
        slotRole: definition.slot.role,
        progressionModel: definition.progression.model,
        exerciseId: picked.candidate.exerciseId,
        exerciseName: picked.candidate.name,
        warmups: [],
        working: warmupDose(definition.progression, !!picked.candidate.isTimed),
        rationale: 'warmup exercise (fixed dose, no load progression)',
        selectionScore: picked.score,
        isBaseline: false,
        isWarmup: true,
      });
      continue;
    }

    const history = historyByExerciseId.get(picked.candidate.exerciseId) ?? { topSet: null, e1rmSeries: [] };
    const isBaseline = history.topSet === null;
    // No history → conservative baseline at the range floor (load 0 = bodyweight/unset, flagged for confirmation).
    // timeSeconds null → nextTimeEffort starts a time_effort slot at its time-range floor (current 0 < low → low).
    const topSet: TopSet = history.topSet ?? {
      weight: 0,
      reps: definition.progression.repRange[0],
      rpe: definition.progression.targetRpe,
      timeSeconds: null,
    };

    const prescription = buildPrescription(definition.progression, topSet, history.e1rmSeries, { hasHistory: !isBaseline });

    generated.push({
      slotRole: definition.slot.role,
      progressionModel: definition.progression.model,
      exerciseId: picked.candidate.exerciseId,
      exerciseName: picked.candidate.name,
      warmups: prescription.warmups,
      working: prescription.working,
      rationale: prescription.rationale,
      selectionScore: picked.score,
      isBaseline,
      isWarmup: false,
    });
  }

  return generated;
}
