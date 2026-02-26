export interface SessionExercise {
  id: string;
  session_id: string;
  exercise_id: string;
  exercise_name: string;
  order_index: number;
  notes: string | null;
  created_at: Date;
  modified_at: Date;
}

export interface SessionExerciseSet {
  id: string;
  session_exercise_id: string;
  set_number: number;
  reps: number;
  weight: number;
  rpe: number | null;
  notes: string | null;
  created_at: Date;
  modified_at: Date;
}

export interface SessionExerciseWithSets extends SessionExercise {
  sets: SessionExerciseSet[];
}
