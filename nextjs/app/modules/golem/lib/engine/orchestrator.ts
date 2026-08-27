// Session orchestrator: fills a day archetype's slots via the selection scorer, then prescribes loads
// for each via the loading engine — producing the per-slot generated output that maps onto GeneratedSegment[].
// Production composition (value imports of selection/prescribe → wrapped by the API route at runtime).
import type { ProgressionState, PrescribedSet, E1rmPoint } from './types';
import type { TopSet } from './progression';
import type { ScoringCandidate, SlotSpec, SelectionContext, PinOutcome } from './selection';
import { selectForSlot } from './selection';
import { buildPrescription } from './prescribe';
import { LAYOFF_BASELINE_DAYS } from './progression';

// A slot's full definition: who fills it (SlotSpec) + how it progresses (ProgressionState).
export interface SlotDefinition {
  slot: SlotSpec;
  progression: ProgressionState;
  isWarmup?: boolean; // warmup-exercise slot → fixed dose, no load progression, emitted as an is_warmup segment
  isOptional?: boolean; // day_slots.is_optional — a slot allowed to go unfilled without complaint
}

// The history an exercise needs to be loaded: most recent top set + e1RM trend.
export interface ExerciseHistory {
  topSet: TopSet | null;
  e1rmSeries: E1rmPoint[];
}

// One generated day: the filled slots plus any pin warnings raised while filling them (a pin that was
// overridden, substituted, or whose slot dropped out entirely — see PinOutcome in selection.ts).
export interface GeneratedDay {
  slots: GeneratedSlot[];
  warnings: string[];
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
  pinWarning: string | null; // set when the slot's pinned exercise was overridden or substituted (never silent)
}

// Human-readable text for a pin that didn't resolve cleanly. Pins commonly encode injury constraints, so
// a substitution must be legible at a glance — it names the pin, what blocked it, and what replaced it.
function pinWarningText(outcome: PinOutcome, pickedName: string | null, locationLabel: string | null): string {
  const where = locationLabel ? `at ${locationLabel}` : 'at your active location';
  const pinned = outcome.pinnedExerciseName ?? 'pinned exercise';
  const detail = outcome.detail.length > 0 ? `: ${outcome.detail.join(', ')}` : '';

  // PIN KEPT — the blocker is advisory rather than a safety/loggability constraint, so the user's choice
  // stands and the warning just names what was overridden.
  if (outcome.honored) {
    if (outcome.reason === 'not_a_carry') {
      return `pinned ${pinned} kept in a carry slot despite not being a loaded carry — a carry is meant to be locomotion under load`;
    }
    return `pinned ${pinned} kept despite missing equipment ${where}${detail} — check this location's equipment list`;
  }

  const replacement = pickedName ? `substituted ${pickedName}` : 'slot dropped (no eligible alternative)';
  switch (outcome.reason) {
    case 'not_in_pool':
      return `pinned exercise unavailable ${where} (on hold, disabled here, or not a mover for this slot's target) — ${replacement}`;
    case 'contraindicated':
      return `pinned ${pinned} is contraindicated for this slot${detail} — ${replacement}`;
    case 'requires_muscle':
      return `pinned ${pinned} doesn't meet this slot's required muscles${detail} — ${replacement}`;
    case 'requires_timed':
      return `pinned ${pinned} isn't logged by duration but this slot is timed — ${replacement}`;
    case 'requires_reps':
      return `pinned ${pinned} is logged by duration but this slot is rep-based — ${replacement}`;
    case 'category':
      return `pinned ${pinned} is the wrong category for this slot — ${replacement}`;
    case 'not_a_carry':
      return `pinned ${pinned} is not a loaded carry — ${replacement}`;
    default:
      return `pinned ${pinned} could not be used (${outcome.reason})${detail} — ${replacement}`;
  }
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
// complementarity), then prescribe its loads. Returns per-slot output ready to persist as targets,
// alongside any pin warnings — a slot's pinned exercise is never dropped or overridden in silence.
export function generateDay(
  slotDefinitions: SlotDefinition[],
  candidatesBySlotIndex: ScoringCandidate[][],
  historyByExerciseId: Map<string, ExerciseHistory>,
  baseContext: Omit<SelectionContext, 'alreadyChosenMuscleSets'>,
  options?: { locationLabel?: string | null; warmupLocationLabel?: string | null },
): GeneratedDay {
  const generated: GeneratedSlot[] = [];
  const chosenMuscleSets: string[][] = []; // grows as slots fill → drives complementarity
  const chosenExerciseIds: string[] = [];  // grows as slots fill → hard-dedup (no exercise twice in a day)
  const unfilledPinWarnings: string[] = []; // pins whose slot produced NO exercise → no row to hang them on

  for (let i = 0; i < slotDefinitions.length; i++) {
    const definition = slotDefinitions[i];
    const context: SelectionContext = { ...baseContext, alreadyChosenMuscleSets: chosenMuscleSets };
    // Exclude exercises already chosen earlier in this day (in addition to any caller-supplied exclusions).
    const slotWithDedup: SlotSpec = {
      ...definition.slot,
      excludeExerciseIds: [...definition.slot.excludeExerciseIds, ...chosenExerciseIds],
    };

    const { picked, pinOutcome } = selectForSlot(candidatesBySlotIndex[i] ?? [], slotWithDedup, context);

    // A pin that didn't resolve cleanly ALWAYS produces a warning — including when the slot ends up
    // empty, so a dropped pin can never disappear without a trace (the bug this replaces).
    const locationLabel = (definition.isWarmup ? options?.warmupLocationLabel : options?.locationLabel) ?? null;
    const pinWarning = pinOutcome ? pinWarningText(pinOutcome, picked?.candidate.name ?? null, locationLabel) : null;

    if (!picked) {
      // Nothing eligible. Emit nothing, but keep the pin warning alive on a slot-less carrier so the
      // caller still reports it.
      if (pinWarning) unfilledPinWarnings.push(`${definition.slot.role} slot: ${pinWarning}`);
      // A REQUIRED slot that vanishes is a hole in the day's stimulus, and every hard filter that could
      // have emptied the pool (timed-vs-reps, equipment, contraindication, carry's non-ambulatory rule)
      // is a data or config fact the user can act on. Silence here reads as "the archetype has no such
      // slot", so say it out loud — same contract as a pin that couldn't be honoured.
      else if (!definition.isOptional) {
        unfilledPinWarnings.push(
          `${definition.slot.role} slot: no eligible exercise ${locationLabel ? `at ${locationLabel}` : 'at your active location'} — nothing in the candidate pool passed this slot's filters`,
        );
      }
      continue;
    }

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
        rationale: pinWarning ? `${pinWarning} · warmup exercise (fixed dose, no load progression)` : 'warmup exercise (fixed dose, no load progression)',
        selectionScore: picked.score,
        isBaseline: false,
        isWarmup: true,
        pinWarning,
      });
      continue;
    }

    const history = historyByExerciseId.get(picked.candidate.exerciseId) ?? { topSet: null, e1rmSeries: [] };
    // A top set older than the layoff horizon is not history any more — six months out, the decayed
    // number is a worse anchor than no number at all, so treat it as a cold start and let the athlete
    // re-establish the load by feel. Inside the horizon, progression.ts regresses it instead.
    const staleHistory =
      history.topSet !== null &&
      history.topSet.daysSince !== null &&
      history.topSet.daysSince > LAYOFF_BASELINE_DAYS;
    const isBaseline = history.topSet === null || staleHistory;
    // No history → conservative baseline at the range floor (load 0 = bodyweight/unset, flagged for confirmation).
    // timeSeconds null → nextTimeEffort starts a time_effort slot at its time-range floor (current 0 < low → low).
    const topSet: TopSet = isBaseline
      ? {
          weight: 0,
          reps: definition.progression.repRange[0],
          rpe: definition.progression.targetRpe,
          timeSeconds: null,
          daysSince: null,
        }
      : history.topSet!;

    const prescription = buildPrescription(definition.progression, topSet, history.e1rmSeries, { hasHistory: !isBaseline });

    generated.push({
      slotRole: definition.slot.role,
      progressionModel: definition.progression.model,
      exerciseId: picked.candidate.exerciseId,
      exerciseName: picked.candidate.name,
      warmups: prescription.warmups,
      working: prescription.working,
      rationale: pinWarning ? `${pinWarning} · ${prescription.rationale}` : prescription.rationale,
      selectionScore: picked.score,
      isBaseline,
      isWarmup: false,
      pinWarning,
    });
  }

  // Every pin warning in one list: the ones attached to an emitted slot, plus the ones whose slot
  // produced no exercise at all (those have no row of their own, and dropping them would restore the
  // silent failure this exists to prevent).
  const warnings = [
    ...generated.filter((g) => g.pinWarning).map((g) => `${g.slotRole} slot: ${g.pinWarning}`),
    ...unfilledPinWarnings,
  ];

  return { slots: generated, warnings };
}
