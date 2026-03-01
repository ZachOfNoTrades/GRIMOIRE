export interface WorkoutSession {
  id: string;
  week_id: string | null;
  order_index: number | null;
  name: string;
  notes: string | null;
  started_at: Date | null;
  resumed_at: Date | null;
  duration: number | null;
  is_current: boolean;
  is_completed: boolean;
  created_at: Date;
  modified_at: Date;
}
