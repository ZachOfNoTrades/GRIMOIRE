"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { CardWithProgress } from "../../../../types/card";

interface ManageCardModalProps {
  isOpen: boolean;
  editCard?: CardWithProgress | null;
  onClose: () => void;
  onAdd: (front: string, back: string, notes: string | null) => Promise<void>;
  onEdit: (cardId: string, front: string, back: string, notes: string | null) => Promise<void>;
}

export default function ManageCardModal({ isOpen, editCard, onClose, onAdd, onEdit }: ManageCardModalProps) {
  // INPUT
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [notes, setNotes] = useState("");

  // STATE
  const [isSaving, setIsSaving] = useState(false);

  // DERIVED
  const isEditing = !!editCard;

  // Populate fields when editing, reset when adding
  useEffect(() => {
    if (editCard) {
      setFront(editCard.front);
      setBack(editCard.back);
      setNotes(editCard.notes || "");
    } else if (isOpen) {
      setFront("");
      setBack("");
      setNotes("");
    }
  }, [isOpen, editCard]);

  const handleSave = async () => {
    if (!front.trim() || !back.trim()) return;

    setIsSaving(true);
    try {
      if (isEditing) {
        await onEdit(editCard!.id, front.trim(), back.trim(), notes.trim() || null);
      } else {
        await onAdd(front.trim(), back.trim(), notes.trim() || null);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Card" : "Add Card"}
      footer={
        <div className="flex gap-2 justify-end">
          {/* CANCEL BUTTON */}
          <Button onClick={onClose} className="btn-off">
            Cancel
          </Button>

          {/* SAVE BUTTON */}
          <Button
            onClick={handleSave}
            className="btn-blue"
            disabled={isSaving || !front.trim() || !back.trim()}
          >
            {isSaving ? "Saving..." : isEditing ? "Save" : "Add"}
          </Button>
        </div>
      }
    >
      {/* FRONT FIELD */}
      <div className="mb-4">
        <label className="text-label mb-1 block">Front</label>
        <textarea
          className="input-field w-full"
          rows={3}
          value={front}
          onChange={(e) => setFront(e.target.value)}
        />
      </div>

      {/* BACK FIELD */}
      <div className="mb-4">
        <label className="text-label mb-1 block">Back</label>
        <textarea
          className="input-field w-full"
          rows={3}
          value={back}
          onChange={(e) => setBack(e.target.value)}
        />
      </div>

      {/* NOTES FIELD */}
      <div>
        <label className="text-label mb-1 block">Notes</label>
        <textarea
          className="input-field w-full"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
        />
      </div>
    </Modal>
  );
}
