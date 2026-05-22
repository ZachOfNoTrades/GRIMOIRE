"use client";

import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";

interface RevokeApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  keyName: string;
  isRevoking: boolean;
}

export default function RevokeApiKeyModal({
  isOpen,
  onClose,
  onConfirm,
  keyName,
  isRevoking,
}: RevokeApiKeyModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Revoke API Key"
      footer={
        <div className="flex justify-end gap-2">

          {/* CANCEL BUTTON */}
          <Button className="btn-link" onClick={onClose} disabled={isRevoking}>
            Cancel
          </Button>

          {/* REVOKE BUTTON */}
          <Button className="btn-red" onClick={onConfirm} disabled={isRevoking}>
            {isRevoking ? "Revoking..." : "Revoke Key"}
          </Button>
        </div>
      }
    >
      <p className="text-secondary">
        Are you sure you want to revoke <strong>{keyName}</strong>? Any clients using this key will stop working immediately.
      </p>
    </Modal>
  );
}
