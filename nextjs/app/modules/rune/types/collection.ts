import { DeckSummary } from './deck';

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
  modified_at: Date;
}

export interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  deck_count: number;
  card_count: number;
  due_count: number;
  last_reviewed_at: Date | null;
}

// A collection plus the decks it groups — what the detail page renders.
export interface CollectionWithDecks extends CollectionSummary {
  decks: DeckSummary[];
}
