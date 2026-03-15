"use client"

import { ExerciseWithMuscleGroups } from "../../../types/muscleGroup";

interface InfoTabProps {
  exercise: ExerciseWithMuscleGroups | null;
  loading: boolean;
}

export default function InfoTab({ exercise, loading }: InfoTabProps) {

  // LOADING PLACEHOLDER
  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <p className="text-secondary">Loading details...</p>
      </div>
    );
  }

  // NO DATA PLACEHOLDER
  if (!exercise) {
    return (
      <div className="flex justify-center items-center py-8">
        <p className="text-secondary">No details found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* EXERCISE NAME */}
      <div>
        <label className="text-h2">{exercise.name}</label>
      </div>

      {/* CATEGORY */}
      <div>
        <label className="text-secondary">Category</label>
        <p>{exercise.category}</p>
      </div>

      {/* DESCRIPTION */}
      {exercise.description && (
        <div>
          <label className="text-secondary">Description</label>
          <p>{exercise.description}</p>
        </div>
      )}

      {/* MUSCLE GROUPS */}
      <div>
        <label className="text-secondary">Muscle Groups</label>
        {exercise.muscleGroups.length > 0 ? (
          <div className="flex flex-wrap gap-2 mt-1">
            {exercise.muscleGroups.map((mg) => (

              // MUSCLE GROUP BADGE
              <span
                key={mg.muscle_group_id}
                className={`badge ${mg.is_primary ? "badge-blue" : "badge-gray"}`}
              >
                {mg.muscle_group_name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-secondary">No muscle groups assigned.</p>
        )}
      </div>
    </div>
  );
}
