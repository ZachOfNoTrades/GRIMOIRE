export interface Exercise {
  id: string;
  name: string;
  description: string | null;
  category: string;
  is_timed: boolean;
  distance_type: string | null; // NULL = no distance tracking, 'short' = feet/yards/meters, 'long' = km/mi
  is_disabled: boolean;
  created_at: Date;
  modified_at: Date;
}

export interface ExerciseSummary {
  id: string;
  name: string;
  category: string;
  is_timed: boolean;
  distance_type: string | null; // NULL = no distance tracking, 'short' = feet/yards/meters, 'long' = km/mi
  is_disabled: boolean;
  primary_muscles: string[];
  secondary_muscles: string[];
  estimated_one_rep_max: number | null;
  last_used_at: Date | null;
}

// A per-user temporary hold on an exercise (injury / contraindication). Excludes the exercise from
// the deterministic generator across ALL locations while active. disabled_until null = permanent.
export interface ExerciseHold {
  exercise_id: string;
  name: string;
  disabled_until: string | null; // ISO instant; null = permanent
  reason: string | null;
  is_active: boolean; // false = expired (disabled_until already passed)
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
  reps: number | null;
  weight: number;
  rpe: number | null;
  time_seconds: number | null;
  distance: number | null; // logged distance in meters (null when the exercise doesn't track distance)
}

export interface ExerciseHistoryEntry {
  session_id: string;
  session_name: string;
  started_at: Date | null;
  program_name: string | null;
  sets: ExerciseHistorySet[];
}