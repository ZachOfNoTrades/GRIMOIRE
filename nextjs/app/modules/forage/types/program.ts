export type ProteinBand = "low" | "moderate" | "high" | "extra_high";
export type DietKind = "balanced" | "low_fat" | "low_carb" | "keto";
export type TrainingKind = "none" | "lifting" | "cardio" | "cardio_lifting";
export type DistributionKind = "even" | "shifted";
export type FloorKind = "standard" | "low";

// "coached" = the algorithm computes targets from the coaching inputs and
// re-balances on a weekly check-in. "manual" = the user types their own weekly
// macro targets and there is no check-in; the coaching inputs are all null.
export type ProgramStyle = "coached" | "manual";

export interface Program {
  id: string;
  user_id: string;
  goal_id: string;
  program_style: ProgramStyle;
  // Coaching inputs — populated for coached programs, null for manual ones.
  protein_band: ProteinBand | null;
  diet_kind: DietKind | null;
  training_kind: TrainingKind | null;
  distribution_kind: DistributionKind | null;
  shifted_high_days: number[] | null;
  floor_kind: FloorKind | null;
  check_in_weekday: number | null;
  last_checkin_date: string | null;
  created_at: string;
  ended_at: string | null;
}

// Coaching inputs for a coached program. Manual programs pass all of these null.
export interface ProgramInput {
  program_style: ProgramStyle;
  protein_band: ProteinBand | null;
  diet_kind: DietKind | null;
  training_kind: TrainingKind | null;
  distribution_kind: DistributionKind | null;
  shifted_high_days: number[] | null;
  floor_kind: FloorKind | null;
  check_in_weekday: number | null;
}
