"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";

interface DeleteCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  collectionName: string;
  onConfirm: () => Promise<void>;
}

export default function DeleteCollectionModal({ isOpen, onClose, collectionName, onConfirm }: DeleteCollectionModalProps) {
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
      title="Delete Collection"
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
      {/* CONFIRMATION MESSAGE — a collection only groups decks, so removing it
          never touches the decks themselves or their cards. */}
      <p className="text-primary">
        Are you sure you want to delete <strong>{collectionName}</strong>? The decks in it are kept — only the grouping is removed.
      </p>
    </Modal>
  );
}
