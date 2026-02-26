export interface WorkoutSession {
  id: string;
  name: string;
  session_date: Date;
  notes: string | null;
  created_at: Date;
  modified_at: Date;
}
