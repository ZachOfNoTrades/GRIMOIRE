"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { CardWithProgress } from "../../../../types/card";

interface DeleteCardModalProps {
  card?: CardWithProgress | null;
  bulkCount?: number;
  isOpen?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function DeleteCardModal({ card, bulkCount, isOpen, onClose, onConfirm }: DeleteCardModalProps) {
  // STATE
  const [isDeleting, setIsDeleting] = useState(false);

  // DERIVED
  const isBulk = (bulkCount ?? 0) > 0;
  const modalOpen = isOpen ?? !!card;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  };

  // Build confirmation message
  const message = isBulk
    ? `Are you sure you want to delete ${bulkCount} card${bulkCount === 1 ? "" : "s"}? This will also remove all review history for these cards.`
    : null;

  return (
    <Modal
      isOpen={modalOpen}
      onClose={onClose}
      title={isBulk ? "Delete Cards" : "Delete Card"}
      footer={
        <div className="flex gap-2 justify-end">
          {/* CANCEL BUTTON */}
          <Button onClick={onClose} className="btn-off">
            Cancel
          </Button>

          {/* DELETE BUTTON */}
          <Button
            onClick={handleDelete}
            className="btn-red"
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      }
    >
      {/* CONFIRMATION MESSAGE */}
      <p className="text-primary">
        {isBulk ? message : (
          <>Are you sure you want to delete {card ? <strong>{card.front.length > 60 ? card.front.slice(0, 60) + "..." : card.front}</strong> : "this card"}? This will also remove all review history for this card.</>
        )}
      </p>
    </Modal>
  );
}
