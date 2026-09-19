// Column widths of dbo.decks in the RUNE database. Over-long values used to reach the
// INSERT/UPDATE and come back as a 500 ("String or binary data would be truncated"), so
// both write routes check against these and return a 400 instead.
export const DECK_NAME_MAX_LENGTH = 255;
export const DECK_SOURCE_URL_MAX_LENGTH = 2000;

import type { DeckRole, DeckShareRole } from './share';

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
  // Set by GET /api/decks/[id] only. What the requester may do with this deck, and — when
  // it was shared with them — whose deck it is. share_count is sent to the owner only.
  access_role?: DeckRole;
  owner_name?: string | null;
  share_count?: number;
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
  // Present only on decks shared WITH the user (GET /api/decks `shared`); absent on their own.
  access_role?: DeckShareRole;
  owner_name?: string | null;
}
