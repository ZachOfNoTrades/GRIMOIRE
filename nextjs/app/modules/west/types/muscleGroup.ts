import { Exercise } from './exercise';

export interface MuscleGroup {
  id: string;
  name: string;
}

export interface ExerciseMuscleGroup {
  id: string;
  exercise_id: string;
  muscle_group_id: string;
  muscle_group_name: string;
  is_primary: boolean;
}

// Used by the exercise detail page (extends the base Exercise type)
export interface ExerciseWithMuscleGroups extends Exercise {
  muscleGroups: ExerciseMuscleGroup[];
}
