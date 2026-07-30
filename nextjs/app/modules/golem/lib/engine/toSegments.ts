// Maps engine output (GeneratedSlot[]) onto the persistence shape (GeneratedSegment[]) used by
// createGeneratedTargets → target_session_segments / target_session_segment_sets. Pure.
import type { GeneratedSegment } from '../../types/segment';
import type { GeneratedSlot } from './orchestrator';

// One slot → one target segment. A WORKING slot's sets are its warmup ramp (is_warmup=1) followed by the
// working sets (is_warmup=0), on a working (is_warmup=0) segment. A WARMUP slot is a whole warmup-exercise
// segment (is_warmup=1); its dose sets are all warmup sets so they never count as working volume.
// Set numbers increment independently within the warmup and working groups (schema rule).
export function generatedSlotsToSegments(slots: GeneratedSlot[]): GeneratedSegment[] {
  return slots.map((slot, index) => {
    const sets: GeneratedSegment['sets'] = [];

    // WARMUP SLOT — the segment itself is a warmup; every dose set is flagged is_warmup.
    if (slot.isWarmup) {
      let warmupSetNumber = 1;
      for (const w of slot.working) {
        sets.push({ set_number: warmupSetNumber++, is_warmup: true, reps: w.reps, weight: w.weight, rpe: w.rpe, time_seconds: w.timeSeconds });
      }
      return { exercise_id: slot.exerciseId, modifier_id: null, order_index: index + 1, is_warmup: true, slot_role: slot.slotRole, progression_model: slot.progressionModel, sets };
    }

    let warmupNumber = 1;
    for (const w of slot.warmups) {
      sets.push({ set_number: warmupNumber++, is_warmup: true, reps: w.reps, weight: w.weight, rpe: w.rpe, time_seconds: w.timeSeconds });
    }

    let workingNumber = 1;
    for (const w of slot.working) {
      sets.push({ set_number: workingNumber++, is_warmup: false, reps: w.reps, weight: w.weight, rpe: w.rpe, time_seconds: w.timeSeconds });
    }

    return { exercise_id: slot.exerciseId, modifier_id: null, order_index: index + 1, is_warmup: false, slot_role: slot.slotRole, progression_model: slot.progressionModel, sets };
  });
}
