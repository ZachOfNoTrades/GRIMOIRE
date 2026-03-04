"use client"

import { Info } from "lucide-react";
import { ExerciseSummary } from "../../../types/exercise";
import { formatLastUsed } from "../../../utils/format";

interface ExerciseListItemProps {
  exercise: ExerciseSummary;
  onSelect: (exercise: ExerciseSummary) => void;
  onInfo: (exercise: ExerciseSummary) => void;
  showPrescribed?: boolean;
  targetExerciseId?: string;
}

export default function ExerciseListItem({
  exercise,
  onSelect,
  onInfo,
  showPrescribed = false,
  targetExerciseId,
}: ExerciseListItemProps) {
  return (
    <div className="list-item">

      {/* EXERCISE NAME */}
      <button
        onClick={() => onSelect(exercise)}
        className="text-left flex-1 min-w-0 flex items-center justify-between"
      >
        <span className="text-primary flex items-center gap-2 truncate">
          {exercise.name}
          {showPrescribed && exercise.id === targetExerciseId && (
            <span className="badge-info text-[10px]">Prescribed</span>
          )}
        </span>
        {exercise.last_used_at && (
          <span className="text-muted text-xs shrink-0 ml-2">{formatLastUsed(exercise.last_used_at)}</span>
        )}
      </button>

      {/* INFO BUTTON */}
      <button
        onClick={() => onInfo(exercise)}
        className="p-2 -mr-2 text-muted hover:text-secondary transition-colors shrink-0"
        title="View history"
      >
        <Info className="w-4.5 h-4.5" />
      </button>
    </div>
  );
}
