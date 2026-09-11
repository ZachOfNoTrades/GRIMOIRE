"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { DECK_NAME_MAX_LENGTH } from "../../../types/deck";

interface EditDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  description: string | null;
  sourceUrl: string | null;
  onSave: (name: string, description: string | null, sourceUrl: string | null) => Promise<void>;
}

export default function EditDeckModal({ isOpen, onClose, name, description, sourceUrl, onSave }: EditDeckModalProps) {

  // INPUT
  const [editName, setEditName] = useState(name);
  const [editDescription, setEditDescription] = useState(description || "");
  const [editSourceUrl, setEditSourceUrl] = useState(sourceUrl || "");

  // STATE
  const [isSaving, setIsSaving] = useState(false);

  // Reset fields when modal opens
  useEffect(() => {
    if (isOpen) {
      setEditName(name);
      setEditDescription(description || "");
      setEditSourceUrl(sourceUrl || "");
    }
  }, [isOpen, name, description, sourceUrl]);

  const handleSave = async () => {
    if (!editName.trim()) return;

    setIsSaving(true);
    try {
      await onSave(editName.trim(), editDescription.trim() || null, editSourceUrl.trim() || null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Deck"
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
            disabled={isSaving || !editName.trim()}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      }
    >
      {/* NAME FIELD */}
      <div className="mb-4">
        <label className="text-label mb-1 block">Name</label>
        <input
          type="text"
          className="input-field w-full"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          maxLength={DECK_NAME_MAX_LENGTH}
          autoFocus
        />
      </div>

      {/* DESCRIPTION FIELD */}
      <div className="mb-4">
        <label className="text-label mb-1 block">Description</label>
        <textarea
          className="input-field w-full"
          rows={3}
          value={editDescription}
          onChange={(e) => setEditDescription(e.target.value)}
          placeholder="Optional"
        />
      </div>

      {/* SOURCE URL FIELD */}
      <div>
        <label className="text-label mb-1 block">Notion Source URL</label>
        <input
          type="text"
          className="input-field w-full"
          value={editSourceUrl}
          onChange={(e) => setEditSourceUrl(e.target.value)}
          placeholder="https://notion.so/..."
        />
      </div>
    </Modal>
  );
}
