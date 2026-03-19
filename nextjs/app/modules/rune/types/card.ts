export interface CardWithProgress {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  notes: string | null;
  source: string | null;
  source_id: string | null;
  order_index: number;
  is_disabled: boolean;
  created_at: Date;
  modified_at: Date;
  ease_factor: number | null;
  interval_days: number | null;
  repetitions: number | null;
  next_review_at: Date | null;
  last_reviewed_at: Date | null;
}
