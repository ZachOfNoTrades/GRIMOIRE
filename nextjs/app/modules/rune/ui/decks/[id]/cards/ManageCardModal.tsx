"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { CardWithProgress, CARD_SOURCE_REF_MAX, CARD_CATEGORY_MAX } from "../../../../types/card";
import RichCardEditor from "../../../../components/RichCardEditor";

interface ManageCardModalProps {
  isOpen: boolean;
  editCard?: CardWithProgress | null;
  onClose: () => void;
  onAdd: (front: string, back: string, notes: string | null, category: string | null, isDraft: boolean, sourceRef: string | null) => Promise<void>;
  onEdit: (cardId: string, front: string, back: string, notes: string | null, category: string | null, isDraft: boolean, sourceRef: string | null) => Promise<void>;
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
  const [sourceRef, setSourceRef] = useState("");
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
      setSourceRef(editCard.source_ref || "");
      setIsDraft(editCard.is_draft);
    } else if (isOpen) {
      setFront("");
      setBack("");
      setNotes("");
      setCategory("");
      setSourceRef("");
      setIsDraft(false);
    }
  }, [isOpen, editCard]);

  // Scrolls a just-focused short input clear of the soft keyboard. On Firefox Android the
  // keyboard opens AFTER the focus event and shrinks the modal body, which pushes the tail
  // of this form (Source, Category) out of view — the field stays reachable, but only after
  // the user scrolls, costing them the tap they just made. Scroll once immediately and again
  // after the keyboard's open animation, which is what actually shrinks the surface. Same
  // pattern as bagel's guess input; the Front/Back/Notes RichCardEditors sit at the top of
  // the form and don't need it.
  const scrollFieldAboveKeyboard = (e: React.FocusEvent<HTMLInputElement>) => {
    const field = e.currentTarget;
    field.scrollIntoView({ block: "center" });
    setTimeout(() => field.scrollIntoView({ block: "center" }), 350);
  };

  // The onFocus scroll above fires the moment focus is gained, but on Firefox Android the
  // keyboard opens *after* that and shrinks the modal body, re-laying out the form and
  // dropping the focused field back under the keyboard — a fixed delay can't be timed
  // against it reliably (measured well past 350 ms on the emulator). The shrink itself
  // shows up as a visualViewport resize, so react to that instead: whenever the viewport
  // shrinks while one of this modal's inputs holds focus, put it back in view. Same
  // approach as bagel's guess input.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!isOpen || !viewport) return;
    const scrollActiveFieldIntoView = () => {
      const keyboardOpen = window.innerHeight - viewport.height > 100;
      const active = document.activeElement as HTMLElement | null;
      if (!keyboardOpen || active?.tagName !== "INPUT") return;
      if (!active.closest(".modal-backdrop")) return;
      active.scrollIntoView({ block: "center" });
    };
    viewport.addEventListener("resize", scrollActiveFieldIntoView);
    return () => viewport.removeEventListener("resize", scrollActiveFieldIntoView);
  }, [isOpen]);

  // Only the front is required. A card can be saved with a blank back — a question set
  // captured ahead of its answers, or a self-graded recall card that never needs one. It
  // studies like any other card either way.
  const handleSave = async () => {
    if (!front.trim()) return;

    setIsSaving(true);
    try {
      if (isEditing) {
        await onEdit(editCard!.id, front.trim(), back.trim(), notes.trim() || null, category.trim() || null, isDraft, sourceRef.trim() || null);
      } else {
        await onAdd(front.trim(), back.trim(), notes.trim() || null, category.trim() || null, isDraft, sourceRef.trim() || null);
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
            disabled={isSaving || !front.trim()}
          >
            {isSaving ? "Saving..." : isEditing ? "Save" : "Add"}
          </Button>
        </div>
      }
    >
      {/* FORMATTING HINT */}
      <p className="text-subtle mb-3">Paste an image directly to embed it</p>

      {/* CARD EDIT GRID — single column on mobile; at desktop widths the card's own
          Front/Back sit in the left column and the optional metadata in the right */}
      <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-6">

        {/* PRIMARY COLUMN — front (required) & back (optional) */}
        <div>

          {/* FRONT FIELD */}
          <div className="mb-4">
            <label className="text-label mb-1 block">Front</label>
            <RichCardEditor value={front} onChange={setFront} resetKey={resetKey} />
          </div>

          {/* BACK FIELD — optional, and silently so: a blank back is a normal card, so it
              gets neither a greyed "Optional…" placeholder (it reads as pre-filled text) nor
              a hint line under the box. */}
          <div className="mb-4">
            <label className="text-label mb-1 block">Back</label>
            <RichCardEditor value={back} onChange={setBack} resetKey={resetKey} />
          </div>
        </div>

        {/* OPTIONAL COLUMN — notes, source, category & draft (all optional) */}
        <div>

          {/* NOTES FIELD */}
          <div className="mb-4">
            <label className="text-label mb-1 block">Notes</label>
            <RichCardEditor value={notes} onChange={setNotes} placeholder="Optional" resetKey={resetKey} />
          </div>

          {/* SOURCE FIELD — the user's own citation for the card's material. Sits directly
              under Notes because that's where it renders on the study card's answer face.
              A plain input, not a RichCardEditor: it's a one-liner, and CardContent still
              autolinks a pasted URL (or a [label](url)) when it renders. */}
          <div className="mb-4">
            <label className="text-label mb-1 block">Source</label>
            <input
              type="text"
              className="input-field w-full"
              placeholder="Optional — a link, or e.g. “Per Chief’s lecture”"
              maxLength={CARD_SOURCE_REF_MAX}
              value={sourceRef}
              onChange={(e) => setSourceRef(e.target.value)}
              onFocus={scrollFieldAboveKeyboard}
            />
          </div>

          {/* CATEGORY FIELD */}
          <div>
            <label className="text-label mb-1 block">Category</label>
            <input
              type="text"
              className="input-field w-full"
              placeholder="Optional"
              maxLength={CARD_CATEGORY_MAX}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onFocus={scrollFieldAboveKeyboard}
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
