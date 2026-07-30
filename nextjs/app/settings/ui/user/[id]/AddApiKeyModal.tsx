"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import toast from "react-hot-toast";
import { CreatedApiKey } from "@/types/apiKey";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";

interface AddApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyCreated: () => void;
}

export default function AddApiKeyModal({ isOpen, onClose, onKeyCreated }: AddApiKeyModalProps) {

  // INPUT
  const [name, setName] = useState("");

  // STATE
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);

  async function handleSubmit() {
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/users/me/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (response.ok) {
        const data: CreatedApiKey = await response.json();
        setCreated(data);
        onKeyCreated();
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to create API key");
      }
    } catch (error) {
      console.error("Error creating API key:", error);
      toast.error("Failed to create API key");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    setName("");
    setCreated(null);
    onClose();
  }

  async function handleCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.plaintext);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }

  // PLAINTEXT REVEAL MODE
  if (created) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="API Key Created"
        footer={
          <div className="flex justify-end gap-2">

            {/* DONE BUTTON */}
            <Button className="btn-blue" onClick={handleClose}>
              Done
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">

          {/* WARNING */}
          <p className="text-secondary">
            Copy this key now — it will not be shown again.
          </p>

          {/* KEY DISPLAY */}
          <div className="flex items-center gap-2">
            <code className="input-field font-mono break-all flex-1">{created.plaintext}</code>

            {/* COPY BUTTON */}
            <Button
              className="btn-blue !p-3"
              onClick={handleCopy}
              title="Copy to clipboard"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // NAME INPUT MODE
  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create API Key"
      footer={
        <div className="flex justify-end gap-2">
          {/* CANCEL BUTTON */}
          <Button className="btn-link" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>

          {/* SUBMIT BUTTON */}
          <Button
            className="btn-blue"
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim()}
          >
            {isSubmitting ? "Creating..." : "Create Key"}
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
