"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";

interface AddUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserAdded: () => void;
}

export default function AddUserModal({ isOpen, onClose, onUserAdded }: AddUserModalProps) {
  // INPUT
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  // STATE
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email.trim()) return;
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || email.trim(),
        }),
      });

      if (response.ok) {
        toast.success("User added");
        setEmail("");
        setName("");
        onClose();
        onUserAdded();
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to add user");
      }
    } catch (error) {
      console.error("Error adding user:", error);
      toast.error("Failed to add user");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add User"
      footer={
        <div className="flex justify-end gap-2">
          {/* CANCEL BUTTON */}
          <Button
            className="btn-link"
            onClick={onClose}
          >
            Cancel
          </Button>

          {/* SUBMIT BUTTON */}
          <Button
            className="btn-blue"
            onClick={handleSubmit}
            disabled={isSubmitting || !email.trim()}
          >
            {isSubmitting ? "Adding..." : "Add User"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* EMAIL INPUT */}
        <div>
          <label className="text-secondary mb-1 block">Email</label>
          <input
            type="email"
            className="input-field"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {/* NAME INPUT */}
        <div>
          <label className="text-secondary mb-1 block">Name</label>
          <input
            type="text"
            className="input-field"
            placeholder="Optional — defaults to email"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
