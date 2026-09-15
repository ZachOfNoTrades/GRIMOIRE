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
  { key: "3-bottom", label: "2 top, 1 bottom", slots: 3, columns: "1fr 1fr", areas: ["a b", "c c"] },

  { key: "4-grid", label: "2 × 2", slots: 4, columns: "1fr 1fr", areas: ["a b", "c d"] },
  { key: "4-ends", label: "1 · 2 · 1", slots: 4, columns: "1fr 1fr 1fr", areas: ["a b d", "a c d"] },
  { key: "4-tall-left", label: "1 tall left; 1 wide top and 2 below on the right", slots: 4, columns: "1fr 1fr 1fr", areas: ["a b b", "a c d"] },
  { key: "4-tall-right", label: "1 tall right; 1 wide top and 2 below on the left", slots: 4, columns: "1fr 1fr 1fr", areas: ["b b a", "c d a"] },

  { key: "5-2-3", label: "2 top, 3 bottom", slots: 5, columns: "repeat(6, 1fr)", areas: ["a a a b b b", "c c d d e e"] },
  { key: "5-3-2", label: "3 top, 2 bottom", slots: 5, columns: "repeat(6, 1fr)", areas: ["a a b b c c", "d d d e e e"] },

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

// Every game has a table layout: the saved one when it fits the player count, otherwise the first
// layout for that count. (Older games saved none, and a removed layout no longer matches.)
// The host's saved layout per player count (damnation_settings.board_layouts, JSON like
// {"4":"4-grid"}). Anything unreadable counts as no preferences.
export function parseLayoutPreferences(json: string | null | undefined): Record<string, string> {
  try {
    const parsed = JSON.parse(json ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveLayout(key: string | null | undefined, playerCount: number): BoardLayout {
  return findLayout(key, playerCount) ?? layoutsFor(playerCount)[0];
}

// The most cards side by side in any row, e.g. 3 for "1 · 2 · 1". Decides whether a screen is
// wide enough to show the layout.
export function cardsPerRow(layout: BoardLayout): number {
  return Math.max(...layout.areas.map((row) => new Set(row.split(" ")).size));
}

// Spots on the board, in order: each player sits at their own position (seat), and spots nobody
// holds are null, so removing a player leaves a gap instead of shifting everyone after them. A
// player whose position is beyond the spot count (or clashes) takes the first free spot.
export function arrangeSpots<T extends { position: number }>(players: T[], spotCount: number): (T | null)[] {
  const spots: (T | null)[] = Array.from({ length: Math.max(spotCount, players.length) }, () => null);
  const overflow: T[] = [];
  for (const player of players) {
    const index = player.position - 1;
    if (index >= 0 && index < spots.length && spots[index] === null) spots[index] = player;
    else overflow.push(player);
  }
  for (const player of overflow) spots[spots.indexOf(null)] = player;
  return spots;
}

export function isLayoutKey(value: unknown): value is string {
  return typeof value === "string" && BOARD_LAYOUTS.some((layout) => layout.key === value);
}
