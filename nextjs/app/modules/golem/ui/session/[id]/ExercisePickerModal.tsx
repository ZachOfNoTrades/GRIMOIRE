"use client"

import { useState, useEffect } from "react";
import { ArrowLeft, ArrowLeftRight, Ban, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { ExerciseSummary } from "../../../types/exercise";
import RecommendationsView from "./RecommendationsView";
import BrowseView from "./BrowseView";
import MuscleGroupView from "./MuscleGroupView";
import ExerciseInfoView from "./ExerciseInfoView";
import ExerciseFormView from "./ExerciseFormView";

type PickerView =
  | { type: "recommendations" }
  | { type: "browse" }
  | { type: "muscleGroup"; muscleGroup: string }
  | { type: "info"; exercise: ExerciseSummary }
  | { type: "form"; exercise?: ExerciseSummary };

interface ExercisePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (exercise: ExerciseSummary) => void;
  exercises: ExerciseSummary[];
  onExerciseCreated: (exercise: ExerciseSummary) => void;
  onExerciseUpdated: (exercise: ExerciseSummary) => void;
  currentExerciseId?: string;
  targetExerciseId?: string;
}

export default function ExercisePickerModal({
  isOpen,
  onClose,
  onSelect,
  exercises,
  onExerciseCreated,
  onExerciseUpdated,
  currentExerciseId,
  targetExerciseId,
}: ExercisePickerModalProps) {

  // STATE
  const [viewStack, setViewStack] = useState<PickerView[]>([{ type: "recommendations" }]);
  const [slideDirection, setSlideDirection] = useState<"right" | "left">("right");
  const [showDisabled, setShowDisabled] = useState(false);

  // DERIVED
  const currentView = viewStack[viewStack.length - 1];
  const canGoBack = viewStack.length > 1;

  // Dynamic title based on current view
  const title = currentView.type === "recommendations"
    ? "Select Exercise"
    : currentView.type === "browse"
      ? "All Exercises"
      : currentView.type === "info"
        ? currentView.exercise.name
        : currentView.type === "form"
          ? (currentView.exercise ? "Edit Exercise" : "New Exercise")
          : currentView.muscleGroup;

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setViewStack([{ type: "recommendations" }]);
      setSlideDirection("right");
    }
  }, [isOpen]);

  // Navigate forward to a new view
  const pushView = (view: PickerView) => {
    setSlideDirection("right");
    setViewStack((prev) => [...prev, view]);
  };

  // Navigate back to the previous view
  const popView = () => {
    setSlideDirection("left");
    setViewStack((prev) => prev.length > 1 ? prev.slice(0, -1) : prev);
  };

  // Close all views and select exercise
  const handleSelectExercise = (exercise: ExerciseSummary) => {
    onSelect(exercise);
    onClose();
  };

  // Navigate to exercise info view
  const handleInfo = (exercise: ExerciseSummary) => {
    pushView({ type: "info", exercise });
  };

  // Navigate to exercise form view (create or edit)
  const handleNavigateCreate = () => {
    pushView({ type: "form" });
  };

  // Handle form save (create or edit)
  const handleFormSaved = (summary: ExerciseSummary, isNew: boolean) => {
    if (isNew) {
      onExerciseCreated(summary);
      handleSelectExercise(summary);
    } else {
      onExerciseUpdated(summary);
      // Pop form view and update the info view's exercise so it re-fetches
      setSlideDirection("left");
      setViewStack((prev) => {
        const withoutForm = prev.slice(0, -1);
        return withoutForm.map((view) =>
          view.type === "info" && view.exercise.id === summary.id
            ? { ...view, exercise: summary }
            : view
        );
      });
    }
  };

  // Toggle disable/enable for an exercise from the info view
  const handleToggleDisable = async (exercise: ExerciseSummary) => {
    try {
      const method = exercise.is_disabled ? "PATCH" : "DELETE";
      const response = await fetch(`/modules/golem/api/exercises/${exercise.id}`, { method });
      if (!response.ok) throw new Error("Failed to toggle exercise");

      const updatedExercise = { ...exercise, is_disabled: !exercise.is_disabled };
      onExerciseUpdated(updatedExercise);

      // Update the info view's exercise reference
      setViewStack((prev) =>
        prev.map((view) =>
          view.type === "info" && view.exercise.id === exercise.id
            ? { ...view, exercise: updatedExercise }
            : view
        )
      );
    } catch (error) {
      console.error("Error toggling exercise disabled state:", error);
    }
  };

  // Unique key for animation remount
  const viewKey = currentView.type === "muscleGroup"
    ? `muscleGroup-${currentView.muscleGroup}`
    : currentView.type === "info"
      ? `info-${currentView.exercise.id}`
      : currentView.type === "form"
        ? `form-${currentView.exercise?.id ?? "new"}`
        : currentView.type;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2 w-full mr-2">
          <span>{title}</span>

          {/* ACTION BUTTONS */}
          <div className="flex items-center gap-1">

            {/* EDIT BUTTON */}
            {currentView.type === "info" && (
              <Button
                onClick={() => pushView({ type: "form", exercise: currentView.exercise })}
                className="btn-link !py-0"
              >
                <Pencil className="w-5 h-5" />
              </Button>
            )}

            {/* DISABLE/ENABLE BUTTON */}
            {currentView.type === "info" && (
              <Button
                onClick={() => handleToggleDisable(currentView.exercise)}
                className={currentView.exercise.is_disabled ? "btn-link btn-link-red" : "btn-link"}
                title={currentView.exercise.is_disabled ? "Enable exercise" : "Disable exercise"}
              >
                <Ban className="w-5 h-5" />
              </Button>
            )}

            {/* REPLACE BUTTON */}
            {currentView.type === "info" && (
              <Button
                onClick={() => handleSelectExercise(currentView.exercise)}
                className="btn-link !py-0"
              >
                <ArrowLeftRight className="w-5 h-5" />
              </Button>
            )}

            {/* ADD EXERCISE BUTTON */}
            {currentView.type !== "info" && (
              <Button
                onClick={handleNavigateCreate}
                className="btn-link !py-0"
              >
                <Plus className="w-5 h-5" />
              </Button>
            )}
          </div>
        </span>
      }
      zIndex={60}
      fullHeight
      modalActions={
        <div className="flex items-center gap-1">

          {/* BACK BUTTON */}
          {canGoBack && (
            <Button
              onClick={popView}
              className="btn-link"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}

          {/* CLOSE BUTTON */}
          <Button
            onClick={onClose}
            className="btn-link"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      }
    >
      {/* ANIMATED VIEW CONTAINER */}
      <div key={viewKey} className={slideDirection === "right" ? "view-slide-right" : "view-slide-left"} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {currentView.type === "recommendations" && (
          <RecommendationsView
            exercises={exercises}
            currentExerciseId={currentExerciseId}
            targetExerciseId={targetExerciseId}
            showDisabled={showDisabled}
            onShowDisabledChange={setShowDisabled}
            onSelect={handleSelectExercise}
            onInfo={handleInfo}
            onNavigateBrowse={() => pushView({ type: "browse" })}
            onNavigateMuscleGroup={(muscle) => pushView({ type: "muscleGroup", muscleGroup: muscle })}
            onClose={onClose}
          />
        )}
        {currentView.type === "browse" && (
          <BrowseView
            exercises={exercises}
            showDisabled={showDisabled}
            onShowDisabledChange={setShowDisabled}
            onSelect={handleSelectExercise}
            onInfo={handleInfo}
            onNavigateMuscleGroup={(groupName) => pushView({ type: "muscleGroup", muscleGroup: groupName })}
          />
        )}
        {currentView.type === "muscleGroup" && (
          <MuscleGroupView
            muscleGroup={currentView.muscleGroup}
            exercises={exercises}
            showDisabled={showDisabled}
            onShowDisabledChange={setShowDisabled}
            onSelect={handleSelectExercise}
            onInfo={handleInfo}
          />
        )}
        {currentView.type === "info" && (
          <ExerciseInfoView
            exercise={currentView.exercise}
          />
        )}
        {currentView.type === "form" && (
          <ExerciseFormView
            exercise={currentView.exercise}
            onSaved={handleFormSaved}
          />
        )}
      </div>
    </Modal>
  );
}
