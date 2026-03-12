"use client"

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";

interface AddExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddExerciseModal({
  isOpen,
  onClose,
  onSaved,
}: AddExerciseModalProps) {

  // INPUT
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Strength");

  // STATE
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName("");
      setDescription("");
      setCategory("Strength");
      setError(null);
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Exercise name is required");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/modules/golem/api/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          category,
        }),
      });

      if (response.status === 409) {
        setError("An exercise with this name already exists");
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to create exercise");
      }

      onSaved();
      onClose();
    } catch (error) {
      console.error("Error creating exercise:", error);
      setError("Failed to create exercise");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Exercise"
      disableClose={isSaving}
      footer={
        <>
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
            disabled={isSaving || !name.trim()}
            className="btn-blue"
          >
            {isSaving ? "Saving..." : "Add Exercise"}
          </Button>
        </>
      }
    >
      {/* NAME INPUT */}
      <div className="flex flex-col gap-1">
        <label className="text-label">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Bench Press"
          className="input-field"
          autoCapitalize="words"
          autoFocus
        />
      </div>

      {/* DESCRIPTION INPUT */}
      <div className="flex flex-col gap-1">
        <label className="text-label">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description..."
          className="input-field min-h-[80px] resize-y"
          rows={3}
        />
      </div>

      {/* CATEGORY SELECT */}
      <div className="flex flex-col gap-1">
        <label className="text-label">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="input-field"
        >
          <option value="Strength">Strength</option>
          <option value="Cardio">Cardio</option>
          <option value="Mobility">Mobility</option>
        </select>
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <p className="text-sm text-alert-red">{error}</p>
      )}
    </Modal>
  );
}
