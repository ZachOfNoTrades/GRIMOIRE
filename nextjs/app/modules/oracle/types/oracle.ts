import type { ScaleUnit, TaskModels } from "../lib/constants";
// Shared by server and client code — keep this file free of Node-only imports.

export type EntityKind = "creature" | "person" | "place" | "item";
export type Attitude = "friendly" | "neutral" | "hostile";
export type FeatureType = "building" | "road" | "water" | "wall" | "landmark";
export type FeatureState = "intact" | "burned" | "ruined";
export type KnowledgeTier = "false" | "trivial" | "common" | "useful" | "secret";

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
  // Where the DM dragged the label, in map units from where it would otherwise sit. A location's
  // label stays where it is put: it is not nudged around by the label layout as other things move.
  label_dx?: number;
  label_dy?: number;
  // The same, for the map's own page: the DM places names there apart from the Table.
  page_label_dx?: number;
  page_label_dy?: number;
}

// What one tile stands for is `scale_value` of `scale_unit` (default 5 feet). `scale_label` is the
// reading derived from them, e.g. "1 tile = 5 feet".
// Where the background picture sits on the map: its rectangle in map units. Absent means the
// picture is stretched over the whole map.
export interface PictureRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapData {
  width: number;
  height: number;
  scale_value: number;
  scale_unit: ScaleUnit;
  scale_label: string;
  description: string; // what the map shows, in the DM's words; also what a generated map was drawn from
  background: PictureRect | null;
  features: MapFeature[];
  disabled?: boolean; // left out of the Table's map list; the map and its page stay as they are
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
  party_x: number;
  party_y: number;
  vision_radius: number;
  explored: ExploredCircle[];
  background_image_id: string | null; // one of the campaign's pictures, drawn under the grid
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

/**
 * How much of an entry the players' screen shows:
 *   hidden   — never drawn, even with the party standing on it
 *   sight    — drawn once it is inside what the party can see
 *   revealed — always drawn, wherever the party is
 */
export type EntityVisibility = "hidden" | "sight" | "revealed";

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
  visibility: EntityVisibility;
  is_down: boolean; // dead or out of the fight: stays on the map, no longer active
  in_party: boolean; // travels with the party instead of standing on a map
  party_group_id: string | null; // the group it travels with; null = with the party token
  source: string | null; // the published book and page it comes from; null = homebrew
  knowledge: Knowledge[];
}

export interface OracleEvent {
  id: string;
  entity_id: string | null;
  session_title: string | null;
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
  encounter?: { name: string; cr: string; count: number }[]; // creatures this option puts in front of the party
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
  ai_creatures: boolean; // false: every creature must come from a published source
  models: TaskModels; // which Claude model each kind of generation runs on
}

// A night at the table: rough notes going in, a recap coming out. The campaign points at the
// live one, and every generation at the table is written against it.
export interface OracleSession {
  id: string;
  title: string;
  session_date: string | null; // YYYY-MM-DD
  notes: string;
  recap: string;
  is_done: boolean;
  ts_created: string;
}

export type PanelKind = "entity" | "image";

export interface OracleCampaign {
  id: string;
  name: string;
  world: string;
  display_code: string;
  current_session_id: string | null;
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
  session_count: number;
  ts_updated: string;
}

// Everything the DM's pages read, loaded in one go on the server.
// A player character. Level feeds the encounter builder; a map position means the member stands
// apart from the party token and sees the map from there.
export interface OraclePartyMember {
  id: string;
  name: string;
  level: number;
  group_id: string | null; // null = with the main party token
}

// A named token on a map that some of the party stands with, apart from the main party token.
export interface OraclePartyGroup {
  id: string;
  name: string;
  map_id: string | null;
  map_x: number | null;
  map_y: number | null;
}

export interface TableSnapshot {
  campaign: OracleCampaign;
  sessions: OracleSession[];
  party: OraclePartyMember[];
  party_groups: OraclePartyGroup[];
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
  kind: EntityKind;
  attitude: Attitude;
  details: string; // the public description
  revealed: boolean; // put on the map by the DM's hand, whatever the party sees
  down: boolean; // dead or out of the fight
  image_id: string | null;
  knowledge: string[]; // facts already revealed

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

// A building or landmark the party has seen whose location entry the players may read.
export interface DisplayLocation {
  feature_id: string;
  name: string;
  details: string;
  image_id: string | null;
  knowledge: string[];
}

// A creature, person or item traveling with the party; the players know who is with them.
export interface DisplayCompanion {
  id: string;
  name: string;
  kind: EntityKind;
  attitude: Attitude;
  details: string;
  down: boolean;
  image_id: string | null;
  knowledge: string[];
  group_id: string | null; // a group standing apart, else with the party token
}

export interface DisplayMap {
  name: string;
  data: MapData;
  party_x: number;
  party_y: number;
  vision_radius: number;
  explored: ExploredCircle[];
  tokens: DisplayToken[];
  groups: { id: string; name: string; x: number; y: number }[]; // groups standing apart from the party token
  companions: DisplayCompanion[];
  locations: DisplayLocation[]; // seen buildings and landmarks that have a location entry
  background_image_id: string | null;
}

export interface DisplaySnapshot {
  version: number;
  blank: boolean;
  map: DisplayMap | null;
  panel: DisplayPanel | null;
}

// What a "build entities" run proposes from a session's rough notes.
export interface BuiltEntities {
  entities: {
    kind: EntityKind;
    name: string;
    details: string;
    attitude: Attitude;
    dm_notes: string;
    cr: string | null;
    source: string | null;
  }[];
}
