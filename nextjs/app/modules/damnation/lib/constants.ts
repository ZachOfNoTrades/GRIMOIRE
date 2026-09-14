// Shared by server and client code — keep this file free of Node-only imports.

// PLAYER PALETTE — seat colours, named for the mana they evoke. Only these keys are ever
// stored or rendered; each maps to a `.dmn-seat-<key>` design-system class in globals.css,
// so a guest-chosen colour can never carry raw CSS into the host's page.
export const PALETTE = [
  { key: "plains", label: "White" },
  { key: "island", label: "Blue" },
  { key: "swamp", label: "Black" },
  { key: "mountain", label: "Red" },
  { key: "forest", label: "Green" },
  { key: "gold", label: "Gold" },
  { key: "artifact", label: "Grey" },
] as const;

export type ColorKey = (typeof PALETTE)[number]["key"];

export const COLOR_KEYS: readonly string[] = PALETTE.map((entry) => entry.key);

export function isColorKey(value: unknown): value is ColorKey {
  return typeof value === "string" && COLOR_KEYS.includes(value);
}

// JOIN CODE — 4 letters, no digits, easy to read off a TV and type on a phone. I, L and O are
// left out because they're easily misread (23^4 ≈ 280k codes). The small space is acceptable
// because joining closes once the game starts and code misses are rate-limited per address.
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const JOIN_CODE_LENGTH = 4;
export const JOIN_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

// The QR code and share link always point at the public hostname, even when the board is
// opened over the LAN: a LAN URL is unreachable on cellular and is not a secure context.
export const PUBLIC_ORIGIN = "https://grimoire.zsmith.io";

export function joinUrlFor(code: string): string {
  return `${PUBLIC_ORIGIN}/play/${code}`;
}

// GAME LIMITS
export const MIN_SEATS = 2;
export const MAX_SEATS = 6;
export const LIFE_MIN = -999;
export const LIFE_MAX = 999;
export const COMMANDER_DAMAGE_MAX = 999;
export const COMMANDER_DAMAGE_LETHAL = 21;
export const MAX_DELTA = 100;
export const NAME_MAX_LENGTH = 24;
export const STARTING_LIFE_PRESETS = [20, 30, 40] as const;

// WIKI SEARCH — the default is mtg.wiki's search; hosts can replace it in settings.
export const WIKI_QUERY_PLACEHOLDER = "{query}";
export const DEFAULT_WIKI_SEARCH_TEMPLATE =
  "https://mtg.wiki/index.php?search={query}&title=Special%3ASearch&go=Go";
export const WIKI_TEMPLATE_MAX_LENGTH = 500;

export function buildWikiSearchUrl(template: string, query: string): string {
  return template.split(WIKI_QUERY_PLACEHOLDER).join(encodeURIComponent(query.trim()));
}

// Keys for the guest's per-game credential in localStorage.
export const TOKEN_STORAGE_PREFIX = "damnation.token.";
