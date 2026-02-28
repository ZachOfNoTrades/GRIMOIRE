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
}
