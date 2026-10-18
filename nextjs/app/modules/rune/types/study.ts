// One past study session, seen from a single deck.
//
// The counts are built from this deck's own card_reviews rather than from
// study_sessions.cards_studied, for two reasons: a COLLECTION session spans several
// decks, so only the slice that touched this deck belongs on this deck's history; and
// cards_studied is a running counter that keeps counting reviews of cards that have
// since been deleted, which the deck can no longer show.
export interface DeckStudySession {
  id: string;
  started_at: Date;
  // Null when the session was left without finishing (quit, closed tab, phone locked).
  completed_at: Date | null;
  // Name of the collection the session ran under, or null for a session started from
  // this deck. When set, every number on the row is only this deck's share of it.
  collection_name: string | null;
  // Ratings submitted against this deck's cards, and how many distinct cards they
  // cover — a lapsed card comes round again in the same session, so reviews >= cards.
  reviews: number;
  cards: number;
  // Rating tally, 1-4 on the study session's Again / Hard / Good / Easy scale.
  again: number;
  hard: number;
  good: number;
  easy: number;
  // Good or better — the same rating >= 3 cut the study session scores "correct" on.
  correct: number;
  // Wall-clock seconds. Exact only when the session was finished from this deck
  // (study_sessions.duration); otherwise it is measured off the review timestamps and
  // therefore misses the time spent on the first card — see is_duration_exact.
  duration_seconds: number | null;
  is_duration_exact: boolean;
  // Mean answer time across the reviews that recorded one (null for reviews written
  // before response times were captured).
  avg_response_ms: number | null;
}

// One past study session across all of the user's study, newest first — the MCP
// rune_list_study_sessions feed. Unlike DeckStudySession every number covers the whole
// session, collection sessions included.
export interface StudySessionHistoryEntry {
  id: string;
  started_at: Date;
  // Null when the session was left without finishing (quit, closed tab, phone locked).
  completed_at: Date | null;
  // Set for a session started from a deck; null for a collection session.
  deck_id: string | null;
  deck_name: string | null;
  // Set for a session started from a collection; null for a deck session.
  collection_id: string | null;
  collection_name: string | null;
  // Every deck the session actually reviewed cards from, by name. One entry for a deck
  // session, any number for a collection session; empty when nothing was rated.
  decks_reviewed: string[];
  // Ratings submitted in the session, and how many distinct cards they cover.
  reviews: number;
  cards: number;
  // Good or better — the same rating >= 3 cut the study session scores "correct" on.
  correct: number;
  // Wall-clock seconds. Exact when the session was finished (study_sessions.duration);
  // for an abandoned one it is the span from its start to its last rating, and null if
  // it was abandoned before any rating.
  duration_seconds: number | null;
  is_duration_exact: boolean;
}
