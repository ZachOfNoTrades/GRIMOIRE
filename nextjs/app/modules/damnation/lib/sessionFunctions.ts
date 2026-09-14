import { randomInt } from "crypto";
import sql from "mssql";
import { getMainConnection } from "@/lib/db";
import {
  DEFAULT_WIKI_SEARCH_TEMPLATE,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
} from "./constants";
import { DamnationError, isUniqueViolation } from "./errors";
import { readPlayerTokenHash } from "./playerTokens";
import { IDLE_EXPIRY_HOURS, normalizeId, readSnapshot } from "./snapshotFunctions";
import type {
  DamnationSettings,
  HostSnapshot,
  LobbyView,
  SessionStatus,
  SessionSummary,
} from "../types/damnation";

export function generateJoinCode(): string {
  let code = "";
  for (let index = 0; index < JOIN_CODE_LENGTH; index += 1) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

// Finishes sessions nobody has touched in IDLE_EXPIRY_HOURS, releasing their codes.
// Called lazily on lookups and periodically by the retention scheduler.
export async function expireIdleSessions(sessionId?: string): Promise<number> {
  const pool = await getMainConnection();
  const request = pool.request().input("hours", sql.Int, IDLE_EXPIRY_HOURS);
  // Separate predicates rather than `(@sessionId IS NULL OR id = @sessionId)`: the OR form
  // forces a scan that update-locks every session row, blocking live games' writes.
  let scope = "";
  if (sessionId) {
    request.input("sessionId", sql.UniqueIdentifier, sessionId);
    scope = "id = @sessionId AND";
  }
  const result = await request.query(`
    UPDATE damnation_sessions
    SET status = 'finished', join_code = NULL, ts_finished = GETDATE(), version = version + 1
    WHERE ${scope} status <> 'finished'
      AND ts_updated < DATEADD(HOUR, -@hours, GETDATE())
  `);
  return result.rowsAffected[0] ?? 0;
}

// Finished sessions are kept for 30 days of history, then deleted with all their rows.
export async function purgeOldSessions(): Promise<number> {
  const pool = await getMainConnection();
  const result = await pool.request().query(`
    DELETE FROM damnation_sessions
    WHERE status = 'finished' AND ts_finished < DATEADD(DAY, -30, GETDATE())
  `);
  return result.rowsAffected[0] ?? 0;
}

// ---------------------------------------------------------------------------------------------
// HOST
// ---------------------------------------------------------------------------------------------

export async function createSession(hostUserId: string, startingLife: number, maxSeats: number): Promise<HostSnapshot> {
  const pool = await getMainConnection();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const inserted = await pool
        .request()
        .input("hostUserId", sql.UniqueIdentifier, hostUserId)
        .input("joinCode", sql.VarChar(8), generateJoinCode())
        .input("startingLife", sql.Int, startingLife)
        .input("maxSeats", sql.Int, maxSeats)
        .query<{ id: string }>(`
          INSERT INTO damnation_sessions (host_user_id, join_code, starting_life, max_seats)
          OUTPUT INSERTED.id
          VALUES (@hostUserId, @joinCode, @startingLife, @maxSeats)
        `);
      const snapshot = await readSnapshot(pool, inserted.recordset[0].id);
      if (!snapshot) throw new Error("Failed to read the new Damnation session");
      return snapshot;
    } catch (error) {
      // A live session already holds this code; draw another.
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw new DamnationError(503, "Couldn't generate a join code — try again");
}

export async function listSessions(hostUserId: string): Promise<SessionSummary[]> {
  await expireIdleSessions();
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("hostUserId", sql.UniqueIdentifier, hostUserId)
    .query<SessionSummary & { ts_created: Date; ts_finished: Date | null }>(`
      SELECT TOP 50 s.id, s.status, s.join_code, s.starting_life, s.max_seats, s.ts_created, s.ts_finished,
             (SELECT COUNT(*) FROM damnation_players p WHERE p.session_id = s.id AND p.kicked = 0) AS player_count
      FROM damnation_sessions s
      WHERE s.host_user_id = @hostUserId
      ORDER BY s.ts_created DESC
    `);

  return result.recordset.map((row) => ({
    ...row,
    id: normalizeId(row.id)!,
    ts_created: new Date(row.ts_created).toISOString(),
    ts_finished: row.ts_finished ? new Date(row.ts_finished).toISOString() : null,
  }));
}

// Loads a session for its host. Anyone else gets the same 404 as a missing session, so a
// signed-in user can't probe for other people's session ids.
export async function requireHostedSession(hostUserId: string, sessionId: string): Promise<HostSnapshot> {
  await expireIdleSessions(sessionId);
  const pool = await getMainConnection();
  const owner = await pool
    .request()
    .input("sessionId", sql.UniqueIdentifier, sessionId)
    .query<{ host_user_id: string }>(`SELECT host_user_id FROM damnation_sessions WHERE id = @sessionId`);
  if (normalizeId(owner.recordset[0]?.host_user_id) !== normalizeId(hostUserId)) {
    throw new DamnationError(404, "Game not found");
  }
  const snapshot = await readSnapshot(pool, sessionId);
  if (!snapshot) throw new DamnationError(404, "Game not found");
  return snapshot;
}

// ---------------------------------------------------------------------------------------------
// GUEST
// ---------------------------------------------------------------------------------------------

export async function findSessionIdByCode(code: string): Promise<{ id: string; status: SessionStatus } | null> {
  const pool = await getMainConnection();
  const lookup = async () =>
    (
      await pool
        .request()
        .input("code", sql.VarChar(8), code)
        .query<{ id: string; status: SessionStatus }>(`SELECT id, status FROM damnation_sessions WHERE join_code = @code`)
    ).recordset[0];

  const found = await lookup();
  if (!found) return null;
  if ((await expireIdleSessions(found.id)) > 0) return null;
  return { id: normalizeId(found.id)!, status: found.status };
}

export async function getLobbyView(sessionId: string): Promise<LobbyView> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("sessionId", sql.UniqueIdentifier, sessionId)
    .query(`
      SELECT status, max_seats FROM damnation_sessions WHERE id = @sessionId;
      SELECT id, seat, display_name, color_key, CASE WHEN token_hash IS NULL THEN 1 ELSE 0 END AS open_seat
      FROM damnation_players WHERE session_id = @sessionId AND kicked = 0 ORDER BY seat;
    `);
  const recordsets = result.recordsets as unknown as [
    { status: SessionStatus; max_seats: number }[],
    { id: string; seat: number; display_name: string; color_key: string; open_seat: number }[],
  ];
  const session = recordsets[0][0];
  if (!session) throw new DamnationError(404, "No game with that code");
  const players = recordsets[1];

  return {
    joinable: session.status === "lobby" && players.length < session.max_seats,
    status: session.status,
    max_seats: session.max_seats,
    seats_taken: players.length,
    taken_colors: players.map((player) => player.color_key),
    open_seats: players
      .filter((player) => player.open_seat === 1)
      .map((player) => ({
        player_id: normalizeId(player.id)!,
        seat: player.seat,
        display_name: player.display_name,
        color_key: player.color_key,
      })),
  };
}

// Resolves the X-Damnation-Token header to the player and session it belongs to. The code in
// the URL is not consulted: a host may rotate the code mid-game, and seated players must keep
// working after that.
export async function requireGuest(request: Request): Promise<{ sessionId: string; playerId: string }> {
  const tokenHash = readPlayerTokenHash(request);
  if (!tokenHash) throw new DamnationError(401, "Join the game first");

  // Two single-table reads, deliberately not a join: under READ COMMITTED a join holds its
  // shared lock on the player row while it seeks the session row, and a concurrent mutation
  // holds the session row while it locks that same player — a deadlock. (Found by the
  // concurrent-tap test: 3 of 40 writes were chosen as deadlock victims.)
  const pool = await getMainConnection();
  const playerResult = await pool
    .request()
    .input("tokenHash", sql.VarBinary(32), tokenHash)
    .query<{ player_id: string; session_id: string }>(`
      SELECT id AS player_id, session_id FROM damnation_players WHERE token_hash = @tokenHash AND kicked = 0
    `);
  const player = playerResult.recordset[0];
  if (!player) throw new DamnationError(401, "This seat is no longer yours — rejoin or ask the host");

  const sessionResult = await pool
    .request()
    .input("sessionId", sql.UniqueIdentifier, player.session_id)
    .query<{ status: SessionStatus }>(`SELECT status FROM damnation_sessions WHERE id = @sessionId`);
  const row = { ...player, status: sessionResult.recordset[0]?.status ?? "finished" };

  const sessionId = normalizeId(row.session_id)!;
  if (row.status === "finished" || (await expireIdleSessions(sessionId)) > 0) {
    throw new DamnationError(410, "This game has ended");
  }
  return { sessionId, playerId: normalizeId(row.player_id)! };
}

// ---------------------------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------------------------

export async function getSettings(userId: string): Promise<DamnationSettings> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .query<{ wiki_search_template: string | null; wiki_embed: boolean }>(`
      SELECT wiki_search_template, wiki_embed FROM damnation_settings WHERE user_id = @userId
    `);
  const row = result.recordset[0];
  return {
    wiki_search_template: row?.wiki_search_template ?? DEFAULT_WIKI_SEARCH_TEMPLATE,
    wiki_embed: row?.wiki_embed ?? true,
    is_default_template: !row?.wiki_search_template,
  };
}

// `template` is already validated; null stores "use the built-in default". Running games
// read the host's settings live, so a change reaches phones on their next snapshot.
export async function saveSettings(userId: string, template: string | null, embed: boolean): Promise<DamnationSettings> {
  const pool = await getMainConnection();
  await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .input("template", sql.NVarChar(500), template)
    .input("embed", sql.Bit, embed)
    .query(`
      MERGE damnation_settings AS target
      USING (SELECT @userId AS user_id) AS source ON target.user_id = source.user_id
      WHEN MATCHED THEN
        UPDATE SET wiki_search_template = @template, wiki_embed = @embed, ts_updated = GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (user_id, wiki_search_template, wiki_embed) VALUES (@userId, @template, @embed);
    `);
  return getSettings(userId);
}
