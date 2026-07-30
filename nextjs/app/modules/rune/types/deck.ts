export interface Deck {
  id: string;
  name: string;
  description: string | null;
  source_url: string | null;
  is_archived: boolean;
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
  card_count: number;
  due_count: number;
  last_reviewed_at: Date | null;
}
