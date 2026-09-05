// Column widths for the free-text card fields that are NOT nvarchar(max). They live here,
// not in cardFunctions, because the card modal (a client component) needs them for its
// maxLength caps — and importing anything from cardFunctions drags `mssql` into the
// browser bundle. The API layer and the MCP schemas use them to reject over-length input
// up front with a 400 instead of letting it reach the driver as a truncation 500.
export const CARD_SOURCE_REF_MAX = 500;
export const CARD_CATEGORY_MAX = 200;

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
