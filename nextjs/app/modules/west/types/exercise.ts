export interface Exercise {
  id: string;
  name: string;
  description: string | null;
  is_disabled: boolean;
  created_at: Date;
  modified_at: Date;
}

export interface ExerciseSummary {
  id: string;
  name: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  estimated_one_rep_max: number | null;
}

// =============================
// Seed Exercise GUIDs (seeded in init script)
// =============================

export const BACK_SQUAT_ID = 'EEEE0001-EEEE-EEEE-EEEE-EEEEEEEE0001';
export const CONVENTIONAL_DEADLIFT_ID = 'EEEE0002-EEEE-EEEE-EEEE-EEEEEEEE0002';
export const BENCH_PRESS_ID = 'EEEE0003-EEEE-EEEE-EEEE-EEEEEEEE0003';
