// Shared by server and client code — keep this file free of Node-only imports.
import type { Attitude, EntityKind, FeatureState, FeatureType, KnowledgeTier } from "../types/oracle";

export const MODULE_SLUG = "oracle";

// DISPLAY CODE — 6 letters, no digits, easy to read off the DM's screen and type on the display
// PC. I, L and O are left out because they are easily misread. The display is read-only and only
// ever shows what the DM has revealed, so the code is a convenience, not a secret.
export const DISPLAY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const DISPLAY_CODE_LENGTH = 6;
export const DISPLAY_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

// The display link always uses the public hostname so it works from any network.
export const PUBLIC_ORIGIN = "https://grimoire.zsmith.io";
export function displayUrlFor(code: string): string {
  return `${PUBLIC_ORIGIN}/oracle/${code}`;
}

export const ENTITY_KINDS: readonly EntityKind[] = ["creature", "person", "place"];
export const ATTITUDES: readonly Attitude[] = ["friendly", "neutral", "hostile"];
export const FEATURE_TYPES: readonly FeatureType[] = ["building", "road", "water", "wall", "landmark"];
export const FEATURE_STATES: readonly FeatureState[] = ["intact", "burned", "ruined"];

// KNOWLEDGE CHECK — the players roll and say the number; the DM clicks the tier it reached.
export const KNOWLEDGE_TIERS: { key: KnowledgeTier; range: string; label: string }[] = [
  { key: "common", range: "10-14", label: "common" },
  { key: "useful", range: "15-19", label: "useful" },
  { key: "secret", range: "20+", label: "secret" },
];
export const KNOWLEDGE_TIER_KEYS: readonly KnowledgeTier[] = ["common", "useful", "secret"];
export const KNOWLEDGE_SKILLS: readonly string[] = ["History", "Arcana", "Nature", "Religion", "Insight", "Investigation"];

// LIMITS — text lengths match the column sizes in the migration.
export const NAME_MAX = 120;
export const SCENE_TITLE_MAX = 160;
export const SCENE_SUMMARY_MAX = 500;
export const DETAILS_MAX = 1000;
export const NOTES_MAX = 4000;
export const FACT_MAX = 600;
export const EVENT_MAX = 1000;
export const WORLD_MAX = 6000;
export const DRAFT_MAX = 20000;
export const PROMPT_MAX = 600;
export const CAPTION_MAX = 120;

export const MAX_CAMPAIGNS = 30;
export const MAX_SCENES = 60;
export const MAX_MAPS = 30;
export const MAX_ENTITIES = 300;
export const MAX_IMAGES = 200;
export const MAX_FEATURES = 120;
export const MAX_EXPLORED = 600;
export const MAX_UNDO = 8;

// MAP — coordinates are map units; the app scales the drawing to whatever box it is given.
export const MAP_DEFAULT_WIDTH = 1000;
export const MAP_DEFAULT_HEIGHT = 620;
export const VISION_DEFAULT = 150;
export const VISION_MIN = 40;
export const VISION_MAX = 600;

// SUGGESTION BANNER — a ticker of prepared items. One new item comes on every `chip_seconds`
// (a per-DM setting); an item that has scrolled off the left edge is dropped. Items are prepared a
// batch at a time, ahead of need, so the banner never waits on a generation.
export const CHIP_BAR_SIZE = 12; // items kept on the banner at once: comfortably more than a wide screen shows
export const CHIP_BATCH_SIZE = 6;
export const CHIP_QUEUE_LOW = 4;
export const CHIP_LABEL_MAX = 60;
export const CHIP_SECONDS_DEFAULT = 15;
export const CHIP_SECONDS_MIN = 5;
export const CHIP_SECONDS_MAX = 120;

export const EVENT_PAGE_SIZE = 200;

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12MB, same cap as rune card images
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
