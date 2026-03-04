"use client"

import { useState, useEffect } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import SubModal from "@/components/SubModal";
import { Exercise } from "../../../types/exercise";

interface ExercisePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
  exercises: Exercise[];
  onExerciseCreated: (exercise: Exercise) => void;
}

export default function ExercisePickerModal({
  isOpen,
  onClose,
  onSelect,
  exercises,
  onExerciseCreated,
}: ExercisePickerModalProps) {

  // INPUT
  const [searchQuery, setSearchQuery] = useState("");
  const [newExerciseName, setNewExerciseName] = useState("");

  // STATE
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setNewExerciseName("");
      setIsAdding(false);
      setError(null);
    }
  }, [isOpen]);

  // DERIVED
  const filteredExercises = exercises.filter((ex) =>
    ex.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateExercise = async () => {
    if (!newExerciseName.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/modules/west/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newExerciseName.trim(),
          description: null,
        }),
      });

      if (response.status === 409) {
        setError("An exercise with this name already exists");
        return;
      }

      if (!response.ok) throw new Error("Failed to create exercise");

      const created = await response.json();
      onExerciseCreated(created);
      onSelect(created);
      onClose();
    } catch (error) {
      console.error("Error creating exercise:", error);
      setError("Failed to create exercise");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SubModal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Exercise"
      disableClose={isSaving}
    >

      {/* SEARCH INPUT */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search exercises..."
          className="input-field !pl-9"
          autoFocus
        />
      </div>

      {/* EXERCISE LIST */}
      <div className="flex flex-col max-h-[50vh] overflow-y-auto -mx-4 px-4">
        {filteredExercises.length === 0 ? (
          <p className="text-secondary py-4 text-center">No exercises found</p>
        ) : (
          filteredExercises.map((ex) => (
            <button
              key={ex.id}
              onClick={() => { onSelect(ex); onClose(); }}
              className="text-left px-3 py-2.5 rounded-lg hover:bg-card transition-colors"
            >
              <span className="text-primary">{ex.name}</span>
            </button>
          ))
        )}
      </div>

      {/* ADD EXERCISE SECTION */}
      {isAdding ? (
        <div className="flex flex-col gap-2 border-t pt-3">
          <input
            type="text"
            value={newExerciseName}
            onChange={(e) => setNewExerciseName(e.target.value)}
            placeholder="Exercise name..."
            className="input-field"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateExercise(); }}
          />
          {error && <p className="text-sm text-alert-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => { setIsAdding(false); setNewExerciseName(""); setError(null); }}
              className="btn-link"
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateExercise}
              disabled={isSaving || !newExerciseName.trim()}
              className="btn-primary"
            >
              {isSaving ? "Adding..." : "Add"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-center border-t pt-3">
          <Button onClick={() => setIsAdding(true)} className="btn-link">
            <Plus className="w-4 h-4" />
            <span>New Exercise</span>
          </Button>
        </div>
      )}
    </SubModal>
  );
}
