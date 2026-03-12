export interface ImportSet {
  set_number: number;
  is_warmup: boolean;
  reps: number | null;
  weight: number;
  rpe: number | null;
  time_seconds: number | null;
}

export interface ImportSegment {
  exercise_name: string;
  exercise_id: string | null;
  order_index: number;
  is_warmup: boolean;
  sets: ImportSet[];
}

export interface ImportSession {
  name: string;
  started_at: string;
  segments: ImportSegment[];
}

export interface NewExerciseInput {
  name: string;
  description: string | null;
  category: string;
}

export interface ImportPayload {
  sessions: ImportSession[];
  new_exercises: NewExerciseInput[];
}

export interface ImportResult {
  sessions_created: number;
  segments_created: number;
  sets_created: number;
  exercises_created: number;
}

export interface ImportPreview {
  sessions: ImportSession[];
  new_exercise_names: string[];
  matched_exercise_names: string[];
  errors: ImportValidationError[];
}

export interface ImportValidationError {
  row: number;
  field: string;
  message: string;
}
