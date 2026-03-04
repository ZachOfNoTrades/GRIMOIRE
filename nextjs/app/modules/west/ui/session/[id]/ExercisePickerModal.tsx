"use client"

import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { ExerciseSummary } from "../../../types/exercise";
import RecommendationsView from "./RecommendationsView";
import BrowseView from "./BrowseView";
import MuscleGroupView from "./MuscleGroupView";
import ExerciseInfoModal from "./ExerciseInfoModal";

type PickerView =
  | { type: "recommendations" }
  | { type: "browse" }
  | { type: "muscleGroup"; muscleGroup: string };

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
  const [infoExercise, setInfoExercise] = useState<ExerciseSummary | null>(null);

  // DERIVED
  const currentView = viewStack[viewStack.length - 1];
  const canGoBack = viewStack.length > 1;

  // Dynamic title based on current view
  const title = currentView.type === "recommendations"
    ? "Select Exercise"
    : currentView.type === "browse"
      ? "All Exercises"
      : currentView.muscleGroup;

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setViewStack([{ type: "recommendations" }]);
      setSlideDirection("right");
      setInfoExercise(null);
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
    setInfoExercise(null);
    onSelect(exercise);
    onClose();
  };

  // Unique key for animation remount
  const viewKey = currentView.type === "muscleGroup"
    ? `muscleGroup-${currentView.muscleGroup}`
    : currentView.type;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          <span className="flex items-center justify-between w-full mr-2">
            <span>{title}</span>
            {canGoBack && (
              <Button onClick={popView} className="btn-link">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
          </span>
        }
        zIndex={60}
        fullHeight
      >
        {/* ANIMATED VIEW CONTAINER */}
        <div key={viewKey} className={slideDirection === "right" ? "view-slide-right" : "view-slide-left"} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          {currentView.type === "recommendations" && (
            <RecommendationsView
              exercises={exercises}
              currentExerciseId={currentExerciseId}
              targetExerciseId={targetExerciseId}
              onSelect={handleSelectExercise}
              onInfo={setInfoExercise}
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
              onInfo={setInfoExercise}
              onNavigateMuscleGroup={(groupName) => pushView({ type: "muscleGroup", muscleGroup: groupName })}
            />
          )}
          {currentView.type === "muscleGroup" && (
            <MuscleGroupView
              muscleGroup={currentView.muscleGroup}
              exercises={exercises}
              onSelect={handleSelectExercise}
              onInfo={setInfoExercise}
            />
          )}
        </div>
      </Modal>

      {/* EXERCISE INFO MODAL */}
      <ExerciseInfoModal
        exercise={infoExercise}
        onClose={() => setInfoExercise(null)}
        onSelect={handleSelectExercise}
        zIndex={70}
      />
    </>
  );
}
