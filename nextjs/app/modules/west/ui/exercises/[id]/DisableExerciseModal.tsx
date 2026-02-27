"use client"

import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";

interface DisableExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  exerciseName: string;
  isDisabling: boolean;
}

export default function DisableExerciseModal({
  isOpen,
  onClose,
  onConfirm,
  exerciseName,
  isDisabling,
}: DisableExerciseModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Disable Exercise"
      disableClose={isDisabling}
      footer={
        <>
          {/* CANCEL BUTTON */}
          <Button
            onClick={onClose}
            disabled={isDisabling}
            className="btn-link"
          >
            Cancel
          </Button>

          {/* DISABLE BUTTON */}
          <Button
            onClick={onConfirm}
            disabled={isDisabling}
            className="btn-delete"
          >
            {isDisabling ? "Disabling..." : "Disable"}
          </Button>
        </>
      }
    >
      <p className="text-primary">
        Are you sure you want to disable <strong>{exerciseName}</strong>? It will no longer appear in the exercise library.
      </p>
    </Modal>
  );
}
