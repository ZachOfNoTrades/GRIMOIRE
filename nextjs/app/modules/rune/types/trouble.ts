// A TroubleCard is a card the user keeps failing to remember, judged from their own review history.
export interface TroubleCard {
  id: string;
  deck_id: string;
  deck_name: string;
  front: string;
  back: string;
  notes: string | null;
  category: string | null;
  source_ref: string | null;
  review_count: number;
  lapse_count: number; // Again ratings given after the card had already been answered Good or Easy
  recent_miss_count: number; // Again or Hard ratings among the most recent TROUBLE_RECENT_WINDOW
  recent_ratings: number[]; // Most recent first, up to TROUBLE_RECENT_WINDOW
  ease_factor: number | null;
  next_review_at: Date | null;
  last_reviewed_at: Date | null;
}

// A card is listed when any one of these holds
export const TROUBLE_MIN_LAPSES = 2;
export const TROUBLE_RECENT_WINDOW = 5;
export const TROUBLE_MIN_RECENT_MISSES = 3;
export const TROUBLE_MAX_EASE = 2.0;

export function isLapseTrouble(card: TroubleCard): boolean {
  return card.lapse_count >= TROUBLE_MIN_LAPSES;
}

export function isRecentTrouble(card: TroubleCard): boolean {
  return card.recent_miss_count >= TROUBLE_MIN_RECENT_MISSES;
}

export function isEaseTrouble(card: TroubleCard): boolean {
  return card.ease_factor !== null && card.ease_factor <= TROUBLE_MAX_EASE;
}
