"use client"

import { Button } from '@/components/ui/button';
import Modal from '@/components/Modal';

interface DeleteTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  templateName: string;
  isDeleting: boolean;
}

export default function DeleteTemplateModal({
  isOpen,
  onClose,
  onConfirm,
  templateName,
  isDeleting
}: DeleteTemplateModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Template"
      disableClose={isDeleting}
      footer={
        <>
          {/* CANCEL BUTTON */}
          <Button
            onClick={onClose}
            disabled={isDeleting}
            className="btn-link"
          >
            Cancel
          </Button>

          {/* DELETE BUTTON */}
          <Button
            onClick={onConfirm}
            disabled={isDeleting}
            className="btn-red"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </>
      }
    >
      <p className="text-primary">
        Are you sure you want to delete <strong>{templateName}</strong>? This action cannot be undone.
      </p>
    </Modal>
  );
}
