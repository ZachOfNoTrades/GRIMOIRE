"use client"

import { useState, useEffect } from "react";
import { Plus, StickyNote, X, Circle, CircleCheck } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import SubModal from "@/components/SubModal";
import { SegmentWithSets } from "../../../types/sessionExercise";
import { Exercise } from "../../../types/exercise";

enum SetField {
  Weight = "weight",
  Reps = "reps",
  Rpe = "rpe",
  Notes = "notes",
}

interface EditSegmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (segment: SegmentWithSets) => void;
  onRemove: () => void;
  segment: SegmentWithSets | null;
  exercises: Exercise[];
  isSaving: boolean;
}

export default function EditSegmentModal({
  isOpen,
  onClose,
  onSave,
  onRemove,
  segment,
  exercises,
  isSaving,
}: EditSegmentModalProps) {

  // INPUT
  const [editedSegment, setEditedSegment] = useState<SegmentWithSets | null>(null);
  const [editedSetNotes, setEditedSetNotes] = useState("");

  // STATE
  const [notesSetId, setNotesSetId] = useState<string | null>(null);

  // DERIVED
  const warmupSets = editedSegment?.sets.filter((s) => s.is_warmup) ?? [];
  const workingSets = editedSegment?.sets.filter((s) => !s.is_warmup) ?? [];
  const targetWarmupCount = editedSegment?.target
    ? editedSegment.target.sets.filter((s) => s.is_warmup).length
    : 0;

  const targetWorkingCount = editedSegment?.target
    ? editedSegment.target.sets.filter((s) => !s.is_warmup).length
    : 0;

  const isTargetExerciseSwapped = editedSegment?.target &&
    editedSegment.target.exercise_id !== editedSegment.exercise_id;

  // Sync local state when modal opens, add additional set rows
  useEffect(() => {
    if (isOpen && segment) {

      // Create a mutable clone of the given segment to avoid unsaved edits
      const clonedSegment = JSON.parse(JSON.stringify(segment));

      if (clonedSegment.target) {
        const targetWarmupCount = clonedSegment.target.sets.filter((s: { is_warmup: boolean }) => s.is_warmup).length;
        const targetWorkingCount = clonedSegment.target.sets.filter((s: { is_warmup: boolean }) => !s.is_warmup).length;
        const loggedWarmupCount = clonedSegment.sets.filter((s: { is_warmup: boolean }) => s.is_warmup).length;
        const loggedWorkingCount = clonedSegment.sets.filter((s: { is_warmup: boolean }) => !s.is_warmup).length;

        /**
         * CREATE ADDITIONAL SET ROWS
         * The following for loops add on to any existing logged set records from clonedSegment.
         * They add the difference between the existing logged set records and the total quantity of
         * prescribed target sets.
         *
         * If 0 logged sets and 2 target sets, creates 2 additional for a total of 2.
         * If 1 logged sets and 2 target sets, creates 1 additional for a total of 2.
         * If 3 logged sets and 2 target sets, creates 0 additional for a total of 3.
         */

        // Add additional warmup sets to reach target count, if necessary
        for (let i = loggedWarmupCount + 1; i <= targetWarmupCount; i++) {
          clonedSegment.sets.push({
            id: crypto.randomUUID(),
            session_segment_id: clonedSegment.id,
            set_number: i,
            is_warmup: true,
            reps: 0,
            weight: 0,
            rpe: null,
            notes: null,
            is_completed: false,
            created_at: new Date(),
            modified_at: new Date(),
          });
        }

        // Add additional working sets to reach target count, if necessary
        for (let i = loggedWorkingCount + 1; i <= targetWorkingCount; i++) {
          clonedSegment.sets.push({
            id: crypto.randomUUID(),
            session_segment_id: clonedSegment.id,
            set_number: i,
            is_warmup: false,
            reps: 0,
            weight: 0,
            rpe: null,
            notes: null,
            is_completed: false,
            created_at: new Date(),
            modified_at: new Date(),
          });
        }
      }

      setEditedSegment(clonedSegment);
    }
  }, [isOpen, segment]);

  if (!editedSegment) return null;

  const handleExerciseChange = (exerciseId: string) => {
    const selectedExercise = exercises.find((e) => e.id === exerciseId);
    if (!selectedExercise) return;
    setEditedSegment({
      ...editedSegment,
      exercise_id: exerciseId,
      exercise_name: selectedExercise.name,
    });
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
      }
      return updatedSet;
    });
    setEditedSegment({ ...editedSegment, sets: updatedSets });
  };

  const handleAddSet = (isWarmup: boolean) => {
    const setsOfType = editedSegment.sets.filter((s) => s.is_warmup === isWarmup);

    const newSet = {
      id: crypto.randomUUID(),
      session_segment_id: editedSegment.id,
      set_number: setsOfType.length + 1,
      is_warmup: isWarmup,
      reps: 0,
      weight: 0,
      rpe: null,
      notes: null,
      is_completed: false,
      created_at: new Date(),
      modified_at: new Date(),
    };
    setEditedSegment({
      ...editedSegment,
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
        return { ...s, weight: 0, reps: 0, rpe: null, notes: null, is_completed: false };
      });
      setEditedSegment({ ...editedSegment, sets: updatedSets });
    }

    // UI hides clear button for any other scenarios
  };

  const handleToggleSetCompleted = (setId: string) => {
    const set = editedSegment.sets.find((s) => s.id === setId);
    if (!set) return;

    // Find target set at the same set index so values can be copied into fields not entered by user
    const targetSetData = editedSegment.target?.sets.find(
      (ts) => ts.is_warmup === set.is_warmup && ts.set_number === set.set_number
    );

    const hasLoggedSetData = set.weight > 0 || set.reps > 0 || set.rpe !== null || set.notes !== null;

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

        // Autofill empty fields from target when available
        if (targetSetData) {
          return {
            ...set,
            weight: set.weight > 0 ? set.weight : targetSetData.weight,
            reps: set.reps > 0 ? set.reps : targetSetData.reps,
            rpe: set.rpe !== null ? set.rpe : targetSetData.rpe,
            is_completed: true,
          };
        }

        // No target available, just mark completed
        return { ...set, is_completed: true };
      });
      setEditedSegment({ ...editedSegment, sets: updatedSets });
    }

    // If handling toggling from ON to OFF
    else {

      // Iterate through all sets and edit the one to be un-marked complete
      const updatedSets = editedSegment.sets.map((set) => {
        if (set.id !== setId) return set; // If not desired set, exit
        return { ...set, is_completed: false };
      });
      setEditedSegment({ ...editedSegment, sets: updatedSets });
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
    handleSetFieldChange(notesSetId, SetField.Notes, editedSetNotes);
    setNotesSetId(null);
    setEditedSetNotes("");
  };

  const handleCancelSetNotes = () => {
    setNotesSetId(null);
    setEditedSetNotes("");
  };

  const handleSave = () => {
    if (!editedSegment.exercise_id) {
      toast.error("Please select an exercise");
      return;
    }
    onSave(editedSegment);
  };

  // Create and build JSX for a set row
  const renderSetRow = (set: typeof editedSegment.sets[0], isLastInSection: boolean) => {
    const targetSet = editedSegment.target?.sets.find(
      (ts) => ts.is_warmup === set.is_warmup && ts.set_number === set.set_number
    );
    const segmentTargetSetCount = set.is_warmup ? targetWarmupCount : targetWorkingCount;
    const hasSetData = set.weight > 0 || set.reps > 0 || set.rpe !== null || set.notes !== null;
    const isBeyondTarget = set.set_number > segmentTargetSetCount; // Determines if current set index is greater than target set count
    const showDeleteSet = isLastInSection && (isBeyondTarget || hasSetData);
    const canComplete = hasSetData || !!targetSet; // Can complete if has data OR has target to autofill from

    return (
      <div key={set.id} className="flex items-center gap-2">

        {/* COMPLETION TOGGLE */}
        <Button
          onClick={() => handleToggleSetCompleted(set.id)}
          className={`btn-link mt-5 ${!canComplete ? 'invisible' : ''}`}
          title={set.is_completed ? "Mark incomplete" : "Mark complete"}
        >
          {set.is_completed
            ? <CircleCheck className="icon-success !w-4 !h-4" />
            : <Circle className="icon-muted !w-4 !h-4" />
          }
        </Button>

        {/* WEIGHT INPUT */}
        <div className="flex flex-col flex-1">
          <label className="text-secondary">Weight</label>
          <input
            type="number"
            value={set.weight || ""}
            onChange={(e) => handleSetFieldChange(set.id, SetField.Weight, e.target.value)}
            className="input-field text-center"
            placeholder={targetSet ? String(targetSet.weight) : "-"}
            step="0.5" // TODO add steps to schema for exercises
            min="0"
          />
        </div>
        <span className="text-secondary mt-5">x</span>

        {/* REPS INPUT */}
        <div className="flex flex-col flex-1">
          <label className="text-secondary">Reps</label>
          <input
            type="number"
            value={set.reps || ""}
            onChange={(e) => handleSetFieldChange(set.id, SetField.Reps, e.target.value)}
            className="input-field text-center"
            placeholder={targetSet ? String(targetSet.reps) : "-"}
            min="0"
          />
        </div>
        <span className="text-secondary mt-5">@</span>

        {/* RPE INPUT */}
        <div className="flex flex-col flex-1">
          <label className="text-secondary">RPE</label>
          <input
            type="number"
            value={set.rpe ?? ""}
            onChange={(e) => handleSetFieldChange(set.id, SetField.Rpe, e.target.value)}
            className="input-field text-center"
            placeholder={targetSet?.rpe != null ? String(targetSet.rpe) : "-"}
            step="0.5"
            min="5"
            max="10"
          />
        </div>

        {/* SET NOTES BUTTON */}
        <Button
          onClick={() => handleOpenSetNotes(set.id)}
          className={`btn-link mt-5 ${set.notes && "btn-link-primary"}`}
          title={set.notes ? "Edit notes" : "Add notes"}
        >
          <StickyNote className="w-4 h-4" />
        </Button>

        {/* CLEAR SET BUTTON */}
        <Button
          onClick={() => handleClearSet(set.id, isBeyondTarget)}
          className={`btn-link btn-link-delete mt-5 ${!showDeleteSet ? 'invisible' : ''}`}
          title="Clear set"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editedSegment.exercise_name || "New Exercise"}
      disableClose={isSaving}
      footer={
        <>

          {/* REMOVE BUTTON */}
          <Button
            onClick={onRemove}
            disabled={isSaving}
            className="btn-delete mr-auto"
          >
            Remove
          </Button>

          {/* CANCEL BUTTON */}
          <Button
            onClick={onClose}
            disabled={isSaving}
            className="btn-link"
          >
            Cancel
          </Button>

          {/* SAVE BUTTON */}
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-success"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </>
      }
    >

      {/* EXERCISE DROPDOWN */}
      <div>
        <label className="text-secondary">Exercise</label>
        <select
          value={editedSegment.exercise_id}
          onChange={(e) => handleExerciseChange(e.target.value)}
          className="input-field"
        >
          <option value="" disabled>Select an exercise...</option>
          {exercises.map((ex) => (
            <option key={ex.id} value={ex.id}>{ex.name}</option>
          ))}
        </select>

        {/* ORIGINAL TARGET HINT */}
        {isTargetExerciseSwapped && (
          <p className="text-secondary">Swapped from {editedSegment.target!.exercise_name}</p>
        )}
      </div>

      {/* NOTES INPUT */}
      <div>
        <label className="text-secondary">Notes</label>
        <input
          type="text"
          placeholder="Exercise notes..."
          value={editedSegment.notes || ""}
          onChange={(e) => handleNotesChange(e.target.value)}
          className="input-field"
        />
      </div>

      {/* SETS */}
      <div>
        <label className="text-h1">Sets</label>

        <div className="space-y-4">

          {/* WARMUP SETS SECTION */}
          <div className="space-y-4 flex flex-col">

            {/* SECTION LABEL */}
            <label className="text-h2">Warmup</label>

            {/* WARMUP SET ROWS */}
            {warmupSets.map((set, index) => renderSetRow(set, index === warmupSets.length - 1))}

            {/* ADD WARMUP SET BUTTON */}
            <Button
              onClick={() => handleAddSet(true)}
              className="btn-link"
            >
              <Plus className="w-4 h-4" />
              <span>Add Warmup Set</span>
            </Button>
          </div>

          {/* SECTION DIVIDER */}
          <div className="border-t" />

          {/* WORKING SETS SECTION */}
          <div className="space-y-4 flex flex-col">

            {/* SECTION LABEL */}
            <label className="text-h2">Working</label>

            {/* WORKING SET ROWS */}
            {workingSets.map((set, index) => renderSetRow(set, index === workingSets.length - 1))}

            {/* ADD WORKING SET BUTTON */}
            <Button
              onClick={() => handleAddSet(false)}
              className="btn-link"
            >
              <Plus className="w-4 h-4" />
              <span>Add Working Set</span>
            </Button>
          </div>
        </div>
      </div>

      {/* SET NOTES SUB-MODAL */}
      <SubModal
        isOpen={notesSetId !== null}
        onClose={handleCancelSetNotes}
        title="Set Notes"
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
              className="btn-success"
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
          autoFocus
        />
      </SubModal>
    </Modal>
  );
}
