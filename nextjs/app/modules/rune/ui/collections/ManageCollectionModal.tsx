"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { DeckSummary } from "../../types/deck";
import { Collection } from "../../types/collection";

interface ManageCollectionModalProps {
  isOpen: boolean;
  // Present = edit mode; absent = create mode.
  collectionId?: string;
  initialName?: string;
  initialDescription?: string | null;
  initialDeckIds?: string[];
  onClose: () => void;
  onSaved: (collection: Collection | null) => void;
}

export default function ManageCollectionModal({
  isOpen,
  collectionId,
  initialName = "",
  initialDescription = null,
  initialDeckIds = [],
  onClose,
  onSaved,
}: ManageCollectionModalProps) {

  // DATA
  const [decks, setDecks] = useState<DeckSummary[]>([]);

  // INPUT
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);

  // STATE
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingDecks, setIsLoadingDecks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // DERIVED
  const isEditing = !!collectionId;

  // Reset the form and pull the deck list every time the modal opens, so a deck
  // created since the last open is immediately selectable.
  useEffect(() => {
    if (!isOpen) return;

    setName(initialName);
    setDescription(initialDescription ?? "");
    setSelectedDeckIds(initialDeckIds);
    setError(null);

    setIsLoadingDecks(true);
    fetch("/modules/rune/api/decks")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setDecks(data?.decks || []))
      .catch((error) => console.error("Error fetching decks:", error))
      .finally(() => setIsLoadingDecks(false));
  }, [isOpen]);

  // Toggle a deck's membership in the collection being edited.
  const toggleDeck = (deckId: string) => {
    setSelectedDeckIds((prev) =>
      prev.includes(deckId) ? prev.filter((id) => id !== deckId) : [...prev, deckId]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Collection name is required");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        isEditing ? `/modules/rune/api/collections/${collectionId}` : "/modules/rune/api/collections",
        {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            deckIds: selectedDeckIds,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        setError(errorData?.error || "Failed to save collection");
        return;
      }

      // Create returns the new row; update returns only a success envelope.
      const saved = isEditing ? null : ((await response.json()) as Collection);
      onSaved(saved);
      onClose();
    } catch (error) {
      console.error("Error saving collection:", error);
      setError("Failed to save collection");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Collection" : "Add Collection"}
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
            {isSaving ? "Saving..." : isEditing ? "Save" : "Add Collection"}
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
          placeholder="e.g. Fire Department"
          autoFocus
        />
      </div>

      {/* DESCRIPTION FIELD */}
      <div className="mb-4">
        <label className="text-label mb-1 block">Description</label>
        <textarea
          className="input-field w-full"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
        />
      </div>

      {/* DECK PICKER */}
      <div>
        <label className="text-label mb-1 block">Decks</label>

        {/* LOADING PLACEHOLDER */}
        {isLoadingDecks && (
          <div className="loading-container">
            <div className="loading-spinner" />
          </div>
        )}

        {/* EMPTY PLACEHOLDER */}
        {!isLoadingDecks && decks.length === 0 && (
          <p className="text-secondary">No decks yet — create a deck first.</p>
        )}

        {/* DECK CHECKBOXES */}
        {!isLoadingDecks && decks.length > 0 && (
          <div className="flex flex-col gap-2">
            {decks.map((deck) => (
              <label key={deck.id} className="flex items-center gap-2 cursor-pointer text-primary">
                <input
                  type="checkbox"
                  checked={selectedDeckIds.includes(deck.id)}
                  onChange={() => toggleDeck(deck.id)}
                />
                <span className="flex-1 min-w-0">{deck.name}</span>
                <span className="text-subtle text-sm whitespace-nowrap">{deck.due_count} due</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <p className="text-sm text-alert-red mt-4">{error}</p>
      )}
    </Modal>
  );
}
