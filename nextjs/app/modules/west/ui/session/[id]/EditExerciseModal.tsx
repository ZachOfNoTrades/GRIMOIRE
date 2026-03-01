"use client"

import { useState, useEffect } from "react";
import { Plus, StickyNote, X, Circle, CircleCheck } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import SubModal from "@/components/SubModal";
import { SessionExerciseWithSets } from "../../../types/sessionExercise";
import { Exercise } from "../../../types/exercise";

enum SetField {
  Weight = "weight",
  Reps = "reps",
  Rpe = "rpe",
  Notes = "notes",
}

interface EditExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (exercise: SessionExerciseWithSets) => void;
  onRemove: () => void;
  exercise: SessionExerciseWithSets | null;
  exercises: Exercise[];
  isSaving: boolean;
}

export default function EditExerciseModal({
  isOpen,
  onClose,
  onSave,
  onRemove,
  exercise,
  exercises,
  isSaving,
}: EditExerciseModalProps) {

  // INPUT
  const [editedExercise, setEditedExercise] = useState<SessionExerciseWithSets | null>(null);
  const [editedSetNotes, setEditedSetNotes] = useState("");

  // STATE
  const [notesSetId, setNotesSetId] = useState<string | null>(null);

  // DERIVED
  const warmupSets = editedExercise?.sets.filter((s) => s.is_warmup) ?? [];
  const workingSets = editedExercise?.sets.filter((s) => !s.is_warmup) ?? [];
  const targetWarmupCount = editedExercise?.target
    ? editedExercise.target.sets.filter((s) => s.is_warmup).length
    : 0;

  const targetWorkingCount = editedExercise?.target
    ? editedExercise.target.sets.filter((s) => !s.is_warmup).length
    : 0;

  const isTargetExerciseSwapped = editedExercise?.target &&
    editedExercise.target.exercise_id !== editedExercise.exercise_id;

  // Sync local state when modal opens, add additional set rows
  useEffect(() => {
    if (isOpen && exercise) {

      // Create a mutable clone of the given exercise to avoid unsaved edits
      const clonedExercise = JSON.parse(JSON.stringify(exercise));

      if (clonedExercise.target) {
        const targetWarmupCount = clonedExercise.target.sets.filter((s: { is_warmup: boolean }) => s.is_warmup).length;
        const targetWorkingCount = clonedExercise.target.sets.filter((s: { is_warmup: boolean }) => !s.is_warmup).length;
        const loggedWarmupCount = clonedExercise.sets.filter((s: { is_warmup: boolean }) => s.is_warmup).length;
        const loggedWorkingCount = clonedExercise.sets.filter((s: { is_warmup: boolean }) => !s.is_warmup).length;

        /**
         * CREATE ADDITIONAL SET ROWS
         * The following for loops add on to any existing logged set records from clonedExercise.
         * They add the difference between the existing logged set records and the total quantity of 
         * prescribed target sets.
         * 
         * If 0 logged sets and 2 target sets, creates 2 additional for a total of 2.
         * If 1 logged sets and 2 target sets, creates 1 additional for a total of 2.
         * If 3 logged sets and 2 target sets, creates 0 additional for a total of 3.
         */

        // Add additional warmup sets to reach target count, if necessary 
        for (let i = loggedWarmupCount + 1; i <= targetWarmupCount; i++) {
          clonedExercise.sets.push({
            id: crypto.randomUUID(),
            session_exercise_id: clonedExercise.id,
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
          clonedExercise.sets.push({
            id: crypto.randomUUID(),
            session_exercise_id: clonedExercise.id,
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

      setEditedExercise(clonedExercise);
    }
  }, [isOpen, exercise]);

  if (!editedExercise) return null;

  const handleExerciseChange = (exerciseId: string) => {
    const selectedExercise = exercises.find((e) => e.id === exerciseId);
    if (!selectedExercise) return;
    setEditedExercise({
      ...editedExercise,
      exercise_id: exerciseId,
      exercise_name: selectedExercise.name,
    });
  };

  const handleNotesChange = (notes: string) => {
    setEditedExercise({
      ...editedExercise,
      notes: notes || null,
    });
  };

  const handleSetFieldChange = (setId: string, field: SetField, value: string) => {
    const updatedSets = editedExercise.sets.map((set) => {
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
    setEditedExercise({ ...editedExercise, sets: updatedSets });
  };

  const handleAddSet = (isWarmup: boolean) => {
    const setsOfType = editedExercise.sets.filter((s) => s.is_warmup === isWarmup);

    const newSet = {
      id: crypto.randomUUID(),
      session_exercise_id: editedExercise.id,
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
    setEditedExercise({
      ...editedExercise,
      sets: [...editedExercise.sets, newSet],
    });
  };

  const handleClearSet = (setId: string, isBeyondTarget: boolean) => {

    // If given set index is greater than target set count, remove set
    if (isBeyondTarget) {
      const updatedSets = editedExercise.sets.filter((s) => s.id !== setId);
      setEditedExercise({ ...editedExercise, sets: updatedSets });
    }

    // If given set index is equal to target set count, clear set
    else {
      const updatedSets = editedExercise.sets.map((s) => {
        if (s.id !== setId) return s;
        return { ...s, weight: 0, reps: 0, rpe: null, notes: null, is_completed: false };
      });
      setEditedExercise({ ...editedExercise, sets: updatedSets });
    }

    // UI hides clear button for any other scenarios
  };

  const handleToggleSetCompleted = (setId: string) => {
    const set = editedExercise.sets.find((s) => s.id === setId);
    if (!set) return;

    // Find target set at the same set index so values can be copied into fields not entered by user
    const targetSetData = editedExercise.target?.sets.find(
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
      const updatedSets = editedExercise.sets.map((set) => {
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
      setEditedExercise({ ...editedExercise, sets: updatedSets });
    }

    // If handling toggling from ON to OFF
    else {

      // Iterate through all sets and edit the one to be un-marked complete
      const updatedSets = editedExercise.sets.map((set) => {
        if (set.id !== setId) return set; // If not desired set, exit
        return { ...set, is_completed: false };
      });
      setEditedExercise({ ...editedExercise, sets: updatedSets });
    }
  };

  // SET NOTES HANDLERS
  const handleOpenSetNotes = (setId: string) => {
    const set = editedExercise.sets.find((s) => s.id === setId);
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
    if (!editedExercise.exercise_id) {
      toast.error("Please select an exercise");
      return;
    }
    onSave(editedExercise);
  };

  // Create and build JSX for a set row
  const renderSetRow = (set: typeof editedExercise.sets[0], isLastInSection: boolean) => {
    const targetSet = editedExercise.target?.sets.find(
      (ts) => ts.is_warmup === set.is_warmup && ts.set_number === set.set_number
    );
    const exerciseTargetSetCount = set.is_warmup ? targetWarmupCount : targetWorkingCount;
    const hasSetData = set.weight > 0 || set.reps > 0 || set.rpe !== null || set.notes !== null;
    const isBeyondTarget = set.set_number > exerciseTargetSetCount; // Determines if current set index is greater than target set count
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
      title={editedExercise.exercise_name || "New Exercise"}
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
          value={editedExercise.exercise_id}
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
          <p className="text-secondary">Swapped from {editedExercise.target!.exercise_name}</p>
        )}
      </div>

      {/* NOTES INPUT */}
      <div>
        <label className="text-secondary">Notes</label>
        <input
          type="text"
          placeholder="Exercise notes..."
          value={editedExercise.notes || ""}
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
