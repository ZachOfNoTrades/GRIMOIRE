// Table layouts for the board: how the player cards are arranged so the screen mirrors where
// people sit. Each layout is a CSS grid; `areas` names one slot per player (a, b, c, ...) and
// cards fill the slots in seat order. Shared by server validation and the board, so keep it
// free of Node-only imports.

export interface BoardLayout {
  key: string;
  label: string;
  // How many cards the layout holds; offered only for games with this many players.
  slots: number;
  columns: string;
  areas: string[];
}

export const BOARD_LAYOUTS: BoardLayout[] = [
  { key: "2-row", label: "Side by side", slots: 2, columns: "1fr 1fr", areas: ["a b"] },
  { key: "2-stack", label: "Top and bottom", slots: 2, columns: "1fr", areas: ["a", "b"] },

  { key: "3-left", label: "1 left, 2 right", slots: 3, columns: "1fr 1fr", areas: ["a b", "a c"] },
  { key: "3-right", label: "2 left, 1 right", slots: 3, columns: "1fr 1fr", areas: ["a c", "b c"] },
  { key: "3-top", label: "1 top, 2 bottom", slots: 3, columns: "1fr 1fr", areas: ["a a", "b c"] },
  { key: "3-row", label: "3 in a row", slots: 3, columns: "1fr 1fr 1fr", areas: ["a b c"] },

  { key: "4-grid", label: "2 × 2", slots: 4, columns: "1fr 1fr", areas: ["a b", "c d"] },
  { key: "4-ends", label: "1 · 2 · 1", slots: 4, columns: "1fr 1fr 1fr", areas: ["a b d", "a c d"] },
  { key: "4-row", label: "4 in a row", slots: 4, columns: "repeat(4, 1fr)", areas: ["a b c d"] },

  { key: "5-2-3", label: "2 top, 3 bottom", slots: 5, columns: "repeat(6, 1fr)", areas: ["a a a b b b", "c c d d e e"] },
  { key: "5-3-2", label: "3 top, 2 bottom", slots: 5, columns: "repeat(6, 1fr)", areas: ["a a b b c c", "d d d e e e"] },
  { key: "5-ends", label: "1 · 3 · 1", slots: 5, columns: "1fr 1fr 1fr", areas: ["a b e", "a c e", "a d e"] },

  { key: "6-3x2", label: "3 × 2", slots: 6, columns: "1fr 1fr 1fr", areas: ["a b c", "d e f"] },
  { key: "6-2x3", label: "2 × 3", slots: 6, columns: "1fr 1fr", areas: ["a b", "c d", "e f"] },
  { key: "6-ends", label: "1 · 2 · 2 · 1", slots: 6, columns: "repeat(4, 1fr)", areas: ["a b d f", "a c e f"] },
];

export const SLOT_NAMES = ["a", "b", "c", "d", "e", "f"] as const;

export function layoutsFor(playerCount: number): BoardLayout[] {
  return BOARD_LAYOUTS.filter((layout) => layout.slots === playerCount);
}

export function findLayout(key: string | null | undefined, playerCount: number): BoardLayout | null {
  if (!key) return null;
  return BOARD_LAYOUTS.find((layout) => layout.key === key && layout.slots === playerCount) ?? null;
}

export function isLayoutKey(value: unknown): value is string {
  return typeof value === "string" && BOARD_LAYOUTS.some((layout) => layout.key === value);
}
