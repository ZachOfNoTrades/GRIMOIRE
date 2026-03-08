"use client"

import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { ExerciseSummary } from "../../../types/exercise";
import RecommendationsView from "./RecommendationsView";
import BrowseView from "./BrowseView";
import MuscleGroupView from "./MuscleGroupView";
import ExerciseInfoView from "./ExerciseInfoView";

type PickerView =
  | { type: "recommendations" }
  | { type: "browse" }
  | { type: "muscleGroup"; muscleGroup: string }
  | { type: "info"; exercise: ExerciseSummary };

interface ExercisePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (exercise: ExerciseSummary) => void;
  exercises: ExerciseSummary[];
  onExerciseCreated: (exercise: ExerciseSummary) => void;
  currentExerciseId?: string;
  targetExerciseId?: string;
}

export default function ExercisePickerModal({
  isOpen,
  onClose,
  onSelect,
  exercises,
  onExerciseCreated,
  currentExerciseId,
  targetExerciseId,
}: ExercisePickerModalProps) {

  // STATE
  const [viewStack, setViewStack] = useState<PickerView[]>([{ type: "recommendations" }]);
  const [slideDirection, setSlideDirection] = useState<"right" | "left">("right");

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

  // Unique key for animation remount
  const viewKey = currentView.type === "muscleGroup"
    ? `muscleGroup-${currentView.muscleGroup}`
    : currentView.type === "info"
      ? `info-${currentView.exercise.id}`
      : currentView.type;

  return (
    <Modal
      isOpen={isOpen}
      onClose={canGoBack ? popView : onClose}
      title={
        currentView.type === "info" ? (
          <span className="flex items-center justify-between w-full mr-2">
            <span>{title}</span>
            {/* REPLACE BUTTON */}
            <Button
              onClick={() => handleSelectExercise(currentView.exercise)}
              className="btn-link !py-0"
            >
              Replace
            </Button>
          </span>
        ) : title
      }
      zIndex={60}
      fullHeight
      closeIcon={<ArrowLeft className="w-5 h-5" />}
    >
      {/* ANIMATED VIEW CONTAINER */}
      <div key={viewKey} className={slideDirection === "right" ? "view-slide-right" : "view-slide-left"} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {currentView.type === "recommendations" && (
          <RecommendationsView
            exercises={exercises}
            currentExerciseId={currentExerciseId}
            targetExerciseId={targetExerciseId}
            onSelect={handleSelectExercise}
            onInfo={handleInfo}
            onNavigateBrowse={() => pushView({ type: "browse" })}
            onNavigateMuscleGroup={(muscle) => pushView({ type: "muscleGroup", muscleGroup: muscle })}
            onExerciseCreated={onExerciseCreated}
            onClose={onClose}
          />
        )}
        {currentView.type === "browse" && (
          <BrowseView
            exercises={exercises}
            onSelect={handleSelectExercise}
            onInfo={handleInfo}
            onNavigateMuscleGroup={(groupName) => pushView({ type: "muscleGroup", muscleGroup: groupName })}
          />
        )}
        {currentView.type === "muscleGroup" && (
          <MuscleGroupView
            muscleGroup={currentView.muscleGroup}
            exercises={exercises}
            onSelect={handleSelectExercise}
            onInfo={handleInfo}
          />
        )}
        {currentView.type === "info" && (
          <ExerciseInfoView
            exercise={currentView.exercise}
          />
        )}
      </div>
    </Modal>
  );
}
