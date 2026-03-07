"use client"

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";

interface AddTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddTemplateModal({
  isOpen,
  onClose,
  onSaved,
}: AddTemplateModalProps) {

  // INPUT
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // STATE
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName("");
      setDescription("");
      setError(null);
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Template name is required");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/modules/golem/api/program-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create template");
      }

      onSaved();
      onClose();
    } catch (error) {
      console.error("Error creating template:", error);
      setError("Failed to create template");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Template"
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
            className="btn-primary"
          >
            {isSaving ? "Saving..." : "Add Template"}
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
          placeholder="e.g. Powerlifting Template"
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

      {/* ERROR MESSAGE */}
      {error && (
        <p className="text-sm text-alert-error">{error}</p>
      )}
    </Modal>
  );
}
