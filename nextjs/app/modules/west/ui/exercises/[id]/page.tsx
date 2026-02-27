"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Dumbbell, Pencil } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Exercise } from "../../../types/exercise";
import { formatDateLong } from "../../../utils/format";
import DisableExerciseModal from "./DisableExerciseModal";
import EnableExerciseModal from "./EnableExerciseModal";

export default function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // DATA
  const [exercise, setExercise] = useState<Exercise | null>(null);

  // INPUT
  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [isEnableModalOpen, setIsEnableModalOpen] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);

  const router = useRouter();

  // LOAD DATA
  useEffect(() => {
    fetchExercise();
  }, [id]);

  const fetchExercise = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/modules/west/api/exercises/${id}`);
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to fetch exercise");
      }
      const data = await response.json();
      setExercise(data);
    } catch (error) {
      console.error("Error fetching exercise:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // EDIT HANDLERS
  const handleStartEdit = () => {
    if (!exercise) return;
    setEditedName(exercise.name);
    setEditedDescription(exercise.description || "");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedName("");
    setEditedDescription("");
  };

  const handleSave = async () => {
    if (!exercise) return;
    if (!editedName.trim()) {
      toast.error("Exercise name is required");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/modules/west/api/exercises/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editedName.trim(),
          description: editedDescription.trim() || null,
        }),
      });

      if (response.status === 409) {
        toast.error("An exercise with this name already exists");
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to update exercise");
        return;
      }

      const updatedExercise = await response.json();
      setExercise(updatedExercise);
      setIsEditing(false);
      toast.success("Exercise saved");
    } catch (error) {
      toast.error("Failed to update exercise");
      console.error("Error saving exercise:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // DISABLE HANDLER
  const handleDisableExercise = async () => {
    setIsDisabling(true);
    try {
      const response = await fetch(`/modules/west/api/exercises/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to disable exercise");
        return;
      }

      setExercise({ ...exercise!, is_disabled: true });
      setIsDisableModalOpen(false);
      toast.success("Exercise disabled");
    } catch (error) {
      toast.error("Failed to disable exercise");
      console.error("Error disabling exercise:", error);
    } finally {
      setIsDisabling(false);
    }
  };

  // ENABLE HANDLER
  const handleEnableExercise = async () => {
    setIsEnabling(true);
    try {
      const response = await fetch(`/modules/west/api/exercises/${id}`, {
        method: "PATCH",
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to enable exercise");
        return;
      }

      setExercise({ ...exercise!, is_disabled: false });
      setIsEnableModalOpen(false);
      toast.success("Exercise enabled");
    } catch (error) {
      toast.error("Failed to enable exercise");
      console.error("Error enabling exercise:", error);
    } finally {
      setIsEnabling(false);
    }
  };

  // LOADING PLACEHOLDER
  if (isLoading) {
    return (
      <div className="page">
        <main className="page-container">
          <p className="text-page-subtitle text-center py-8">Loading exercise...</p>
        </main>
      </div>
    );
  }

  // NOT FOUND PLACEHOLDER
  if (notFound || !exercise) {
    return (
      <div className="page">
        <main className="page-container">
          <p className="text-page-subtitle text-center py-8">Exercise not found</p>
        </main>
      </div>
    );
  }

  return (

    // BACKGROUND
    <div className="page">

      <Toaster />

      <main className="page-container">

        {/* HEADER */}
        <div className="mb-8">

          {/* BACK BUTTON */}
          <Button
            onClick={() => router.back()}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* TITLE */}
          <div className="flex items-center gap-3">
            <h1 className="text-page-title">{exercise.name}</h1>
          </div>
        </div>

        <div className="card-container">

          {/* EXERCISE DETAILS CARD */}
          <div className="card">

            {/* CARD HEADER */}
            <div className="card-header">

              {/* TITLE */}
              <h2 className="text-card-title">
                <Dumbbell className="w-5 h-5" />
                Exercise Details
              </h2>

              {/* ACTIONS */}
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    {/* CANCEL BUTTON */}
                    <Button
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="btn-link"
                    >
                      Cancel
                    </Button>

                    {/* SAVE BUTTON */}
                    <Button
                      onClick={handleSave}
                      disabled={isSaving || !editedName.trim()}
                      className="btn-primary"
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </>
                ) : (
                  <>
                    {/* DISABLE / ENABLE BUTTON */}
                    {exercise.is_disabled ? (
                      <Button
                        onClick={() => setIsEnableModalOpen(true)}
                        className="btn-link btn-link-success"
                      >
                        Enable
                      </Button>
                    ) : (
                      <Button
                        onClick={() => setIsDisableModalOpen(true)}
                        className="btn-link btn-link-delete"
                      >
                        Disable
                      </Button>
                    )}

                    {/* EDIT BUTTON */}
                    <Button
                      onClick={handleStartEdit}
                      className="btn-link"
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Edit</span>
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* CARD CONTENT */}
            <div className="card-content">
              {isEditing ? (
                <>
                  {/* NAME INPUT */}
                  <div>
                    <label className="text-secondary">Name</label>
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="input-field"
                      autoFocus
                    />
                  </div>

                  {/* DESCRIPTION INPUT */}
                  <div>
                    <label className="text-secondary">Description</label>
                    <textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      className="input-field min-h-[80px] resize-y"
                      placeholder="Optional description..."
                      rows={3}
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* NAME */}
                  <div>
                    <label className="text-secondary">Name</label>
                    <p className="text-primary">{exercise.name}</p>
                  </div>

                  {/* DESCRIPTION */}
                  <div>
                    <label className="text-secondary">Description</label>
                    <p className="text-primary">{exercise.description || "—"}</p>
                  </div>

                  {/* CREATED DATE */}
                  <div>
                    <label className="text-secondary">Created</label>
                    <p className="text-primary">{formatDateLong(exercise.created_at)}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* DISABLE EXERCISE MODAL */}
        <DisableExerciseModal
          isOpen={isDisableModalOpen}
          onClose={() => setIsDisableModalOpen(false)}
          onConfirm={handleDisableExercise}
          exerciseName={exercise.name}
          isDisabling={isDisabling}
        />

        {/* ENABLE EXERCISE MODAL */}
        <EnableExerciseModal
          isOpen={isEnableModalOpen}
          onClose={() => setIsEnableModalOpen(false)}
          onConfirm={handleEnableExercise}
          exerciseName={exercise.name}
          isEnabling={isEnabling}
        />
      </main>
    </div>
  );
}
