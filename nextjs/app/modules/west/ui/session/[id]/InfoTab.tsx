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

  const primaryMuscles = exercise.muscleGroups.filter((mg) => mg.is_primary);
  const secondaryMuscles = exercise.muscleGroups.filter((mg) => !mg.is_primary);

  return (
    <div className="space-y-4">

      {/* EXERCISE NAME */}
      <div>
        <label className="text-h2">{exercise.name}</label>
      </div>

      {/* DESCRIPTION */}
      {exercise.description && (
        <div>
          <label className="text-secondary">Description</label>
          <p>{exercise.description}</p>
        </div>
      )}

      {/* PRIMARY MUSCLES */}
      {primaryMuscles.length > 0 && (
        <div>
          <label className="text-secondary">Primary Muscles</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {primaryMuscles.map((mg) => (
              <span key={mg.muscle_group_id} className="badge-default">
                {mg.muscle_group_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* SECONDARY MUSCLES */}
      {secondaryMuscles.length > 0 && (
        <div>
          <label className="text-secondary">Secondary Muscles</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {secondaryMuscles.map((mg) => (
              <span key={mg.muscle_group_id} className="badge-default">
                {mg.muscle_group_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* NO MUSCLE GROUPS */}
      {exercise.muscleGroups.length === 0 && (
        <div>
          <label className="text-secondary">Muscle Groups</label>
          <p className="text-secondary">No muscle groups assigned.</p>
        </div>
      )}
    </div>
  );
}
