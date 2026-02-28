export interface TargetSessionExercise {
  id: string;
  session_id: string;
  exercise_id: string;
  exercise_name: string;
  order_index: number;
  created_at: Date;
  modified_at: Date;
  sets: TargetSessionExerciseSet[];
}

export interface TargetSessionExerciseSet {
  id: string;
  target_session_exercise_id: string;
  set_number: number;
  is_warmup: boolean;
  reps: number;
  weight: number;
  rpe: number | null;
  created_at: Date;
  modified_at: Date;
}

export interface SessionExercise {
  id: string;
  session_id: string;
  exercise_id: string;
  exercise_name: string;
  target_id: string | null;
  order_index: number;
  notes: string | null;
  created_at: Date;
  modified_at: Date;
}

export interface SessionExerciseSet {
  id: string;
  session_exercise_id: string;
  set_number: number;
  is_warmup: boolean;
  reps: number;
  weight: number;
  rpe: number | null;
  notes: string | null;
  created_at: Date;
  modified_at: Date;
}

export interface SessionExerciseWithSets extends SessionExercise {
  sets: SessionExerciseSet[];
  target: TargetSessionExercise | null;
}
