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
  // Raw h/m/s text for the cardio time row currently being edited. While it is set, the three inputs
  // render these strings verbatim instead of the decomposed total, so typing "90" into Sec stays "90"
  // rather than resolving to 1 min 30 sec mid-keystroke. Cleared on blur, which is when the total
  // re-decomposes and the carry finally shows. Null when no time field is focused.
  const [timeDraft, setTimeDraft] = useState<{ setId: string; hours: string; minutes: string; seconds: string } | null>(null);

  // STATE
  const [notesSetId, setNotesSetId] = useState<string | null>(null);
  const [openMenuSetId, setOpenMenuSetId] = useState<string | null>(null);
  const [isWarmupExpanded, setIsWarmupExpanded] = useState(false);
  const menuAnchorRef = useRef<HTMLDivElement>(null);

  // DERIVED
  const warmupSets = editedSegment.sets.filter((s) => s.is_warmup);
  const workingSets = editedSegment.sets.filter((s) => !s.is_warmup);
  const completedWarmupCount = warmupSets.filter((s) => s.is_completed).length;
  const hasIncompleteWarmups = completedWarmupCount < warmupSets.length;
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

  // Helper: a zero component renders as an empty box, matching the `|| ""` display elsewhere
  const timePart = (value: number) => (value ? String(value) : "");

  // Open (or reuse) the raw-text draft for a set's cardio time row. Seeded from the stored total, so
  // whichever field the user focuses first, the other two keep showing what they already showed.
  const startTimeDraft = (setId: string) => {
    setTimeDraft((current) => {
      if (current?.setId === setId) return current;
      const set = editedSegment.sets.find((s) => s.id === setId);
      const time = decomposeTime(set?.time_seconds ?? null);
      return { setId, hours: timePart(time.hours), minutes: timePart(time.minutes), seconds: timePart(time.seconds) };
    });
  };

  // Drop the draft so the inputs fall back to the decomposed total — i.e. resolve 90 sec to 1 min 30 sec.
  // Enter-advance focuses the next field, which re-seeds a draft from the freshly normalized value.
  const handleTimeBlur = (setId: string) => {
    setTimeDraft(null);
    handleSetFieldBlur(setId);
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
      } else if (field === SetField.TimeSeconds && !isCardio) {
        // Direct seconds input (for timed non-cardio) — the only time field on the row, so no carry
        updatedSet.time_seconds = parseInt(value) || 0;
      } else if (field === SetField.TimeSeconds || field === SetField.TimeHours || field === SetField.TimeMinutes) {
        // Cardio h/m/s: recompose the total from the row's raw text, NOT from the stored total. Reading
        // the total back would re-decompose it, so a half-typed "9" -> "90" in Sec would compose against
        // an already-carried 1 min and land on 2:30. The draft holds exactly what the user has typed.
        const draft = timeDraft?.setId === setId
          ? timeDraft
          : (() => {
              const time = decomposeTime(set.time_seconds);
              return { hours: timePart(time.hours), minutes: timePart(time.minutes), seconds: timePart(time.seconds) };
            })();
        const next = {
          hours: field === SetField.TimeHours ? value : draft.hours,
          minutes: field === SetField.TimeMinutes ? value : draft.minutes,
          seconds: field === SetField.TimeSeconds ? value : draft.seconds,
        };
        setTimeDraft({ setId, ...next });
        updatedSet.time_seconds = composeTime(parseInt(next.hours) || 0, parseInt(next.minutes) || 0, parseInt(next.seconds) || 0);
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

    // Clone the last target set as a placeholder for the new set. The clone is a distinct row, so it
    // needs its OWN id — carrying the source set's id over makes two target sets share one id, and
    // since target set ids double as logged set ids for engine-planned sets (see
    // instantiateTargetAsSegment), the placeholder then collides with a real logged row's React key.
    const targetSetsOfType = editedSegment.target?.sets.filter((s) => s.is_warmup === isWarmup) ?? [];
    const lastTargetSet = targetSetsOfType.length > 0 ? targetSetsOfType[targetSetsOfType.length - 1] : null;
    const updatedTarget = editedSegment.target && lastTargetSet
      ? {
        ...editedSegment.target,
        sets: [...editedSegment.target.sets, { ...lastTargetSet, id: generateUUID(), set_number: newSetNumber }],
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

  // When a working set is logged at a value different from its prescribed target, carry that value
  // forward onto the FOLLOWING target sets that share the same prescribed value (stopping at the first
  // deviation, so deliberately different prescriptions like back-off sets are preserved). The carried
  // value is stored in a client-only `carried_*` field (the prescribed value is kept so the placeholder
  // can show "new (old)"); when there is NO prescription for the field the run is the contiguous
  // still-unprescribed sets and the placeholder shows just the carried value. This only updates the
  // displayed placeholder — it is NOT persisted (the segments PUT writes logged sets, never the target),
  // so it stays frontend-only per design.
  //
  // `prescribed` reads the field being carried off a target set; `applyCarry` writes the carried value
  // (null = clear) back onto one. Weight and RPE each supply their own pair below.
  type TargetSet = NonNullable<typeof editedSegment.target>["sets"][number];
  const carryLoggedValueToTargets = (
    target: typeof editedSegment.target,
    completedSet: { is_warmup: boolean; set_number: number },
    loggedValue: number,
    prescribed: (ts: TargetSet) => number | null,
    applyCarry: (ts: TargetSet, carried: number | null) => TargetSet,
  ): typeof editedSegment.target => {
    if (!target) return target;
    const originTarget = target.sets.find(
      (ts) => ts.is_warmup === completedSet.is_warmup && ts.set_number === completedSet.set_number
    );
    if (!originTarget) return target;

    const runValue = prescribed(originTarget); // the shared PRESCRIBED value following sets must match to follow
    const isReset = loggedValue === runValue; // logged back to the prescription → clear any prior carry on the run

    // Walk the same-type target sets in order after the completed one; carry (or reset) while their
    // PRESCRIBED value matches runValue. Compare on the prescription (not the carry) so a re-log re-cascades.
    const runSetNumbers = new Set<number>();
    const sameTypeSorted = target.sets
      .filter((ts) => ts.is_warmup === completedSet.is_warmup && ts.set_number > completedSet.set_number)
      .sort((a, b) => a.set_number - b.set_number);
    for (const ts of sameTypeSorted) {
      if (prescribed(ts) !== runValue) break; // first deviation ends the run (preserve back-offs etc.)
      runSetNumbers.add(ts.set_number);
    }
    if (runSetNumbers.size === 0) return target;

    return {
      ...target,
      sets: target.sets.map((ts) =>
        ts.is_warmup === completedSet.is_warmup && runSetNumbers.has(ts.set_number)
          ? applyCarry(ts, isReset ? null : loggedValue)
          : ts
      ),
    };
  };

  // Weight carry — a prescribed weight of 0 means "no target", so a run of still-zero sets carries the
  // bare logged weight. Nothing to carry without a real logged weight to propagate.
  const carryLoggedWeightToTargets = (
    target: typeof editedSegment.target,
    completedSet: { is_warmup: boolean; set_number: number },
    loggedWeight: number,
  ): typeof editedSegment.target =>
    loggedWeight <= 0
      ? target
      : carryLoggedValueToTargets(
          target,
          completedSet,
          loggedWeight,
          (ts) => ts.weight,
          (ts, carried) => ({ ...ts, carried_weight: carried }),
        );

  // RPE carry — logging an effort other than the prescribed one bumps the remaining sets' RPE target
  // (e.g. a null-weight 30s @ 7RPE x2 logged at 7.5 makes set 2 a 7.5RPE target). Unlike weight this is
  // NOT gated on the exercise being swapped: a rating of perceived exertion carries across exercises,
  // a load does not.
  const carryLoggedRpeToTargets = (
    target: typeof editedSegment.target,
    completedSet: { is_warmup: boolean; set_number: number },
    loggedRpe: number,
  ): typeof editedSegment.target =>
    carryLoggedValueToTargets(
      target,
      completedSet,
      loggedRpe,
      (ts) => ts.rpe,
      (ts, carried) => ({ ...ts, carried_rpe: carried }),
    );

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
            rpe: set.rpe !== null ? set.rpe : (targetSetData.carried_rpe ?? targetSetData.rpe),
            is_completed: true,
          };
        }

        // No target available, just mark completed
        return { ...set, is_completed: true };
      });

      // Carry the just-logged weight onto the remaining target sets (display-only) for weight-based
      // exercises whose target still translates (not a cardio slot, not a swapped exercise), then carry
      // the logged RPE the same way (which applies to every exercise, swapped or not).
      const completedSet = updatedSets.find((s) => s.id === setId);
      const weightCarriedTarget = (!isCardio && !isExerciseSwapped && completedSet)
        ? carryLoggedWeightToTargets(editedSegment.target, completedSet, completedSet.weight)
        : editedSegment.target;
      const updatedTarget = (completedSet && completedSet.rpe != null)
        ? carryLoggedRpeToTargets(weightCarriedTarget, completedSet, completedSet.rpe)
        : weightCarriedTarget;

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

  // Whether a set has enough data to be marked complete — a logged or prescribed rep count for
  // rep-based exercises, a logged or prescribed duration for timed ones. Mirrors what the row's
  // completion toggle requires, so Enter can only submit a set the user could tap complete.
  const canCompleteSet = (set: typeof editedSegment.sets[0]) => {
    const targetSet = editedSegment.target?.sets.find(
      (ts) => ts.is_warmup === set.is_warmup && ts.set_number === set.set_number
    );
    return isTimed
      ? (set.time_seconds != null && set.time_seconds > 0) || (targetSet?.time_seconds != null && targetSet.time_seconds > 0)
      : (set.reps != null && set.reps > 0) || (targetSet?.reps != null && targetSet.reps > 0);
  };

  // The set row's fields in the order they render, each paired with whether the user has entered a
  // value yet. Built per set because the visible fields depend on the exercise's modality:
  //   Rep-based: Weight → Reps → [Distance] → RPE
  //   Timed Strength/Mobility: Weight → Seconds → [Distance] → RPE
  //   Cardio: Hours → Minutes → Seconds → [Distance] → RPE
  const getSetFieldSequence = (set: typeof editedSegment.sets[0]) => {
    const sequence: { field: SetField; elementId: string; isFilled: boolean }[] = [];

    if (isCardio) {
      const time = decomposeTime(set.time_seconds);
      sequence.push({ field: SetField.TimeHours, elementId: `${set.id}-time-hours`, isFilled: time.hours > 0 });
      sequence.push({ field: SetField.TimeMinutes, elementId: `${set.id}-time-minutes`, isFilled: time.minutes > 0 });
      sequence.push({ field: SetField.TimeSeconds, elementId: `${set.id}-time-seconds`, isFilled: time.seconds > 0 });
    } else {
      sequence.push({ field: SetField.Weight, elementId: `${set.id}-weight`, isFilled: set.weight > 0 });
      if (isTimedNonCardio) {
        sequence.push({ field: SetField.TimeSeconds, elementId: `${set.id}-time-seconds`, isFilled: set.time_seconds != null && set.time_seconds > 0 });
      } else {
        sequence.push({ field: SetField.Reps, elementId: `${set.id}-reps`, isFilled: set.reps != null && set.reps > 0 });
      }
    }

    if (showDistance) {
      sequence.push({ field: SetField.Distance, elementId: `${set.id}-distance`, isFilled: set.distance != null && set.distance > 0 });
    }

    sequence.push({ field: SetField.Rpe, elementId: `${set.id}-rpe`, isFilled: set.rpe !== null });

    return sequence;
  };

  // Enter jumps to the next field the user still has to fill, in the row's own field order — so
  // filling the fields out of order (say RPE before weight) doesn't strand them. Once nothing after
  // the current field is left to fill, Enter SUBMITS rather than merely closing the keyboard: the
  // set is marked complete when it has enough data. On an already-completed set Enter just blurs,
  // since that is a correction rather than a fill-in sequence.
  const handleEnterAdvance = (e: React.KeyboardEvent<HTMLInputElement>, setId: string, field: SetField) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const set = editedSegment.sets.find((s) => s.id === setId);
    if (!set) return;

    const sequence = getSetFieldSequence(set);
    const currentIndex = sequence.findIndex((f) => f.field === field);
    const nextUnfilledField = currentIndex >= 0
      ? sequence.slice(currentIndex + 1).find((f) => !f.isFilled)
      : undefined;

    // ADVANCE — a later field in this row is still empty, so keep the keyboard up and move to it
    if (!set.is_completed && nextUnfilledField) {
      const nextInput = document.getElementById(nextUnfilledField.elementId);
      if (nextInput) {
        nextInput.focus();
        return;
      }
    }

    // SUBMIT — everything after this field is entered, so close the keyboard and log the set
    (e.target as HTMLInputElement).blur();
    if (!set.is_completed && canCompleteSet(set)) {
      handleToggleSetCompleted(setId);
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

    const canComplete = canCompleteSet(set);

    // Decompose time for cardio display. While the row's time fields are focused the raw draft text wins,
    // so a component the user is mid-way through typing isn't carried into the next unit under them.
    const timeComponents = decomposeTime(set.time_seconds);
    const targetTimeComponents = decomposeTime(targetSet?.time_seconds ?? null);
    const rowTimeDraft = timeDraft?.setId === set.id ? timeDraft : null;
    const timeValues = {
      hours: rowTimeDraft ? rowTimeDraft.hours : timePart(timeComponents.hours),
      minutes: rowTimeDraft ? rowTimeDraft.minutes : timePart(timeComponents.minutes),
      seconds: rowTimeDraft ? rowTimeDraft.seconds : timePart(timeComponents.seconds),
    };

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

    // RPE placeholder: a carried RPE (logged on an earlier set) shows as "new (old)" when there was a
    // prescribed RPE, or just "new" when there wasn't. Otherwise the bare prescribed RPE, or "-" when
    // there's none. Not suppressed on a swapped exercise — effort ratings translate, loads don't.
    let rpePlaceholder = "-";
    if (targetSet) {
      const carriedRpe = targetSet.carried_rpe ?? null;
      if (carriedRpe != null) {
        rpePlaceholder = targetSet.rpe != null ? `${carriedRpe} (${targetSet.rpe})` : String(carriedRpe);
      } else if (targetSet.rpe != null) {
        rpePlaceholder = String(targetSet.rpe);
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

        {/* H/M/S INPUTS (shown for cardio exercises). Min/Sec carry no `max` on purpose — an over-59
            entry is a legitimate shorthand ("90" sec) that resolves to the next unit up on blur, and a
            max would mark the field invalid mid-typing. */}
        {isCardio && (
          <>
            {/* HOURS */}
            <div className="flex flex-col flex-1 min-w-12">
              <label className={`text-secondary ${!isFirstInSection && 'hidden'}`}>Hours</label>
              <input
                id={`${set.id}-time-hours`}
                type="number"
                value={timeValues.hours}
                onChange={(e) => handleSetFieldChange(set.id, SetField.TimeHours, e.target.value)}
                className="input-field input-field-compact text-center"
                placeholder={targetTimeComponents.hours > 0 ? String(targetTimeComponents.hours) : "-"}
                onFocus={(e) => { startTimeDraft(set.id); e.target.select(); }}
                onBlur={() => handleTimeBlur(set.id)}
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
                value={timeValues.minutes}
                onChange={(e) => handleSetFieldChange(set.id, SetField.TimeMinutes, e.target.value)}
                className="input-field input-field-compact text-center"
                placeholder={targetTimeComponents.minutes > 0 ? String(targetTimeComponents.minutes) : "-"}
                onFocus={(e) => { startTimeDraft(set.id); e.target.select(); }}
                onBlur={() => handleTimeBlur(set.id)}
                onKeyDown={(e) => handleEnterAdvance(e, set.id, SetField.TimeMinutes)}
                min="0"
              />
            </div>

            {/* SECONDS */}
            <div className="flex flex-col flex-1 min-w-12">
              <label className={`text-secondary ${!isFirstInSection && 'hidden'}`}>Sec</label>
              <input
                id={`${set.id}-time-seconds`}
                type="number"
                value={timeValues.seconds}
                onChange={(e) => handleSetFieldChange(set.id, SetField.TimeSeconds, e.target.value)}
                className="input-field input-field-compact text-center"
                placeholder={targetTimeComponents.seconds > 0 ? String(targetTimeComponents.seconds) : "-"}
                onFocus={(e) => { startTimeDraft(set.id); e.target.select(); }}
                onBlur={() => handleTimeBlur(set.id)}
                onKeyDown={(e) => handleEnterAdvance(e, set.id, SetField.TimeSeconds)}
                min="0"
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
              onKeyDown={(e) => handleEnterAdvance(e, set.id, SetField.Distance)}
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
            placeholder={rpePlaceholder}
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
                {/* WARMUP HEADING WITH COLLAPSED COMPLETION TAG */}
                <div className="flex items-center gap-2">
                  <h3 className="text-h3">Warmup</h3>

                  {/* COMPLETED-OF-TOTAL TAG (collapsed only — the rows show it themselves once open) */}
                  {!isWarmupExpanded && warmupSets.length > 0 && (
                    <span
                      className={hasIncompleteWarmups ? "badge-yellow" : "badge-green"}
                      title={hasIncompleteWarmups
                        ? `${warmupSets.length - completedWarmupCount} of ${warmupSets.length} warmup ${warmupSets.length === 1 ? "set" : "sets"} not logged yet`
                        : `All ${warmupSets.length} warmup ${warmupSets.length === 1 ? "set" : "sets"} logged`}
                      aria-label={`${completedWarmupCount} of ${warmupSets.length} warmup ${warmupSets.length === 1 ? "set" : "sets"} logged`}
                    >
                      {completedWarmupCount}/{warmupSets.length}
                    </span>
                  )}
                </div>

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
