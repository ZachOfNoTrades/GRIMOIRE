"use client"

import { useState } from "react";
import { Search } from "lucide-react";
import { ExerciseSummary } from "../../../types/exercise";
import ExerciseListItem from "./ExerciseListItem";

interface MuscleGroupViewProps {
  muscleGroup: string;
  exercises: ExerciseSummary[];
  showDisabled: boolean;
  onShowDisabledChange: (value: boolean) => void;
  onSelect: (exercise: ExerciseSummary) => void;
  onInfo: (exercise: ExerciseSummary) => void;
}

export default function MuscleGroupView({
  muscleGroup,
  exercises,
  showDisabled,
  onShowDisabledChange,
  onSelect,
  onInfo,
}: MuscleGroupViewProps) {

  // INPUT
  const [searchQuery, setSearchQuery] = useState("");

  // DERIVED
  const muscleGroupExercises = exercises.filter((ex) =>
    (showDisabled || !ex.is_disabled) &&
    ex.primary_muscles.includes(muscleGroup) &&
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

      {/* SHOW DISABLED TOGGLE */}
      <label className="flex items-center gap-1.5 ml-auto cursor-pointer text-secondary">
        <input
          type="checkbox"
          checked={showDisabled}
          onChange={(e) => onShowDisabledChange(e.target.checked)}
        />
        <span>Show disabled</span>
      </label>

      {/* EXERCISE LIST */}
      <div className="flex flex-col gap-1 flex-1 overflow-y-auto min-h-0 scrollbar-hide pr-2">
        {muscleGroupExercises.length === 0 ? (
          <p className="text-secondary py-4 text-center">No exercises found</p>
        ) : (
          muscleGroupExercises.map((ex) => (
            <ExerciseListItem key={ex.id} exercise={ex} onSelect={onSelect} onInfo={onInfo} />
          ))
        )}
      </div>
    </div>
  );
}
