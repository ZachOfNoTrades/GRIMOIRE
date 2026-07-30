"use client"

import { useState, useEffect, useRef } from "react";
import { Plus, StickyNote, X, Circle, CircleCheck, EllipsisVertical, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import PopoverMenu from "@/components/PopoverMenu";
import { SegmentWithSets } from "../../../types/segment";
import { generateUUID } from "../../../utils/id";
import { DistanceUnit, DISTANCE_UNIT_ABBREV, DEFAULT_SHORT_UNIT, metersToUnit, unitToMeters } from "../../../utils/units";

enum SetField {
  Weight = "weight",
  Reps = "reps",
  Rpe = "rpe",
  Notes = "notes",
  TimeSeconds = "time_seconds",
  TimeHours = "time_hours",
  TimeMinutes = "time_minutes",
  Distance = "distance",
}

interface SetTabProps {
  editedSegment: SegmentWithSets;
  setEditedSegment: (segment: SegmentWithSets) => void;
  isWarmupSegment: boolean;
  onAutoSave: (segment: SegmentWithSets) => void;
  exerciseCategory: string;
  isTimed: boolean;
  // Distance modality of the exercise ('short' | 'long' | null) and the resolved display unit for that
  // band, from the user's preferences. When distanceType is set, a distance input is shown per set.
  distanceType?: string | null;
  distanceUnit?: DistanceUnit;
  // Fired when a WORKING set transitions incomplete -> complete, so the session page can
  // start the between-sets rest timer. Not fired for warmup sets or un-completing a set.
  onSetCompleted?: () => void;
}

export default function SetTab({
  editedSegment,
  setEditedSegment,
  isWarmupSegment,
  onAutoSave,
  exerciseCategory,
  isTimed,
  distanceType,
  distanceUnit = DEFAULT_SHORT_UNIT,
  onSetCompleted,
}: SetTabProps) {

  // INPUT
  const [editedSetNotes, setEditedSetNotes] = useState("");

  // STATE
  const [notesSetId, setNotesSetId] = useState<string | null>(null);
  const [openMenuSetId, setOpenMenuSetId] = useState<string | null>(null);
  const [isWarmupExpanded, setIsWarmupExpanded] = useState(false);
  const menuAnchorRef = useRef<HTMLDivElement>(null);

  // DERIVED
  const warmupSets = editedSegment.sets.filter((s) => s.is_warmup);
  const workingSets = editedSegment.sets.filter((s) => !s.is_warmup);
  const isExerciseSwapped = editedSegment.target !== null && editedSegment.exercise_id !== editedSegment.target.exercise_id; // Target weights don't translate between exercises
  const isCardio = isTimed && exerciseCategory === "Cardio";
  const isTimedNonCardio = isTimed && exerciseCategory !== "Cardio";
  const showDistance = distanceType === "short" || distanceType === "long";

  // Prescribed target counts are captured on mount and stay fixed so added sets remain "beyond target"
  const [prescribedWarmupCount] = useState(() =>
    editedSegment.target ? editedSegment.target.sets.filter((s) => s.is_warmup).length : 0
  );
  const [prescribedWorkingCount] = useState(() =>
    editedSegment.target ? editedSegment.target.sets.filter((s) => !s.is_warmup).length : 0
  );

  // Helper: decompose time_seconds into { hours, minutes, seconds }
  const decomposeTime = (totalSeconds: number | null) => {
    if (!totalSeconds || totalSeconds <= 0) return { hours: 0, minutes: 0, seconds: 0 };
    return {
      hours: Math.floor(totalSeconds / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
    };
  };

  // Helper: compose h/m/s into total seconds
  const composeTime = (hours: number, minutes: number, seconds: number) => {
    return hours * 3600 + minutes * 60 + seconds;
  };

  const handleNotesChange = (notes: string) => {
    setEditedSegment({
      ...editedSegment,
      notes: notes || null,
    });
  };

  const handleSetFieldChange = (setId: string, field: SetField, value: string) => {
    const updatedSets = editedSegment.sets.map((set) => {
      if (set.id !== setId) return set;
      const updatedSet = { ...set };
      if (field === SetField.Weight) {
        updatedSet.weight = parseFloat(value) || 0;
      } else if (field === SetField.Reps) {
        updatedSet.reps = parseInt(value) || 0;
      } else if (field === SetField.Rpe) {
        updatedSet.rpe = value === "" ? null : parseFloat(value) || null;
      } else if (field === SetField.Notes) {
        updatedSet.notes = value || null;
      } else if (field === SetField.TimeSeconds) {
        // Direct seconds input (for timed non-cardio)
        updatedSet.time_seconds = parseInt(value) || 0;
      } else if (field === SetField.TimeHours) {
        // Cardio h/m/s: update hours component
        const current = decomposeTime(set.time_seconds);
        updatedSet.time_seconds = composeTime(parseInt(value) || 0, current.minutes, current.seconds);
      } else if (field === SetField.TimeMinutes) {
        // Cardio h/m/s: update minutes component
        const current = decomposeTime(set.time_seconds);
        updatedSet.time_seconds = composeTime(current.hours, parseInt(value) || 0, current.seconds);
      } else if (field === SetField.Distance) {
        // Input is in the display unit; store the canonical meters value.
        updatedSet.distance = value === "" ? null : unitToMeters(parseFloat(value) || 0, distanceUnit);
      }
      return updatedSet;
    });
    setEditedSegment({ ...editedSegment, sets: updatedSets });
  };

  const handleSetFieldBlur = (setId: string) => {
    const set = editedSegment.sets.find(s => s.id === setId);
    if (set?.is_completed) {
      onAutoSave(editedSegment);
    }
  };

  const handleAddSet = (isWarmup: boolean) => {
    const setsOfType = editedSegment.sets.filter((s) => s.is_warmup === isWarmup);
    const newSetNumber = setsOfType.length + 1;

    const newSet = {
      id: generateUUID(),
      session_segment_id: editedSegment.id,
      set_number: newSetNumber,
      is_warmup: isWarmup,
      reps: isTimed ? null : 0,
      weight: 0,
      rpe: null,
      time_seconds: isTimed ? 0 : null,
      distance: null,
      notes: null,
      is_completed: false,
      created_at: new Date(),
      modified_at: new Date(),
    };

    // Clone the last target set as a placeholder for the new set
    const targetSetsOfType = editedSegment.target?.sets.filter((s) => s.is_warmup === isWarmup) ?? [];
    const lastTargetSet = targetSetsOfType.length > 0 ? targetSetsOfType[targetSetsOfType.length - 1] : null;
    const updatedTarget = editedSegment.target && lastTargetSet
      ? {
        ...editedSegment.target,
        sets: [...editedSegment.target.sets, { ...lastTargetSet, set_number: newSetNumber }],
      }
      : editedSegment.target;

    setEditedSegment({
      ...editedSegment,
      target: updatedTarget,
      sets: [...editedSegment.sets, newSet],
    });
  };

  const handleClearSet = (setId: string, isBeyondTarget: boolean) => {

    // If given set index is greater than target set count, remove set
    if (isBeyondTarget) {
      const updatedSets = editedSegment.sets.filter((s) => s.id !== setId);
      setEditedSegment({ ...editedSegment, sets: updatedSets });
    }

    // If given set index is equal to target set count, clear set
    else {
      const updatedSets = editedSegment.sets.map((s) => {
        if (s.id !== setId) return s;
        return { ...s, weight: 0, reps: isTimed ? null : 0, rpe: null, time_seconds: isTimed ? 0 : null, distance: null, notes: null, is_completed: false };
      });
      setEditedSegment({ ...editedSegment, sets: updatedSets });
    }

    // UI hides clear button for any other scenarios
  };

  // When a working set is logged at a weight different from its prescribed target, carry that weight
  // forward onto the FOLLOWING target sets that share the same prescribed weight (stopping at the first
  // deviation, so deliberately different prescriptions like back-off sets are preserved). The carried
  // value is stored in `carried_weight` (the prescribed `weight` is kept so the placeholder can show
  // "new (old)"); for exercises with NO prescribed weight (weight 0, e.g. RPE-only hip thrust) the run is
  // the contiguous still-zero sets and the placeholder shows just the carried weight. This only updates
  // the displayed placeholder — it is NOT persisted (the segments PUT writes logged sets, never the
  // target), so it stays frontend-only per design.
  const carryLoggedWeightToTargets = (
    target: typeof editedSegment.target,
    completedSet: { is_warmup: boolean; set_number: number },
    loggedWeight: number,
  ): typeof editedSegment.target => {
    if (!target) return target;
    const originTarget = target.sets.find(
      (ts) => ts.is_warmup === completedSet.is_warmup && ts.set_number === completedSet.set_number
    );
    // Nothing to carry without a real logged weight to propagate.
    if (!originTarget || loggedWeight <= 0) return target;

    const runWeight = originTarget.weight; // the shared PRESCRIBED weight following sets must match to follow (0 = no-target run)
    const isReset = loggedWeight === runWeight; // logged back to the prescription → clear any prior carry on the run

    // Walk the same-type target sets in order after the completed one; carry (or reset) while their
    // PRESCRIBED weight matches runWeight. Compare on `weight` (not carried_weight) so a re-log re-cascades.
    const runSetNumbers = new Set<number>();
    const sameTypeSorted = target.sets
      .filter((ts) => ts.is_warmup === completedSet.is_warmup && ts.set_number > completedSet.set_number)
      .sort((a, b) => a.set_number - b.set_number);
    for (const ts of sameTypeSorted) {
      if (ts.weight !== runWeight) break; // first deviation ends the run (preserve back-offs etc.)
      runSetNumbers.add(ts.set_number);
    }
    if (runSetNumbers.size === 0) return target;

    return {
      ...target,
      sets: target.sets.map((ts) =>
        ts.is_warmup === completedSet.is_warmup && runSetNumbers.has(ts.set_number)
          ? { ...ts, carried_weight: isReset ? null : loggedWeight }
          : ts
      ),
    };
  };

  const handleToggleSetCompleted = (setId: string) => {
    const set = editedSegment.sets.find((s) => s.id === setId);
    if (!set) return;

    // Find target set at the same set index so values can be copied into fields not entered by user
    const targetSetData = editedSegment.target?.sets.find(
      (ts) => ts.is_warmup === set.is_warmup && ts.set_number === set.set_number
    );

    const hasLoggedSetData = set.weight > 0 || (set.reps != null && set.reps > 0) || set.rpe !== null || set.notes !== null || (set.time_seconds != null && set.time_seconds > 0);

    // If handling toggling from OFF to ON
    if (!set.is_completed) {

      // No target or logged data, can't toggle as complete
      if (!hasLoggedSetData && !targetSetData) {
        console.error(`handleToggleSetCompleted() called but set has no target or logged data!`);
        return;
      }

      // Iterate through all sets and edit the one to be marked complete
      const updatedSets = editedSegment.sets.map((set) => {
        if (set.id !== setId) return set; // If not the desired set, exit

        // Autofill empty fields from target when available (skip weight if exercise was swapped)
        if (targetSetData) {
          return {
            ...set,
            weight: set.weight > 0 ? set.weight : (isExerciseSwapped ? 0 : (targetSetData.carried_weight ?? targetSetData.weight)),
            reps: isTimed ? set.reps : ((set.reps != null && set.reps > 0) ? set.reps : targetSetData.reps),
            time_seconds: !isTimed ? set.time_seconds : ((set.time_seconds != null && set.time_seconds > 0) ? set.time_seconds : targetSetData.time_seconds),
            rpe: set.rpe !== null ? set.rpe : targetSetData.rpe,
            is_completed: true,
          };
        }

        // No target available, just mark completed
        return { ...set, is_completed: true };
      });

      // Carry the just-logged weight onto the remaining target sets (display-only) for weight-based
      // exercises whose target still translates (not a cardio slot, not a swapped exercise).
      const completedSet = updatedSets.find((s) => s.id === setId);
      const updatedTarget = (!isCardio && !isExerciseSwapped && completedSet)
        ? carryLoggedWeightToTargets(editedSegment.target, completedSet, completedSet.weight)
        : editedSegment.target;

      const updatedSegment = { ...editedSegment, target: updatedTarget, sets: updatedSets };
      setEditedSegment(updatedSegment);
      onAutoSave(updatedSegment);

      // Kick off the rest timer for working sets only (warmups don't need a tracked rest).
      if (!set.is_warmup) onSetCompleted?.();
    }

    // If handling toggling from ON to OFF
    else {

      // Iterate through all sets and edit the one to be un-marked complete
      const updatedSets = editedSegment.sets.map((set) => {
        if (set.id !== setId) return set; // If not desired set, exit
        return { ...set, is_completed: false };
      });
      const updatedSegment = { ...editedSegment, sets: updatedSets };
      setEditedSegment(updatedSegment);
      onAutoSave(updatedSegment);
    }
  };

  // SET NOTES HANDLERS
  const handleOpenSetNotes = (setId: string) => {
    const set = editedSegment.sets.find((s) => s.id === setId);
    setEditedSetNotes(set?.notes || "");
    setNotesSetId(setId);
  };

  const handleSaveSetNotes = () => {
    if (notesSetId === null) return;
    handleSetFieldChange(notesSetId, SetField.Notes, editedSetNotes.trim());
    setNotesSetId(null);
    setEditedSetNotes("");
  };

  const handleCancelSetNotes = () => {
    setNotesSetId(null);
    setEditedSetNotes("");
  };

  // Advance focus on Enter based on exercise layout
  // Rep-based: Weight → Reps → RPE → complete
  // Timed Strength/Mobility: Weight → Seconds → RPE → complete
  // Cardio: Hours → Minutes → Seconds → RPE → complete
  const handleEnterAdvance = (e: React.KeyboardEvent<HTMLInputElement>, setId: string, field: SetField) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const set = editedSegment.sets.find((s) => s.id === setId);
    if (!set) return;

    if (isCardio) {
      // Cardio: Hours → Minutes → Seconds → RPE → complete
      if (field === SetField.TimeHours) {
        document.getElementById(`${setId}-time-minutes`)?.focus();
      } else if (field === SetField.TimeMinutes) {
        document.getElementById(`${setId}-time-seconds`)?.focus();
      } else if (field === SetField.TimeSeconds) {
        if (set.rpe !== null) {
          (e.target as HTMLInputElement).blur();
        } else {
          document.getElementById(`${setId}-rpe`)?.focus();
        }
      } else if (field === SetField.Rpe) {
        (e.target as HTMLInputElement).blur();
        if (!set.is_completed) {
          const targetSet = editedSegment.target?.sets.find(
            (ts) => ts.is_warmup === set.is_warmup && ts.set_number === set.set_number
          );
          const hasData = set.time_seconds != null && set.time_seconds > 0;
          if (hasData || targetSet) handleToggleSetCompleted(setId);
        }
      }
    } else if (isTimedNonCardio) {
      // Timed Strength/Mobility: Weight → Seconds → RPE → complete
      if (field === SetField.Weight) {
        if (set.time_seconds != null && set.time_seconds > 0) {
          (e.target as HTMLInputElement).blur();
        } else {
          document.getElementById(`${setId}-time-seconds`)?.focus();
        }
      } else if (field === SetField.TimeSeconds) {
        if (set.rpe !== null) {
          (e.target as HTMLInputElement).blur();
        } else {
          document.getElementById(`${setId}-rpe`)?.focus();
        }
      } else if (field === SetField.Rpe) {
        (e.target as HTMLInputElement).blur();
        if (!set.is_completed) {
          const targetSet = editedSegment.target?.sets.find(
            (ts) => ts.is_warmup === set.is_warmup && ts.set_number === set.set_number
          );
          const hasData = set.time_seconds != null && set.time_seconds > 0;
          if (hasData || targetSet) handleToggleSetCompleted(setId);
        }
      }
    } else {
      // Rep-based: Weight → Reps → RPE → complete
      if (field === SetField.Weight) {
        if (set.reps != null && set.reps > 0) {
          (e.target as HTMLInputElement).blur();
        } else {
          document.getElementById(`${setId}-reps`)?.focus();
        }
      } else if (field === SetField.Reps) {
        if (set.rpe !== null) {
          (e.target as HTMLInputElement).blur();
        } else {
          document.getElementById(`${setId}-rpe`)?.focus();
        }
      } else if (field === SetField.Rpe) {
        (e.target as HTMLInputElement).blur();
        if (!set.is_completed) {
          const targetSet = editedSegment.target?.sets.find(
            (ts) => ts.is_warmup === set.is_warmup && ts.set_number === set.set_number
          );
          const hasData = set.reps != null && set.reps > 0;
          if (hasData || targetSet) handleToggleSetCompleted(setId);
        }
      }
    }
  };

  // Create and build JSX for a set row
  const renderSetRow = (set: typeof editedSegment.sets[0], isFirstInSection: boolean, isLastInSection: boolean) => {
    const targetSet = editedSegment.target?.sets.find(
      (ts) => ts.is_warmup === set.is_warmup && ts.set_number === set.set_number
    );
    const segmentTargetSetCount = set.is_warmup ? prescribedWarmupCount : prescribedWorkingCount;
    const isBeyondTarget = set.set_number > segmentTargetSetCount; // Determines if current set index is greater than target set count
    const showRemoveSet = isLastInSection && isBeyondTarget;
    const hasNotes = !!set.notes;

    const canComplete = isTimed
      ? (set.time_seconds != null && set.time_seconds > 0) || (targetSet && targetSet.time_seconds != null && targetSet.time_seconds > 0)
      : (set.reps != null && set.reps > 0) || (targetSet && targetSet.reps != null && targetSet.reps > 0);

    // Decompose time for cardio display
    const timeComponents = decomposeTime(set.time_seconds);
    const targetTimeComponents = decomposeTime(targetSet?.time_seconds ?? null);

    // Weight placeholder: a carried weight (logged on an earlier set) shows as "new (old)" when there was
    // a prescribed weight, or just "new" when there wasn't (e.g. RPE-only exercises). Otherwise the bare
    // prescribed weight, or "-" when there's none / the exercise was swapped.
    let weightPlaceholder = "-";
    if (targetSet && !isExerciseSwapped) {
      const carried = targetSet.carried_weight ?? null;
      if (carried != null && carried > 0) {
        weightPlaceholder = targetSet.weight > 0 ? `${carried} (${targetSet.weight})` : String(carried);
      } else if (targetSet.weight > 0) {
        weightPlaceholder = String(targetSet.weight);
      }
    }

    // Distance placeholder: the prescribed target distance in the display unit, or "-" when none.
    const targetDistanceInUnit = metersToUnit(targetSet?.distance ?? null, distanceUnit);
    const distancePlaceholder = targetDistanceInUnit != null && targetDistanceInUnit > 0 ? String(targetDistanceInUnit) : "-";

    return (
      <div key={set.id} className="relative flex items-center gap-2">

        {/* SET NOTES DOT */}
        {hasNotes && <div className="dot-blue absolute top-1 right-0" />}

        {/* SET INDICATOR BAR */}
        <div className={`${isFirstInSection ? 'mt-5' : ''} ${isBeyondTarget ? "bar-grey" : "bar-green"}`} />

        {/* COMPLETION TOGGLE */}
        <Button
          onClick={() => handleToggleSetCompleted(set.id)}
          className={`btn-link ${isFirstInSection ? 'mt-5' : ''} ${!canComplete ? 'invisible' : ''}`}
          title={set.is_completed ? "Mark incomplete" : "Mark complete"}
        >
          {set.is_completed
            ? <CircleCheck className="icon-green !w-4 !h-4" />
            : <Circle className="icon-gray !w-4 !h-4" />
          }
        </Button>

        {/* WEIGHT INPUT (hidden for cardio) */}
        {!isCardio && (
          <div className="flex flex-col flex-1 min-w-15">
            <label className={`text-secondary ${!isFirstInSection && 'hidden'}`}>Weight</label>
            <input
              id={`${set.id}-weight`}
              type="number"
              value={set.weight || ""}
              onChange={(e) => handleSetFieldChange(set.id, SetField.Weight, e.target.value)}
              className="input-field input-field-compact text-center"
              placeholder={weightPlaceholder}
              onFocus={(e) => e.target.select()}
              onBlur={() => handleSetFieldBlur(set.id)}
              onKeyDown={(e) => handleEnterAdvance(e, set.id, SetField.Weight)}
              step="0.5"
              min="0"
            />
          </div>
        )}

        {/* REPS INPUT (shown only for non-timed exercises) */}
        {!isTimed && (
          <div className="flex flex-col flex-1 min-w-15">
            <label className={`text-secondary ${!isFirstInSection && 'hidden'}`}>Reps</label>
            <input
              id={`${set.id}-reps`}
              type="number"
              value={set.reps || ""}
              onChange={(e) => handleSetFieldChange(set.id, SetField.Reps, e.target.value)}
              className="input-field input-field-compact text-center"
              placeholder={targetSet?.reps != null ? String(targetSet.reps) : "-"}
              onFocus={(e) => e.target.select()}
              onBlur={() => handleSetFieldBlur(set.id)}
              onKeyDown={(e) => handleEnterAdvance(e, set.id, SetField.Reps)}
              min="0"
            />
          </div>
        )}

        {/* SECONDS INPUT (shown for timed non-cardio exercises) */}
        {isTimedNonCardio && (
          <div className="flex flex-col flex-1 min-w-15">
            <label className={`text-secondary ${!isFirstInSection && 'hidden'}`}>Seconds</label>
            <input
              id={`${set.id}-time-seconds`}
              type="number"
              value={set.time_seconds || ""}
              onChange={(e) => handleSetFieldChange(set.id, SetField.TimeSeconds, e.target.value)}
              className="input-field input-field-compact text-center"
              placeholder={targetSet?.time_seconds != null ? String(targetSet.time_seconds) : "-"}
              onFocus={(e) => e.target.select()}
              onBlur={() => handleSetFieldBlur(set.id)}
              onKeyDown={(e) => handleEnterAdvance(e, set.id, SetField.TimeSeconds)}
              min="0"
            />
          </div>
        )}

        {/* H/M/S INPUTS (shown for cardio exercises) */}
        {isCardio && (
          <>
            {/* HOURS */}
            <div className="flex flex-col flex-1 min-w-12">
              <label className={`text-secondary ${!isFirstInSection && 'hidden'}`}>Hours</label>
              <input
                id={`${set.id}-time-hours`}
                type="number"
                value={timeComponents.hours || ""}
                onChange={(e) => handleSetFieldChange(set.id, SetField.TimeHours, e.target.value)}
                className="input-field input-field-compact text-center"
                placeholder={targetTimeComponents.hours > 0 ? String(targetTimeComponents.hours) : "-"}
                onFocus={(e) => e.target.select()}
                onBlur={() => handleSetFieldBlur(set.id)}
                onKeyDown={(e) => handleEnterAdvance(e, set.id, SetField.TimeHours)}
                min="0"
              />
            </div>

            {/* MINUTES */}
            <div className="flex flex-col flex-1 min-w-12">
              <label className={`text-secondary ${!isFirstInSection && 'hidden'}`}>Min</label>
              <input
                id={`${set.id}-time-minutes`}
                type="number"
                value={timeComponents.minutes || ""}
                onChange={(e) => handleSetFieldChange(set.id, SetField.TimeMinutes, e.target.value)}
                className="input-field input-field-compact text-center"
                placeholder={targetTimeComponents.minutes > 0 ? String(targetTimeComponents.minutes) : "-"}
                onFocus={(e) => e.target.select()}
                onBlur={() => handleSetFieldBlur(set.id)}
                onKeyDown={(e) => handleEnterAdvance(e, set.id, SetField.TimeMinutes)}
                min="0"
                max="59"
              />
            </div>

            {/* SECONDS */}
            <div className="flex flex-col flex-1 min-w-12">
              <label className={`text-secondary ${!isFirstInSection && 'hidden'}`}>Sec</label>
              <input
                id={`${set.id}-time-seconds`}
                type="number"
                value={timeComponents.seconds || ""}
                onChange={(e) => handleSetFieldChange(set.id, SetField.TimeSeconds, e.target.value)}
                className="input-field input-field-compact text-center"
                placeholder={targetTimeComponents.seconds > 0 ? String(targetTimeComponents.seconds) : "-"}
                onFocus={(e) => e.target.select()}
                onBlur={() => handleSetFieldBlur(set.id)}
                onKeyDown={(e) => handleEnterAdvance(e, set.id, SetField.TimeSeconds)}
                min="0"
                max="59"
              />
            </div>
          </>
        )}

        {/* DISTANCE INPUT (shown when the exercise tracks distance; value is in the user's chosen unit,
            stored as meters) */}
        {showDistance && (
          <div className="flex flex-col flex-1 min-w-15">
            <label className={`text-secondary ${!isFirstInSection && 'hidden'}`}>Dist ({DISTANCE_UNIT_ABBREV[distanceUnit]})</label>
            <input
              id={`${set.id}-distance`}
              type="number"
              value={metersToUnit(set.distance, distanceUnit) ?? ""}
              onChange={(e) => handleSetFieldChange(set.id, SetField.Distance, e.target.value)}
              className="input-field input-field-compact text-center"
              placeholder={distancePlaceholder}
              onFocus={(e) => e.target.select()}
              onBlur={() => handleSetFieldBlur(set.id)}
              onKeyDown={(e) => {
                // Enter advances to RPE (or blurs if RPE already set), keeping the distance field out of the
                // modality-specific advance chains in handleEnterAdvance.
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (set.rpe !== null) (e.target as HTMLInputElement).blur();
                else document.getElementById(`${set.id}-rpe`)?.focus();
              }}
              step="0.01"
              min="0"
            />
          </div>
        )}

        {/* RPE INPUT */}
        <div className="flex flex-col flex-1 min-w-15">
          <label className={`text-secondary ${!isFirstInSection && 'hidden'}`}>RPE</label>
          <input
            id={`${set.id}-rpe`}
            type="number"
            value={set.rpe ?? ""}
            onChange={(e) => handleSetFieldChange(set.id, SetField.Rpe, e.target.value)}
            className="input-field input-field-compact text-center"
            placeholder={targetSet?.rpe != null ? String(targetSet.rpe) : "-"}
            onFocus={(e) => e.target.select()}
            onBlur={() => handleSetFieldBlur(set.id)}
            onKeyDown={(e) => handleEnterAdvance(e, set.id, SetField.Rpe)}
            step="0.5"
            min="5"
            max="10"
          />
        </div>

        {/* ACTION MENU TRIGGER — popover content itself is a single shared
            instance rendered once below the set list (see menuAnchorRef),
            since only one set's menu can be open at a time. */}
        <div className={isFirstInSection ? 'mt-5' : ''} ref={openMenuSetId === set.id ? menuAnchorRef : undefined}>
          <Button
            onClick={() => setOpenMenuSetId(openMenuSetId === set.id ? null : set.id)}
            className="btn-link"
          >
            <EllipsisVertical className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  };

  // Mirrors renderSetRow's showRemoveSet derivation for whichever set's menu is open.
  const openMenuSet = editedSegment.sets.find((s) => s.id === openMenuSetId) ?? null;
  const showRemoveSetForOpenMenu = (() => {
    if (!openMenuSet) return false;
    const setsOfType = openMenuSet.is_warmup ? warmupSets : workingSets;
    const isLastInSection = setsOfType[setsOfType.length - 1]?.id === openMenuSet.id;
    const segmentTargetSetCount = openMenuSet.is_warmup ? prescribedWarmupCount : prescribedWorkingCount;
    const isBeyondTarget = openMenuSet.set_number > segmentTargetSetCount;
    return isLastInSection && isBeyondTarget;
  })();

  return (
    <>

      {/* SETS */}
      <div>
        <div className="space-y-4">

          {/* WARMUP SETS SECTION */}
          {isWarmupSegment ? (

            // Warmup-only segment: show warmup sets directly
            <div className="space-y-4 flex flex-col">
              {warmupSets.map((set, index) => renderSetRow(set, index === 0, index === warmupSets.length - 1))}
              <div className="flex justify-center">
                <Button onClick={() => handleAddSet(true)} className="btn-link">
                  <Plus className="w-4 h-4" />
                  <span>Add Warmup Set</span>
                </Button>
              </div>
            </div>
          ) : (

            // Regular segment: warmup sets in expandable dropdown
            <div className={`expandable-card ${isWarmupExpanded ? "expandable-card-open" : "py-1"}`}>
              <div
                className="expandable-card-toggle"
                onClick={() => setIsWarmupExpanded(!isWarmupExpanded)}
              >
                <h3 className="text-h3">Warmup</h3>
                {isWarmupExpanded ? (
                  <ChevronUp className="w-5 h-5 text-muted" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted" />
                )}
              </div>
              {isWarmupExpanded && (
                <div className="expandable-card-content">
                  {warmupSets.map((set, index) => renderSetRow(set, index === 0, index === warmupSets.length - 1))}
                  <div className="flex justify-center">
                    <Button onClick={() => handleAddSet(true)} className="btn-link">
                      <Plus className="w-4 h-4" />
                      <span>Add Warmup Set</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* WORKING SETS SECTION (hidden for warmup segments) */}
          {!isWarmupSegment && (
            <>

              {/* WORKING SETS */}
              <div className="space-y-4 flex flex-col">

                {/* WORKING SET ROWS */}
                {workingSets.map((set, index) => renderSetRow(set, index === 0, index === workingSets.length - 1))}

                {/* ADD WORKING SET BUTTON */}
                <div className="flex justify-center">
                  <Button
                    onClick={() => handleAddSet(false)}
                    className="btn-link w-auto"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Working Set</span>
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* NOTES INPUT */}
      <div>
        <label className="text-h2">Exercise Notes</label>
        <textarea
          placeholder="Exercise notes..."
          value={editedSegment.notes || ""}
          onChange={(e) => {
            handleNotesChange(e.target.value);
            const textarea = e.target;
            textarea.style.height = "auto";
            const maxHeight = parseFloat(getComputedStyle(textarea).lineHeight) * 5 + 16;
            const newHeight = textarea.scrollHeight;
            textarea.style.height = Math.min(newHeight, maxHeight) + "px";
            textarea.style.overflowY = newHeight > maxHeight ? "auto" : "hidden";
          }}
          onKeyDown={(e) => {
            // Plain Enter closes the keyboard (blurs); Shift+Enter still inserts a newline
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          onBlur={(e) => {
            const trimmedNotes = e.target.value.trim() || null;
            const updatedSegment = { ...editedSegment, notes: trimmedNotes };
            setEditedSegment(updatedSegment);
            onAutoSave(updatedSegment);
          }}
          className="input-field resize-none overflow-hidden"
          rows={1}
          ref={(el) => {
            if (el) {
              el.style.height = "auto";
              el.style.height = el.scrollHeight + "px";
              el.style.overflowY = "hidden";
            }
          }}
        />
      </div>

      {/* SET NOTES SUB-MODAL */}
      <Modal
        isOpen={notesSetId !== null}
        onClose={handleCancelSetNotes}
        title="Set Notes"
        zIndex={60}
        footer={
          <>

            {/* CANCEL BUTTON */}
            <Button
              onClick={handleCancelSetNotes}
              className="btn-link"
            >
              Cancel
            </Button>

            {/* SAVE BUTTON */}
            <Button
              onClick={handleSaveSetNotes}
              className="btn-green"
            >
              Save
            </Button>
          </>
        }
      >

        {/* NOTES TEXTAREA */}
        <textarea
          value={editedSetNotes}
          onChange={(e) => setEditedSetNotes(e.target.value)}
          className="input-field"
          rows={4}
          placeholder="Add notes for this set..."
        />
      </Modal>

      {/* SET ACTION MENU POPOVER — single shared instance for whichever set's
          menu is open (see menuAnchorRef on the trigger in renderSetRow) */}
      <PopoverMenu open={openMenuSet !== null} onClose={() => setOpenMenuSetId(null)} anchorRef={menuAnchorRef}>
        {openMenuSet && (<>

          {/* NOTES ITEM */}
          <button
            onClick={() => { handleOpenSetNotes(openMenuSet.id); setOpenMenuSetId(null); }}
            className="popover-item"
          >
            <StickyNote className="w-4 h-4 mr-3" />
            {openMenuSet.notes ? "Edit Notes" : "Add Notes"}
            {!!openMenuSet.notes && <div className="dot-blue ml-auto" />}
          </button>

          {/* REMOVE SET ITEM */}
          {showRemoveSetForOpenMenu && (
            <button
              onClick={() => { handleClearSet(openMenuSet.id, true); setOpenMenuSetId(null); }}
              className="popover-item"
            >
              <X className="w-4 h-4 mr-3" />
              Remove Set
            </button>
          )}
        </>)}
      </PopoverMenu>

    </>
  );
}
