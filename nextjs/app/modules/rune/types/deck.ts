export interface Deck {
  id: string;
  name: string;
  description: string | null;
  is_archived: boolean;
  created_at: Date;
  modified_at: Date;
}

export interface DeckSummary {
  id: string;
  name: string;
  description: string | null;
  card_count: number;
  due_count: number;
}
