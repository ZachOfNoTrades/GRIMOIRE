// Shared by server and client code — keep this file free of Node-only imports.

export type EntityKind = "creature" | "person" | "place";
export type Attitude = "friendly" | "neutral" | "hostile";
export type FeatureType = "building" | "road" | "water" | "wall" | "landmark";
export type FeatureState = "intact" | "burned" | "ruined";
export type KnowledgeTier = "common" | "useful" | "secret";

// MAP — a map is structured data the app draws, never a picture, so an edit ("the village was
// sacked") changes features in place and the layout stays the same.
export interface MapFeature {
  id: string;
  type: FeatureType;
  name: string; // shown as a label on buildings and landmarks; empty = unlabeled
  x: number;
  y: number;
  w: number;
  h: number;
  state: FeatureState;
}

export interface MapData {
  width: number;
  height: number;
  features: MapFeature[];
}

// A circle of map the party has seen. The union of these is the explored area.
export interface ExploredCircle {
  x: number;
  y: number;
  r: number;
}

export interface OracleMap {
  id: string;
  name: string;
  data: MapData;
  can_undo: boolean;
  party_x: number;
  party_y: number;
  vision_radius: number;
  explored: ExploredCircle[];
}

export interface StatAttack {
  name: string;
  bonus: number;
  damage: string;
}

export interface StatBlock {
  ac: number;
  hp: number;
  hp_max: number;
  speed: number;
  cr: string;
  abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  attacks: StatAttack[];
}

export interface Knowledge {
  id: string;
  entity_id: string;
  fact: string;
  skill: string | null;
  tier: KnowledgeTier | null;
  ts_created: string;
}

export interface OracleEntity {
  id: string;
  kind: EntityKind;
  name: string;
  details: string;
  attitude: Attitude;
  stats: StatBlock | null;
  dm_notes: string;
  map_id: string | null;
  map_x: number | null;
  map_y: number | null;
  image_id: string | null;
  knowledge: Knowledge[];
}

export interface OracleEvent {
  id: string;
  entity_id: string | null;
  scene_title: string | null;
  body: string;
  ts_created: string;
}

export interface OracleImage {
  id: string;
  caption: string;
  content_type: string;
}

// THE SUGGESTION BANNER — a strip of items that scrolls past like a news ticker. Every item is
// prepared ahead of time, together with whatever a tap on it needs, so a tap never waits.
export interface ChipOption {
  tone: string; // short label for the option ("Guarded", "Loot", …); may be empty
  text: string;
  note: string | null; // DM-only aside, e.g. "Insight DC 12: she is lying"
}

// A text item: a question the DM is likely to have, with up to three ready answers.
export interface TextChipContent {
  type: "text";
  title: string;
  options: ChipOption[];
}

// A picture item: a reference image found on the web, with what it could become. Tapping it
// starts the "add to the campaign" flow (a creature in the scene, a place on the map, a person).
export interface ImageChipContent {
  type: "image";
  source_id: string; // the search result's id
  thumbnail: string; // small version, shown on the banner
  image_url: string; // the version saved when the picture is kept
  credit: string;
  suggested_kind: EntityKind;
  suggested_name: string;
}

export type ChipContent = TextChipContent | ImageChipContent;

export interface OracleChip {
  id: string;
  label: string;
  content: ChipContent;
  is_pinned: boolean;
  ts_shown: string | null;
}

export interface OracleSettings {
  chip_seconds: number;
  banner_images: boolean;
}

export interface OracleScene {
  id: string;
  sort_order: number;
  title: string;
  summary: string;
  is_done: boolean;
}

export type PanelKind = "entity" | "image";

export interface OracleCampaign {
  id: string;
  name: string;
  world: string;
  draft: string;
  display_code: string;
  current_scene_id: string | null;
  active_map_id: string | null;
  panel_kind: PanelKind | null;
  panel_entity_id: string | null;
  panel_image_id: string | null;
  display_blank: boolean;
  chips_paused: boolean;
  version: number;
}

export interface CampaignSummary {
  id: string;
  name: string;
  display_code: string;
  scene_count: number;
  ts_updated: string;
}

// Everything the DM's pages read, loaded in one go on the server.
export interface TableSnapshot {
  campaign: OracleCampaign;
  scenes: OracleScene[];
  maps: OracleMap[];
  entities: OracleEntity[];
  images: OracleImage[];
  chips: OracleChip[];
  events: OracleEvent[];
  settings: OracleSettings;
}

// PLAYER DISPLAY — the public, read-only view. Built server-side from the same rows, with
// everything the players must not see (DM notes, stats, anything outside their vision) left out.
export interface DisplayToken {
  id: string;
  name: string;
  attitude: Attitude;
  x: number;
  y: number;
}

export type DisplayPanel =
  | {
      kind: "entity";
      name: string;
      entity_kind: EntityKind;
      attitude: Attitude;
      details: string;
      image_id: string | null;
      knowledge: string[];
    }
  | { kind: "image"; image_id: string; caption: string };

export interface DisplayMap {
  name: string;
  data: MapData;
  party_x: number;
  party_y: number;
  vision_radius: number;
  explored: ExploredCircle[];
  tokens: DisplayToken[];
}

export interface DisplaySnapshot {
  version: number;
  blank: boolean;
  map: DisplayMap | null;
  panel: DisplayPanel | null;
}

// What a "build session" run proposes from the DM's rough draft.
export interface BuiltSession {
  scenes: { title: string; summary: string }[];
  entities: {
    kind: EntityKind;
    name: string;
    details: string;
    attitude: Attitude;
    dm_notes: string;
    cr: string | null;
  }[];
}
