// Shared by server and client code — keep this file free of Node-only imports.
import type { Attitude, EntityKind, FeatureState, FeatureType, KnowledgeTier } from "../types/oracle";

export const MODULE_SLUG = "oracle";

// DISPLAY CODE — 6 letters, no digits, easy to read off the DM's screen and type on the display
// PC. I, L and O are left out because they are easily misread. The display is read-only and only
// ever shows what the DM has revealed, so the code is a convenience, not a secret. Reading it
// takes a signed-in account.
export const DISPLAY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const DISPLAY_CODE_LENGTH = 6;
export const DISPLAY_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

// The display link always uses the public hostname so it works from any network.
export const PUBLIC_ORIGIN = "https://grimoire.zsmith.io";
export function displayUrlFor(code: string): string {
  return `${PUBLIC_ORIGIN}/oracle/${code}`;
}

export const ENTITY_KINDS: readonly EntityKind[] = ["creature", "person", "place", "item"];
export const ATTITUDES: readonly Attitude[] = ["friendly", "neutral", "hostile"];
export const FEATURE_TYPES: readonly FeatureType[] = ["building", "road", "water", "wall", "landmark"];
export const FEATURE_STATES: readonly FeatureState[] = ["intact", "burned", "ruined"];

// KNOWLEDGE CHECK — the players roll and say the number; the DM clicks the tier it reached.
// The steps follow the fifth-edition lore ladder (DC 10 common, 15 uncommon, 20 rare), with the
// natural 1 as a mistaken belief and everything between as trivia that gives no edge.
export const KNOWLEDGE_TIERS: { key: KnowledgeTier; range: string; label: string }[] = [
  { key: "false", range: "1", label: "incorrect" },
  { key: "trivial", range: "2-9", label: "useless" },
  { key: "common", range: "10-14", label: "slight" },
  { key: "useful", range: "15-19", label: "moderate" },
  { key: "secret", range: "20+", label: "secret" },
];
export const KNOWLEDGE_TIER_KEYS: readonly KnowledgeTier[] = ["false", "trivial", "common", "useful", "secret"];
export const KNOWLEDGE_SKILLS: readonly string[] = ["History", "Arcana", "Nature", "Religion", "Insight", "Investigation"];

// LIMITS — text lengths match the column sizes in the migration.
export const NAME_MAX = 120;
export const SESSION_TITLE_MAX = 160;
export const RECAP_MAX = 4000;
export const DETAILS_MAX = 1000;
export const NOTES_MAX = 4000;
export const FACT_MAX = 600;
export const EVENT_MAX = 1000;
export const WORLD_MAX = 6000;
export const DRAFT_MAX = 20000;
export const PROMPT_MAX = 600;
export const CAPTION_MAX = 120;

export const MAX_CAMPAIGNS = 30;
export const MAX_SESSIONS = 200;
export const MAX_PARTY_MEMBERS = 12;
export const MAX_PARTY_GROUPS = 8;
export const GROUP_NAME_MAX = 60;
export const MEMBER_NAME_MAX = 60;
export const MAX_MAPS = 30;
export const MAX_ENTITIES = 300;
export const MAX_IMAGES = 200;
export const MAX_FEATURES = 120;
export const MAX_EXPLORED = 600;

// MAP — coordinates are map units; the app scales the drawing to whatever box it is given.
export const MAP_DEFAULT_WIDTH = 1000;
export const MAP_DEFAULT_HEIGHT = 620;
export const VISION_DEFAULT = 150;
// The map grid (drawn every MAP_GRID units); placed entries snap to cell centers.
export const MAP_GRID = 50;
// What one tile stands for: a number the DM types and a unit chosen from a short list.
export const SCALE_UNITS = ["feet", "yards", "meters", "miles", "kilometers", "hours", "days"] as const;
export type ScaleUnit = (typeof SCALE_UNITS)[number];
export const SCALE_DEFAULT_VALUE = 5;
export const SCALE_DEFAULT_UNIT: ScaleUnit = "feet";
export const SCALE_VALUE_MAX = 100000;
export const MAP_DESCRIPTION_MAX = 600;
export const VISION_MIN = 10;
export const VISION_MAX = 1500;
export const VISION_SLIDER_MAX = 600; // the slider stops here; a typed number may go on to VISION_MAX
export const VISION_STEP = 1;
// Fog brush (reveal/hide) radius in map units; independent of how far the party sees.
export const BRUSH_MIN = 8;
export const BRUSH_MAX = 300;
export const BRUSH_STEP = 2;
export const BRUSH_DEFAULT = 40;

// SUGGESTION BANNER — a ticker that cycles through a pool of prepared ideas. One item comes on
// every `chip_seconds` (a per-DM setting); an item that has scrolled off the left edge goes to the
// back of the pool, not away. Only using an item (or a picture that will not load) removes it.
// The pool is topped up a batch at a time until it holds CHIP_POOL_MAX, and no further: this is
// the hard ceiling on what the banner can spend of the Claude allowance on its own.
export const CHIP_POOL_MAX = 50;
export const CHIP_BATCH_SIZE = 6;
export const CHIP_LABEL_MAX = 60;
export const CHIP_SECONDS_DEFAULT = 15;
export const CHIP_SECONDS_MIN = 5;
export const CHIP_SECONDS_MAX = 120;

// MODELS — which Claude model each kind of generation runs on, chosen per DM in Settings.
// Each task is set on its own: a quick banner idea and a whole session build need not use the
// same model.
export type TextModel = "haiku" | "sonnet" | "opus";
export const TEXT_MODELS: { key: TextModel; label: string }[] = [
  { key: "haiku", label: "Haiku" },
  { key: "sonnet", label: "Sonnet" },
  { key: "opus", label: "Opus" },
];
export const TEXT_MODEL_KEYS: readonly TextModel[] = ["haiku", "sonnet", "opus"];
export type GenerationTask = "world" | "build" | "map" | "chips" | "fact" | "outline" | "picture";
export const GENERATION_TASKS: { key: GenerationTask; label: string; hint: string }[] = [
  { key: "world", label: "World notes", hint: "Generate on the Prep tab" },
  { key: "build", label: "Session cast", hint: "Session notes into a cast" },
  { key: "map", label: "Maps", hint: "Drawing and editing in words" },
  { key: "chips", label: "Ideas banner", hint: "Batches for the banner" },
  { key: "fact", label: "Knowledge checks", hint: "The fact a roll earns" },
  { key: "outline", label: "Picture write-ups", hint: "A new entry from a banner picture" },
  { key: "picture", label: "Picture search", hint: "Turns a name into search words" },
];
export const TASK_KEYS: readonly GenerationTask[] = GENERATION_TASKS.map((task) => task.key);
export const DEFAULT_MODEL: TextModel = "haiku";
export type TaskModels = Record<GenerationTask, TextModel>;

export const EVENT_PAGE_SIZE = 200;

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12MB, same cap as rune card images
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
