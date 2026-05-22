"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { UserApiKeySummary } from "@/types/apiKey";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";

interface RenameApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyRenamed: () => void;
  apiKey: UserApiKeySummary | null;
}

export default function RenameApiKeyModal({
  isOpen,
  onClose,
  onKeyRenamed,
  apiKey,
}: RenameApiKeyModalProps) {
  // INPUT
  const [name, setName] = useState("");

  // STATE
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (apiKey) setName(apiKey.name);
  }, [apiKey]);

  async function handleSubmit() {
    if (!apiKey || !name.trim() || name.trim() === apiKey.name) {
      onClose();
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/users/me/api-keys/${apiKey.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (response.ok) {
        toast.success("API key renamed");
        onClose();
        onKeyRenamed();
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to rename API key");
      }
    } catch (error) {
      console.error("Error renaming API key:", error);
      toast.error("Failed to rename API key");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Rename API Key"
      footer={
        <div className="flex justify-end gap-2">

          {/* CANCEL BUTTON */}
          <Button className="btn-link" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>

          {/* SAVE BUTTON */}
          <Button
            className="btn-blue"
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim()}
          >
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">

        {/* NAME INPUT */}
        <div>
          <label className="text-secondary mb-1 block">Name</label>
          <input
            type="text"
            className="input-field"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
          />
        </div>
      </div>
    </Modal>
  );
}
