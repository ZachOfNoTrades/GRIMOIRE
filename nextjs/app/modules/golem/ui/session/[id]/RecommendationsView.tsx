"use client"

import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExerciseSummary } from "../../../types/exercise";
import ExerciseListItem from "./ExerciseListItem";

interface RecommendationsViewProps {
  exercises: ExerciseSummary[];
  currentExerciseId?: string;
  targetExerciseId?: string;
  onSelect: (exercise: ExerciseSummary) => void;
  onInfo: (exercise: ExerciseSummary) => void;
  onNavigateBrowse: () => void;
  onNavigateMuscleGroup: (muscle: string) => void;
  onClose: () => void;
}

export default function RecommendationsView({
  exercises,
  currentExerciseId,
  targetExerciseId,
  onSelect,
  onInfo,
  onNavigateBrowse,
  onNavigateMuscleGroup,
  onClose,
}: RecommendationsViewProps) {

  // INPUT
  const [searchQuery, setSearchQuery] = useState("");

  // DERIVED
  const isSearching = searchQuery.length > 0;

  // Current exercise muscle groups for recommendations
  const currentExercise = exercises.find((e) => e.id === currentExerciseId);
  const currentPrimaryMuscles = currentExercise?.primary_muscles ?? [];
  const currentSecondaryMuscles = currentExercise?.secondary_muscles ?? [];
  const currentAllMuscles = [...currentPrimaryMuscles, ...currentSecondaryMuscles];
  const hasRecommendations = currentExerciseId && currentAllMuscles.length > 0;

  // Recommended exercises: exact match on primary and secondary muscles, excluding current; target exercise pinned to top
  const arraysMatch = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
  const recommendedExercises = hasRecommendations
    ? exercises
        .filter(
          (ex) =>
            ex.id !== currentExerciseId &&
            arraysMatch(ex.primary_muscles, currentPrimaryMuscles) &&
            arraysMatch(ex.secondary_muscles, currentSecondaryMuscles)
        )
        .sort((a, b) => {
          const aIsTarget = a.id === targetExerciseId ? -1 : 0;
          const bIsTarget = b.id === targetExerciseId ? -1 : 0;
          return aIsTarget - bIsTarget;
        })
    : [];

  // Search filtered exercises
  const searchResults = exercises.filter((ex) =>
    ex.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2 h-full">

      {/* SEARCH INPUT */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search exercises..."
          className="input-field !pl-9"
        />
      </div>

      {/* EXERCISE LIST */}
      <div className="flex flex-col gap-1 flex-1 overflow-y-auto min-h-0 scrollbar-hide pr-2">
        {isSearching ? (
          // Search results
          searchResults.length === 0 ? (
            <p className="text-secondary py-4 text-center">No exercises found</p>
          ) : (
            searchResults.map((ex) => (
              <ExerciseListItem key={ex.id} exercise={ex} onSelect={onSelect} onInfo={onInfo} />
            ))
          )
        ) : (
          <>
            {/* RECOMMENDED EXERCISES */}
            <div className="text-secondary text-xs font-medium uppercase tracking-wide px-3 pt-3 pb-1">
              Recommended
            </div>
            {recommendedExercises.length > 0 ? (
              recommendedExercises.map((ex) => (
                <ExerciseListItem
                  key={ex.id}
                  exercise={ex}
                  onSelect={onSelect}
                  onInfo={onInfo}
                  showPrescribed
                  targetExerciseId={targetExerciseId}
                />
              ))
            ) : (
              <p className="text-secondary py-4 text-center">No recommendations available</p>
            )}

            {/* NAVIGATION BUTTONS */}
            <div className="flex flex-col gap-1 mt-3 px-3">

              {/* SEE ALL {GROUP} EXERCISES */}
              {currentPrimaryMuscles.map((muscle) => (
                <Button
                  key={muscle}
                  onClick={() => onNavigateMuscleGroup(muscle)}
                  className="btn-link justify-between w-full"
                >
                  <span>See All {muscle} Exercises</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ))}

              {/* SEE ALL EXERCISES */}
              <Button
                onClick={onNavigateBrowse}
                className="btn-link justify-between w-full"
              >
                <span>See All Exercises</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
