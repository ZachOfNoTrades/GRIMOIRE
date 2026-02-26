export interface WorkoutSession {
  id: string;
  week_id: string | null;
  order_index: number | null;
  name: string;
  session_date: Date;
  notes: string | null;
  started_at: Date | null;
  is_current: boolean;
  is_completed: boolean;
  created_at: Date;
  modified_at: Date;
}
