// Deck sharing. An owner shares a deck with an email address at one of two roles; the
// signed-in user whose email matches gets that access. See lib/shareFunctions.ts.

export type DeckShareRole = 'view' | 'edit';

// What the requesting user may do with a deck. Ordered: every role can do everything the
// roles before it can.
//   view  — read the deck, study it on their own schedule, star/pause it for themselves
//   edit  — also add/change/delete/reorder cards, edit the deck's details, AI refine, import
//   owner — also delete the deck and manage who it's shared with
export type DeckRole = DeckShareRole | 'owner';

export const DECK_SHARE_ROLES: DeckShareRole[] = ['view', 'edit'];

// Longest email address RFC 5321 permits; matches the deck_shares.email column.
export const SHARE_EMAIL_MAX_LENGTH = 320;

// One row of the owner's "shared with" list. Deliberately carries nothing about the
// recipient beyond the address the owner typed — not whether it belongs to an account.
export interface DeckShare {
  id: string;
  email: string;
  role: DeckShareRole;
  created_at: Date;
}

export interface DeckAccess {
  ownerId: string;
  role: DeckRole;
  // The sharee's own star / pause flags from their share row. Null for the owner, whose
  // flags live on the deck row itself.
  shareFavorite: boolean | null;
  shareDisabled: boolean | null;
}
