"use client";

import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";

interface DeleteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  userName: string;
  isDeleting: boolean;
}

export default function DeleteUserModal({
  isOpen,
  onClose,
  onConfirm,
  userName,
  isDeleting,
}: DeleteUserModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete User"
      footer={
        <div className="flex justify-end gap-2">
          {/* CANCEL BUTTON */}
          <Button
            className="btn-link"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>

          {/* DELETE BUTTON */}
          <Button
            className="btn-red"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete User"}
          </Button>
        </div>
      }
    >
      <p className="text-secondary">
        Are you sure you want to delete <strong>{userName}</strong>? This action cannot be undone.
      </p>
    </Modal>
  );
}
