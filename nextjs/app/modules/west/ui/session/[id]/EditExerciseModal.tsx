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
  const [notesSetIndex, setNotesSetIndex] = useState<number | null>(null);

  // Sync local state when modal opens
  useEffect(() => {
    if (isOpen && exercise) {
      setEditedExercise(JSON.parse(JSON.stringify(exercise)));
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

  const handleSetFieldChange = (setIndex: number, field: string, value: string) => {
    const updatedSets = [...editedExercise.sets];
    const set = { ...updatedSets[setIndex] };

    if (field === "weight") {
      set.weight = parseFloat(value) || 0;
    } else if (field === "reps") {
      set.reps = parseInt(value) || 0;
    } else if (field === "rpe") {
      set.rpe = value === "" ? null : parseFloat(value) || null;
    } else if (field === "notes") {
      set.notes = value || null;
    }

    updatedSets[setIndex] = set;
    setEditedExercise({ ...editedExercise, sets: updatedSets });
  };

  const handleAddSet = () => {
    const newSet = {
      id: crypto.randomUUID(),
      session_exercise_id: editedExercise.id,
      set_number: editedExercise.sets.length + 1,
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

  const handleRemoveSet = (setIndex: number) => {
    const updatedSets = editedExercise.sets.filter((_, i) => i !== setIndex);
    updatedSets.forEach((set, i) => { set.set_number = i + 1; });
    setEditedExercise({ ...editedExercise, sets: updatedSets });
  };

  // SET NOTES HANDLERS
  const handleOpenSetNotes = (setIndex: number) => {
    setEditedSetNotes(editedExercise.sets[setIndex].notes || "");
    setNotesSetIndex(setIndex);
  };

  const handleSaveSetNotes = () => {
    if (notesSetIndex === null) return;
    handleSetFieldChange(notesSetIndex, "notes", editedSetNotes);
    setNotesSetIndex(null);
    setEditedSetNotes("");
  };

  const handleCancelSetNotes = () => {
    setNotesSetIndex(null);
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
        <label className="text-primary">Sets</label>

        <div className="space-y-4">
          {editedExercise.sets.map((set, setIndex) => (

            // SET ROW
            <div key={set.id} className="flex items-center gap-2">

              {/* WEIGHT INPUT */}
              <div className="flex flex-col flex-1">
                <label className="text-secondary">Weight</label>
                <input
                  type="number"
                  value={set.weight}
                  onChange={(e) => handleSetFieldChange(setIndex, "weight", e.target.value)}
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
                  onChange={(e) => handleSetFieldChange(setIndex, "reps", e.target.value)}
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
                  onChange={(e) => handleSetFieldChange(setIndex, "rpe", e.target.value)}
                  className="input-field text-center"
                  placeholder="-"
                  step="0.5"
                  min="1"
                  max="10"
                />
              </div>

              {/* SET NOTES BUTTON */}
              <Button
                onClick={() => handleOpenSetNotes(setIndex)}
                className={`btn-link mt-5 ${set.notes && "btn-link-primary"}`}
                title={set.notes ? "Edit notes" : "Add notes"}
              >
                <StickyNote className="w-4 h-4" />
              </Button>

              {/* REMOVE SET BUTTON */}
              <Button
                onClick={() => handleRemoveSet(setIndex)}
                className="btn-link btn-link-delete mt-5"
                title="Remove set"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}

          {/* ADD SET BUTTON */}
          <Button
            onClick={handleAddSet}
            className="btn-link"
          >
            <Plus className="w-4 h-4" />
            <span>Add Set</span>
          </Button>
        </div>
      </div>

      {/* SET NOTES SUB-MODAL */}
      <SubModal
        isOpen={notesSetIndex !== null}
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
