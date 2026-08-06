export interface CardWithProgress {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  notes: string | null;
  category: string | null;
  source: string | null;
  source_id: string | null;
  order_index: number;
  is_disabled: boolean;
  is_draft: boolean;
  created_at: Date;
  modified_at: Date;
  ease_factor: number | null;
  interval_days: number | null;
  repetitions: number | null;
  next_review_at: Date | null;
  last_reviewed_at: Date | null;
  last_rating: number | null;
  // Only populated by the collection card fetch, where a card can come from any
  // member deck — undefined for a single-deck fetch.
  deck_name?: string | null;
}

// One past rating of a card, straight out of card_reviews — the raw history
// behind the SRS state on CardWithProgress.
export interface CardReview {
  id: string;
  rating: number;
  response_time_ms: number | null;
  created_at: Date;
  study_session_id: string;
}
