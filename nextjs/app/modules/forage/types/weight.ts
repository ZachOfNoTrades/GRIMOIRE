export interface WeightEntry {
  id: string;
  user_id: string;
  log_date: string;
  weight_lb: number;
  body_fat_pct: number | null;
}
