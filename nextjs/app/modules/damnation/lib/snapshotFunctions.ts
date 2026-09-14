import sql from "mssql";
import { getMainConnection } from "@/lib/db";
import {
  COMMANDER_DAMAGE_LETHAL,
  DEFAULT_WIKI_SEARCH_TEMPLATE,
  joinUrlFor,
} from "./constants";
import type {
  CommanderDamageCell,
  EliminationReason,
  EventType,
  EventView,
  GuestSnapshot,
  HostSnapshot,
  PlayerView,
  SessionSnapshot,
  SessionStatus,
} from "../types/damnation";

// Sessions untouched for this long are treated as finished on their next lookup.
export const IDLE_EXPIRY_HOURS = 12;
const RECENT_EVENT_LIMIT = 30;

// SQL Server returns GUIDs upper-cased; ids are lower-cased once here so client-side
// comparisons (e.g. "which card is me") never depend on casing.
export function normalizeId(value: string | null | undefined): string | null {
  return value ? value.toLowerCase() : null;
}

interface SessionRow {
  id: string;
  host_user_id: string;
  status: SessionStatus;
  join_code: string | null;
  starting_life: number;
  max_players: number;
  version: number;
  ts_created: Date;
  board_layout: string | null;
  wiki_search_template: string | null;
  wiki_embed: boolean | null;
  commander_damage_enabled: boolean | null;
}

interface PlayerRow {
  id: string;
  position: number;
  display_name: string;
  color_key: string;
  life_total: number;
  conceded: boolean;
  eliminated_override: boolean | null;
  is_manual: boolean;
  rejoinable: number;
}

interface EventRow {
  id: string;
  op_id: string;
  session_version: number;
  event_type: EventType;
  actor_player_id: string | null;
  target_player_id: string | null;
  payload: string | null;
  undone: number;
  ts_created: Date;
}

function parsePayload(payload: string | null): Record<string, unknown> | null {
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function eliminationFor(player: PlayerRow, cells: CommanderDamageCell[]): EliminationReason {
  if (player.eliminated_override === true) return "host";
  if (player.eliminated_override === false) return null;
  if (player.conceded) return "conceded";
  if (player.life_total <= 0) return "life";
  const playerId = normalizeId(player.id);
  if (cells.some((cell) => cell.target_player_id === playerId && cell.damage >= COMMANDER_DAMAGE_LETHAL)) {
    return "commander_damage";
  }
  return null;
}

// Reads the full state of one session in a single round trip. Accepts the pool or an open
// transaction so a mutation can read what it just wrote before committing.
export async function readSnapshot(
  executor: sql.ConnectionPool | sql.Transaction,
  sessionId: string
): Promise<HostSnapshot | null> {
  const request = executor instanceof sql.Transaction ? new sql.Request(executor) : executor.request();
  const result = await request
    .input("sessionId", sql.UniqueIdentifier, sessionId)
    .input("eventLimit", sql.Int, RECENT_EVENT_LIMIT)
    .query(`
      SELECT s.id, s.host_user_id, s.status, s.join_code, s.starting_life, s.max_seats AS max_players, s.version, s.ts_created, s.board_layout,
             ds.wiki_search_template, ds.wiki_embed, ds.commander_damage_enabled
      FROM damnation_sessions s
      LEFT JOIN damnation_settings ds ON ds.user_id = s.host_user_id
      WHERE s.id = @sessionId;

      SELECT id, seat AS position, display_name, color_key, life_total, conceded, eliminated_override,
             is_manual, CASE WHEN token_hash IS NULL AND is_manual = 0 THEN 1 ELSE 0 END AS rejoinable
      FROM damnation_players
      WHERE session_id = @sessionId AND kicked = 0
      ORDER BY seat;

      SELECT id, display_name FROM damnation_players WHERE session_id = @sessionId AND kicked = 1;

      SELECT source_player_id, target_player_id, damage
      FROM damnation_commander_damage
      WHERE session_id = @sessionId AND damage > 0;

      SELECT TOP (@eventLimit) e.id, e.op_id, e.session_version, e.event_type, e.actor_player_id, e.target_player_id,
             e.payload, e.ts_created,
             CASE WHEN EXISTS (SELECT 1 FROM damnation_events u WHERE u.undoes_event_id = e.id) THEN 1 ELSE 0 END AS undone
      FROM damnation_events e
      WHERE e.session_id = @sessionId
      ORDER BY e.session_version DESC;
    `);

  const recordsets = result.recordsets as unknown as [
    SessionRow[],
    PlayerRow[],
    { id: string; display_name: string }[],
    CommanderDamageCell[],
    EventRow[],
  ];
  const session = recordsets[0][0];
  if (!session) return null;

  const cells: CommanderDamageCell[] = recordsets[3].map((cell) => ({
    source_player_id: normalizeId(cell.source_player_id)!,
    target_player_id: normalizeId(cell.target_player_id)!,
    damage: cell.damage,
  }));

  const players: PlayerView[] = recordsets[1].map((player) => {
    const reason = eliminationFor(player, cells);
    return {
      id: normalizeId(player.id)!,
      position: player.position,
      display_name: player.display_name,
      color_key: player.color_key,
      life_total: player.life_total,
      conceded: player.conceded,
      eliminated_override: player.eliminated_override,
      eliminated: reason !== null,
      elimination_reason: reason,
      rejoinable: player.rejoinable === 1,
      manual: player.is_manual,
    };
  });

  const events: EventView[] = recordsets[4].map((event) => ({
    id: normalizeId(event.id)!,
    op_id: normalizeId(event.op_id)!,
    version: event.session_version,
    event_type: event.event_type,
    actor_player_id: normalizeId(event.actor_player_id),
    target_player_id: normalizeId(event.target_player_id),
    payload: parsePayload(event.payload),
    undone: event.undone === 1,
    ts_created: event.ts_created.toISOString(),
  }));

  return {
    id: normalizeId(session.id)!,
    version: session.version,
    status: session.status,
    join_code: session.join_code,
    join_url: session.join_code ? joinUrlFor(session.join_code) : null,
    board_layout: session.board_layout,
    starting_life: session.starting_life,
    max_players: session.max_players,
    wiki_search_template: session.wiki_search_template ?? DEFAULT_WIKI_SEARCH_TEMPLATE,
    wiki_embed: session.wiki_embed ?? true,
    commander_damage_enabled: session.commander_damage_enabled ?? true,
    ts_created: session.ts_created.toISOString(),
    players,
    former_players: recordsets[2].map((player) => ({ id: normalizeId(player.id)!, display_name: player.display_name })),
    commander_damage: cells,
    events,
  };
}

export async function readSnapshotFromPool(sessionId: string): Promise<HostSnapshot | null> {
  return readSnapshot(await getMainConnection(), sessionId);
}

// Guests never see the session id, the host-only share URL, the board layout, or anything about the host.
export function toGuestSnapshot(snapshot: SessionSnapshot, playerId: string): GuestSnapshot {
  const { id: _id, join_url: _joinUrl, ts_created: _created, board_layout: _layout, ...rest } = snapshot as HostSnapshot;
  return { ...rest, me: playerId };
}
