"use client"

import { Ban, Info } from "lucide-react";
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
    <div
      className={`list-item !flex-col !items-stretch ${exercise.is_disabled && "opacity-60"}`}
      onClick={() => onSelect(exercise)}
    >

      {/* EXERCISE NAME ROW */}
      <div className="flex items-center justify-between">

        {/* EXERCISE NAME */}
        <span className="text-primary flex items-center gap-2">
          {exercise.name}
          {showPrescribed && exercise.id === targetExerciseId && (
            <span className="badge-blue text-[10px]">Prescribed</span>
          )}
        </span>

        {/* DISABLED ICON */}
        {exercise.is_disabled && (
          <Ban className="w-4 h-4" style={{ color: "var(--alert-red-text)" }} />
        )}
      </div>

      {/* DETAILS ROW */}
      <div className="flex items-center justify-between -mb-1">
        {exercise.last_used_at && (
          <span className="text-muted text-xs">{formatLastUsed(exercise.last_used_at)}</span>
        )}

        {/* INFO BUTTON */}
        <button
          onClick={(e) => { e.stopPropagation(); onInfo(exercise); }} // stopPropagation prevents info button from triggering exercise selection
          className="p-2 -mr-2 text-muted hover:text-secondary transition-colors shrink-0 ml-auto"
          title="View history"
        >
          <Info className="w-4.5 h-4.5" />
        </button>
      </div>
    </div>
  );
}
