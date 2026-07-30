"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { CardWithProgress } from "../../../../types/card";
import RichCardEditor from "../../../../components/RichCardEditor";

interface ManageCardModalProps {
  isOpen: boolean;
  editCard?: CardWithProgress | null;
  onClose: () => void;
  onAdd: (front: string, back: string, notes: string | null, category: string | null, isDraft: boolean) => Promise<void>;
  onEdit: (cardId: string, front: string, back: string, notes: string | null, category: string | null, isDraft: boolean) => Promise<void>;
  // Existing category names in this deck, for the datalist suggestion — keeps
  // categories consistent (e.g. "Ground Ladders" vs "ground ladders") without
  // forcing a rigid enum.
  existingCategories?: string[];
}

export default function ManageCardModal({ isOpen, editCard, onClose, onAdd, onEdit, existingCategories = [] }: ManageCardModalProps) {
  // INPUT
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("");
  const [isDraft, setIsDraft] = useState(false);

  // STATE
  const [isSaving, setIsSaving] = useState(false);

  // DERIVED
  const isEditing = !!editCard;
  const resetKey = `${editCard?.id ?? "new"}-${isOpen}`;

  // Populate fields when editing, reset when adding
  useEffect(() => {
    if (editCard) {
      setFront(editCard.front);
      setBack(editCard.back);
      setNotes(editCard.notes || "");
      setCategory(editCard.category || "");
      setIsDraft(editCard.is_draft);
    } else if (isOpen) {
      setFront("");
      setBack("");
      setNotes("");
      setCategory("");
      setIsDraft(false);
    }
  }, [isOpen, editCard]);

  const handleSave = async () => {
    if (!front.trim() || !back.trim()) return;

    setIsSaving(true);
    try {
      if (isEditing) {
        await onEdit(editCard!.id, front.trim(), back.trim(), notes.trim() || null, category.trim() || null, isDraft);
      } else {
        await onAdd(front.trim(), back.trim(), notes.trim() || null, category.trim() || null, isDraft);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      wide
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
      {/* FORMATTING HINT */}
      <p className="text-subtle mb-3">Paste an image directly to embed it</p>

      {/* CARD EDIT GRID — single column on mobile; at desktop widths the required
          Front/Back sit in the left column and the optional metadata in the right */}
      <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-6">

        {/* PRIMARY COLUMN — front & back (required) */}
        <div>

          {/* FRONT FIELD */}
          <div className="mb-4">
            <label className="text-label mb-1 block">Front</label>
            <RichCardEditor value={front} onChange={setFront} resetKey={resetKey} />
          </div>

          {/* BACK FIELD */}
          <div className="mb-4">
            <label className="text-label mb-1 block">Back</label>
            <RichCardEditor value={back} onChange={setBack} resetKey={resetKey} />
          </div>
        </div>

        {/* OPTIONAL COLUMN — notes, category & draft (all optional) */}
        <div>

          {/* NOTES FIELD */}
          <div className="mb-4">
            <label className="text-label mb-1 block">Notes</label>
            <RichCardEditor value={notes} onChange={setNotes} placeholder="Optional" resetKey={resetKey} />
          </div>

          {/* CATEGORY FIELD */}
          <div>
            <label className="text-label mb-1 block">Category</label>
            <input
              type="text"
              className="input-field w-full"
              placeholder="Optional"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="rune-card-category-options"
            />
            {/* CATEGORY SUGGESTIONS — existing categories in this deck */}
            <datalist id="rune-card-category-options">
              {existingCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          {/* DRAFT TOGGLE — draft cards are hidden from study sessions and excluded from the due count */}
          <div className="mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isDraft}
                onChange={(e) => setIsDraft(e.target.checked)}
                className="checkbox"
              />
              <span className="text-secondary text-sm">Draft — hide from study and due count</span>
            </label>
          </div>
        </div>
      </div>
    </Modal>
  );
}
