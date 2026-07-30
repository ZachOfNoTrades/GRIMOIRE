"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { Deck } from "../../types/deck";

interface AddDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (deck: Deck) => void;
}

export default function AddDeckModal({ isOpen, onClose, onCreated }: AddDeckModalProps) {

  // INPUT
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  // STATE
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName("");
      setDescription("");
      setSourceUrl("");
      setError(null);
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Deck name is required");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/modules/rune/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          sourceUrl: sourceUrl.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create deck");
      }

      const deck: Deck = await response.json();
      onCreated(deck);
      onClose();
    } catch (error) {
      console.error("Error creating deck:", error);
      setError("Failed to create deck");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Deck"
      disableClose={isSaving}
      footer={
        <div className="flex gap-2 justify-end">
          {/* CANCEL BUTTON */}
          <Button onClick={onClose} disabled={isSaving} className="btn-off">
            Cancel
          </Button>

          {/* SAVE BUTTON */}
          <Button
            onClick={handleSave}
            className="btn-blue"
            disabled={isSaving || !name.trim()}
          >
            {isSaving ? "Saving..." : "Add Deck"}
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
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Spanish Vocabulary"
          autoFocus
        />
      </div>

      {/* DESCRIPTION FIELD */}
      <div className="mb-4">
        <label className="text-label mb-1 block">Description</label>
        <textarea
          className="input-field w-full"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
        />
      </div>

      {/* SOURCE URL FIELD */}
      <div>
        <label className="text-label mb-1 block">Notion Source URL</label>
        <input
          type="text"
          className="input-field w-full"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://notion.so/..."
        />
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <p className="text-sm text-alert-red mt-4">{error}</p>
      )}
    </Modal>
  );
}
