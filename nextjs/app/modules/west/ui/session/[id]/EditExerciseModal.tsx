"use client"

import { useState, useEffect } from "react";
import { Plus, StickyNote, X } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import SubModal from "@/components/SubModal";
import { SessionExerciseWithSets } from "../../../types/sessionExercise";
import { Exercise } from "../../../types/exercise";

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

  // Sync local state when modal opens
  useEffect(() => {
    if (isOpen && exercise) {
      setEditedExercise(JSON.parse(JSON.stringify(exercise)));
    }
  }, [isOpen, exercise]);

  if (!editedExercise) return null;

  const warmupSets = editedExercise.sets.filter((s) => s.is_warmup);
  const workingSets = editedExercise.sets.filter((s) => !s.is_warmup);

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

  const handleSetFieldChange = (setId: string, field: string, value: string) => {
    const updatedSets = editedExercise.sets.map((set) => {
      if (set.id !== setId) return set;
      const updatedSet = { ...set };
      if (field === "weight") {
        updatedSet.weight = parseFloat(value) || 0;
      } else if (field === "reps") {
        updatedSet.reps = parseInt(value) || 0;
      } else if (field === "rpe") {
        updatedSet.rpe = value === "" ? null : parseFloat(value) || null;
      } else if (field === "notes") {
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
      created_at: new Date(),
      modified_at: new Date(),
    };
    setEditedExercise({
      ...editedExercise,
      sets: [...editedExercise.sets, newSet],
    });
  };

  const handleRemoveSet = (setId: string) => {
    const updatedSets = editedExercise.sets.filter((s) => s.id !== setId);

    // Recalculate set_number independently for warmup and working sets
    const updatedWarmupSets = updatedSets.filter((s) => s.is_warmup);
    const updatedWorkingSets = updatedSets.filter((s) => !s.is_warmup);
    updatedWarmupSets.forEach((s, i) => { s.set_number = i + 1; });
    updatedWorkingSets.forEach((s, i) => { s.set_number = i + 1; });

    setEditedExercise({ ...editedExercise, sets: [...updatedWarmupSets, ...updatedWorkingSets] });
  };

  // SET NOTES HANDLERS
  const handleOpenSetNotes = (setId: string) => {
    const set = editedExercise.sets.find((s) => s.id === setId);
    setEditedSetNotes(set?.notes || "");
    setNotesSetId(setId);
  };

  const handleSaveSetNotes = () => {
    if (notesSetId === null) return;
    handleSetFieldChange(notesSetId, "notes", editedSetNotes);
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
            {warmupSets.map((set) => (

              // SET ROW
              <div key={set.id} className="flex items-center gap-2">

                {/* WEIGHT INPUT */}
                <div className="flex flex-col flex-1">
                  <label className="text-secondary">Weight</label>
                  <input
                    type="number"
                    value={set.weight}
                    onChange={(e) => handleSetFieldChange(set.id, "weight", e.target.value)}
                    className="input-field text-center"
                    step="0.5"
                    min="0"
                  />
                </div>
                <span className="text-secondary mt-5">x</span>

                {/* REPS INPUT */}
                <div className="flex flex-col flex-1">
                  <label className="text-secondary">Reps</label>
                  <input
                    type="number"
                    value={set.reps}
                    onChange={(e) => handleSetFieldChange(set.id, "reps", e.target.value)}
                    className="input-field text-center"
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
                    onChange={(e) => handleSetFieldChange(set.id, "rpe", e.target.value)}
                    className="input-field text-center"
                    placeholder="-"
                    step="0.5"
                    min="1"
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

                {/* REMOVE SET BUTTON */}
                <Button
                  onClick={() => handleRemoveSet(set.id)}
                  className="btn-link btn-link-delete mt-5"
                  title="Remove set"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}

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
            {workingSets.map((set) => (

              // SET ROW
              <div key={set.id} className="flex items-center gap-2">

                {/* WEIGHT INPUT */}
                <div className="flex flex-col flex-1">
                  <label className="text-secondary">Weight</label>
                  <input
                    type="number"
                    value={set.weight}
                    onChange={(e) => handleSetFieldChange(set.id, "weight", e.target.value)}
                    className="input-field text-center"
                    step="0.5"
                    min="0"
                  />
                </div>
                <span className="text-secondary mt-5">x</span>

                {/* REPS INPUT */}
                <div className="flex flex-col flex-1">
                  <label className="text-secondary">Reps</label>
                  <input
                    type="number"
                    value={set.reps}
                    onChange={(e) => handleSetFieldChange(set.id, "reps", e.target.value)}
                    className="input-field text-center"
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
                    onChange={(e) => handleSetFieldChange(set.id, "rpe", e.target.value)}
                    className="input-field text-center"
                    placeholder="-"
                    step="0.5"
                    min="1"
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

                {/* REMOVE SET BUTTON */}
                <Button
                  onClick={() => handleRemoveSet(set.id)}
                  className="btn-link btn-link-delete mt-5"
                  title="Remove set"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}

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
