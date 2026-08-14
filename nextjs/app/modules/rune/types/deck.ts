// Column widths of dbo.decks in the RUNE database. Over-long values used to reach the
// INSERT/UPDATE and come back as a 500 ("String or binary data would be truncated"), so
// both write routes check against these and return a 400 instead.
export const DECK_NAME_MAX_LENGTH = 255;
export const DECK_SOURCE_URL_MAX_LENGTH = 2000;

export interface Deck {
  id: string;
  name: string;
  description: string | null;
  source_url: string | null;
  is_archived: boolean;
  is_disabled: boolean;
  is_favorite: boolean;
  created_at: Date;
  modified_at: Date;
  last_reviewed_at: Date | null;
}

export interface DeckSummary {
  id: string;
  name: string;
  description: string | null;
  is_favorite: boolean;
  // A disabled deck is paused: due_count is always 0 for it, and it is skipped by the
  // dashboard badge, the daily review email, and collection study sessions.
  is_disabled: boolean;
  card_count: number;
  due_count: number;
  last_reviewed_at: Date | null;
}
