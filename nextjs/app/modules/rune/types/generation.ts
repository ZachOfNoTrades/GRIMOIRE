export interface GeneratedCard {
  front: string;
  back: string;
  notes: string | null;
  order_index: number;
}

export interface GenerateCardsPayload {
  cards: GeneratedCard[];
}

export interface RefinedCard {
  id: string | null; // existing card ID (null = new card)
  front: string;
  back: string;
  notes: string | null;
}

export interface RefineDeckPayload {
  cards: RefinedCard[];
}

export interface RefineCardPayload {
  front: string;
  back: string;
  notes: string | null;
}

export interface ProposedChange {
  type: 'added' | 'modified' | 'deleted';
  cardId: string | null; // existing card ID (null for additions)
  originalFront: string | null;
  originalBack: string | null;
  originalNotes: string | null;
  proposedFront: string | null;
  proposedBack: string | null;
  proposedNotes: string | null;
}

export interface RefineDeckProposal {
  changes: ProposedChange[];
}
