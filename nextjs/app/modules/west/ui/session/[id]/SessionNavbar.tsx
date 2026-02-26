"use client"

import { ArrowLeft, Edit2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";

interface SessionNavbarProps {
  isEditing: boolean;
  isSaving: boolean;
  onBack: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export default function SessionNavbar({
  isEditing,
  isSaving,
  onBack,
  onDelete,
  onEdit,
  onCancel,
  onSave,
}: SessionNavbarProps) {
  return (
    <Navbar>

      {/* BACK BUTTON */}
      <Button
        onClick={onBack}
        className="btn-link mr-auto"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </Button>

      {/* VIEW MODE ACTIONS */}
      {!isEditing && (
        <>

          {/* DELETE BUTTON */}
          <Button
            onClick={onDelete}
            className="btn-delete"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </Button>

          {/* EDIT BUTTON */}
          <Button
            onClick={onEdit}
            className="btn-primary"
            title="Edit session"
          >
            <Edit2 className="w-4 h-4" />
            <span>Edit</span>
          </Button>
        </>
      )}

      {/* EDIT MODE ACTIONS */}
      {isEditing && (
        <>

          {/* CANCEL BUTTON */}
          <Button
            onClick={onCancel}
            disabled={isSaving}
            className="btn-link"
          >
            Cancel
          </Button>

          {/* SAVE BUTTON */}
          <Button
            onClick={onSave}
            disabled={isSaving}
            className="btn-success"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? "Saving..." : "Save"}</span>
          </Button>
        </>
      )}
    </Navbar>
  );
}
