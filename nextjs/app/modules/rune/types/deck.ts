export interface DeckSummary {
  id: string;
  name: string;
  description: string | null;
  card_count: number;
  due_count: number;
}
