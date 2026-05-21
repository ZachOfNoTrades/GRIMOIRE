"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";

interface DeleteDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckName: string;
  onConfirm: () => Promise<void>;
}

export default function DeleteDeckModal({ isOpen, onClose, deckName, onConfirm }: DeleteDeckModalProps) {
  // STATE
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Deck"
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
        Are you sure you want to delete <strong>{deckName}</strong>? This will permanently remove all cards, reviews, and study history.
      </p>
    </Modal>
  );
}
