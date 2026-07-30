export interface MacroTarget {
  id: string;
  user_id: string;
  effective_date: string;
  day_of_week: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  is_active: boolean;
  source: 'manual' | 'program';
}
