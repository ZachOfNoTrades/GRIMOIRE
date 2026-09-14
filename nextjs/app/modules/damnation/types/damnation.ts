export type SessionStatus = "lobby" | "active" | "finished";

export type EventType =
  | "join"
  | "claim"
  | "life"
  | "commander_damage"
  | "status"
  | "undo"
  | "kick"
  | "start"
  | "reopen"
  | "rotate_code"
  | "end"
  | "reorder"
  | "setup"
  | "edit_player";

// Why a player counts as out of the game. Derived on read, never stored, so an undo can't
// leave a stale flag behind.
export type EliminationReason = "life" | "commander_damage" | "conceded" | "host" | null;

export interface PlayerView {
  id: string;
  position: number;
  display_name: string;
  color_key: string;
  life_total: number;
  conceded: boolean;
  eliminated_override: boolean | null;
  eliminated: boolean;
  elimination_reason: EliminationReason;
  // After a resume, a phone player waiting to rejoin from their phone.
  rejoinable: boolean;
  // Added by the host from the board; no phone is attached to it.
  manual: boolean;
}

export interface CommanderDamageCell {
  source_player_id: string;
  target_player_id: string;
  damage: number;
}

export interface EventView {
  id: string;
  // The client-generated id of the request that produced this event; lets a phone clear its
  // pending overlay as soon as its own tap shows up in a broadcast.
  op_id: string;
  version: number;
  event_type: EventType;
  actor_player_id: string | null;
  target_player_id: string | null;
  payload: Record<string, unknown> | null;
  undone: boolean;
  ts_created: string;
}

export interface SessionSnapshot {
  version: number;
  status: SessionStatus;
  join_code: string | null;
  starting_life: number;
  max_players: number;
  wiki_search_template: string;
  wiki_embed: boolean;
  // The host's setting: when false, cards offer no commander damage (status controls remain).
  commander_damage_enabled: boolean;
  // Table arrangement key from lib/boardLayouts.ts; null = the automatic grid. Shown on the board
  // and, where the screen is wide enough, on phones.
  board_layout: string | null;
  players: PlayerView[];
  // Players no longer in the game, so the activity feed can still name them.
  former_players: { id: string; display_name: string }[];
  commander_damage: CommanderDamageCell[];
  events: EventView[];
}

// Host-only additions. Guests never receive the session id or anything about the host.
export interface HostSnapshot extends SessionSnapshot {
  id: string;
  join_url: string | null;
  ts_created: string;
}

export interface GuestSnapshot extends SessionSnapshot {
  me: string;
}

// Public pre-join view of a session, keyed by code. Deliberately omits life totals.
export interface LobbyView {
  joinable: boolean;
  status: SessionStatus;
  max_players: number;
  player_count: number;
  // Colors already in use — only used to preselect an unused one; any color can be picked.
  taken_colors: string[];
  rejoinable_players: { player_id: string; display_name: string; color_key: string }[];
}

export interface SessionSummary {
  id: string;
  status: SessionStatus;
  join_code: string | null;
  starting_life: number;
  max_players: number;
  player_count: number;
  ts_created: string;
  ts_finished: string | null;
}

export interface DamnationSettings {
  wiki_search_template: string;
  wiki_embed: boolean;
  commander_damage_enabled: boolean;
  is_default_template: boolean;
}

// Stream events pushed over SSE.
export type StreamEvent =
  | { type: "snapshot"; data: SessionSnapshot }
  | { type: "presence"; data: { connected_player_ids: string[]; host_connected: boolean } }
  | { type: "revoked"; data: { reason: "kicked" | "ended" } };
