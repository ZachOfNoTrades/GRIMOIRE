// Per-muscle-group weekly working set counts, joined with calculated landmarks
// MEV/MRV are derived from the user's recent completed weeks (not stored)
export interface WeeklyMuscleGroupVolume {
  muscle_group_id: string;
  muscle_group_name: string;
  working_sets: number;
  mev: number | null; // min weekly working sets across recent completed weeks
  mrv: number | null; // max weekly working sets across recent completed weeks
}
