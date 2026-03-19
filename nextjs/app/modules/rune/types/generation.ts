export interface GeneratedCard {
  front: string;
  back: string;
  notes: string | null;
  order_index: number;
}

export interface GenerateCardsPayload {
  cards: GeneratedCard[];
}
