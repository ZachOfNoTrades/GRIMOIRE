"use client"

import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";

interface DisableExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDisable: () => void;
  onEnable: () => void;
  exerciseName: string;
  isDisabled: boolean;
  isToggling: boolean;
}

export default function DisableExerciseModal({
  isOpen,
  onClose,
  onDisable,
  onEnable,
  exerciseName,
  isDisabled,
  isToggling,
}: DisableExerciseModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isDisabled ? "Enable Exercise" : "Disable Exercise"}
      disableClose={isToggling}
      zIndex={60}
      footer={
        <>
          {/* CANCEL BUTTON */}
          <Button
            onClick={onClose}
            disabled={isToggling}
            className="btn-link"
          >
            Cancel
          </Button>

          {/* CONFIRM BUTTON */}
          {isDisabled ? (
            <Button
              onClick={onEnable}
              disabled={isToggling}
              className="btn-blue"
            >
              {isToggling ? "Enabling..." : "Enable"}
            </Button>
          ) : (
            <Button
              onClick={onDisable}
              disabled={isToggling}
              className="btn-red"
            >
              {isToggling ? "Disabling..." : "Disable"}
            </Button>
          )}
        </>
      }
    >
      {isDisabled ? (
        <p className="text-primary">
          Re-enable <strong>{exerciseName}</strong>? It will appear in the exercise library again.
        </p>
      ) : (
        <p className="text-primary">
          Are you sure you want to disable <strong>{exerciseName}</strong>? It will no longer appear in the exercise library.
        </p>
      )}
    </Modal>
  );
}
