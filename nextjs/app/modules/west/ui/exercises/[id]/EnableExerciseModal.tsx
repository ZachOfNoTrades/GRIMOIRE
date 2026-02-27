"use client"

import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";

interface EnableExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  exerciseName: string;
  isEnabling: boolean;
}

export default function EnableExerciseModal({
  isOpen,
  onClose,
  onConfirm,
  exerciseName,
  isEnabling,
}: EnableExerciseModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Enable Exercise"
      disableClose={isEnabling}
      footer={
        <>
          {/* CANCEL BUTTON */}
          <Button
            onClick={onClose}
            disabled={isEnabling}
            className="btn-link"
          >
            Cancel
          </Button>

          {/* ENABLE BUTTON */}
          <Button
            onClick={onConfirm}
            disabled={isEnabling}
            className="btn-success"
          >
            {isEnabling ? "Enabling..." : "Enable"}
          </Button>
        </>
      }
    >
      <p className="text-primary">
        Re-enable <strong>{exerciseName}</strong>? It will appear in the exercise library again.
      </p>
    </Modal>
  );
}
