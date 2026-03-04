export interface Exercise {
  id: string;
  name: string;
  description: string | null;
  category: string;
  is_disabled: boolean;
  created_at: Date;
  modified_at: Date;
}

export interface ExerciseSummary {
  id: string;
  name: string;
  category: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  estimated_one_rep_max: number | null;
  last_used_at: Date | null;
}

export interface ExerciseModifier {
  id: string;
  name: string;
  created_at: Date;
  modified_at: Date;
}

export interface ExerciseHistorySet {
  set_number: number;
  is_warmup: boolean;
  reps: number;
  weight: number;
  rpe: number | null;
}

export interface ExerciseHistoryEntry {
  session_id: string;
  session_name: string;
  started_at: Date | null;
  program_name: string | null;
  sets: ExerciseHistorySet[];
}