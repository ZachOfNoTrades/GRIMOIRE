import { randomInt } from "crypto";
import sql from "mssql";
import { getMainConnection } from "@/lib/db";
import {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
} from "./constants";
import { DamnationError, isUniqueViolation } from "./errors";
import { findLayout, parseLayoutPreferences, resolveLayout } from "./boardLayouts";
import { readPlayerTokenHash } from "./playerTokens";
import { broadcastSnapshot, closeSession } from "./sessionBus";
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

// A host has at most one open game. The per-host application lock makes the check and the insert
// atomic, so two quick clicks can't both create one.
export async function createSession(hostUserId: string, startingLife: number, maxPlayers: number): Promise<HostSnapshot> {
  await expireIdleSessions();
  const pool = await getMainConnection();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const transaction = pool.transaction();
    await transaction.begin();
    try {
      await new sql.Request(transaction)
        .input("resource", sql.NVarChar(80), `damnation-host-${normalizeId(hostUserId)}`)
        .query(`EXEC sp_getapplock @Resource = @resource, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 5000`);
      await requireNoOpenGame(transaction, hostUserId);
      const inserted = await new sql.Request(transaction)
        .input("hostUserId", sql.UniqueIdentifier, hostUserId)
        .input("joinCode", sql.VarChar(8), generateJoinCode())
        .input("startingLife", sql.Int, startingLife)
        .input("maxPlayers", sql.Int, maxPlayers)
        .input("layout", sql.VarChar(20), await preferredLayout(transaction, hostUserId, maxPlayers))
        .query<{ id: string }>(`
          INSERT INTO damnation_sessions (host_user_id, join_code, starting_life, max_seats, board_layout, commander_damage_enabled)
          OUTPUT INSERTED.id
          SELECT @hostUserId, @joinCode, @startingLife, @maxPlayers, @layout,
                 COALESCE((SELECT commander_damage_enabled FROM damnation_settings WHERE user_id = @hostUserId), 1)
        `);
      await transaction.commit();
      const snapshot = await readSnapshot(pool, inserted.recordset[0].id);
      if (!snapshot) throw new Error("Failed to read the new Damnation session");
      return snapshot;
    } catch (error) {
      await transaction.rollback().catch(() => {});
      // A live session already holds this code; draw another.
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw new DamnationError(503, "Couldn't generate a join code — try again");
}

// Deletes a game and everything recorded for it, then closes its live streams. Ownership is
// checked by the route (withHost).
export async function deleteSession(sessionId: string): Promise<void> {
  const pool = await getMainConnection();
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    await new sql.Request(transaction).input("sessionId", sql.UniqueIdentifier, sessionId).query(`
      DELETE FROM damnation_events WHERE session_id = @sessionId;
      DELETE FROM damnation_commander_damage WHERE session_id = @sessionId;
      DELETE FROM damnation_players WHERE session_id = @sessionId;
      DELETE FROM damnation_sessions WHERE id = @sessionId;
    `);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
  closeSession(sessionId);
}

// Refuses when the host already has a game that isn't finished (other than `exceptSessionId`).
export async function requireNoOpenGame(
  transaction: sql.Transaction,
  hostUserId: string,
  exceptSessionId?: string
): Promise<void> {
  const open = await new sql.Request(transaction)
    .input("hostUserId", sql.UniqueIdentifier, hostUserId)
    .input("exceptId", sql.UniqueIdentifier, exceptSessionId ?? null)
    .query(`
      SELECT TOP 1 id FROM damnation_sessions WITH (UPDLOCK, HOLDLOCK)
      WHERE host_user_id = @hostUserId AND status <> 'finished' AND (@exceptId IS NULL OR id <> @exceptId)
    `);
  if (open.recordset.length > 0) throw new DamnationError(409, "You already have a game open — end it first");
}

export async function listSessions(hostUserId: string): Promise<SessionSummary[]> {
  await expireIdleSessions();
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("hostUserId", sql.UniqueIdentifier, hostUserId)
    .query<SessionSummary & { ts_created: Date; ts_finished: Date | null }>(`
      SELECT TOP 50 s.id, s.status, s.join_code, s.starting_life, s.max_seats AS max_players, s.ts_created, s.ts_finished,
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
      SELECT status, starting_life, max_seats AS max_players FROM damnation_sessions WHERE id = @sessionId;
      SELECT id, display_name, color_key, CASE WHEN token_hash IS NULL AND is_manual = 0 THEN 1 ELSE 0 END AS rejoinable
      FROM damnation_players WHERE session_id = @sessionId AND kicked = 0 ORDER BY seat;
    `);
  const recordsets = result.recordsets as unknown as [
    { status: SessionStatus; starting_life: number; max_players: number }[],
    { id: string; display_name: string; color_key: string; rejoinable: number }[],
  ];
  const session = recordsets[0][0];
  if (!session) throw new DamnationError(404, "No game with that code");
  const players = recordsets[1];
  const snapshot = await readSnapshot(pool, sessionId);
  if (!snapshot) throw new DamnationError(404, "No game with that code");
  const { version: _version, events: _events, former_players: _former, id: _id, join_url: _url, ts_created: _created, layout_preferences: _preferences, ...table } = snapshot;

  return {
    joinable: session.status === "lobby" && players.length < session.max_players,
    status: session.status,
    starting_life: session.starting_life,
    max_players: session.max_players,
    player_count: players.length,
    taken_colors: players.map((player) => player.color_key),
    rejoinable_players: players
      .filter((player) => player.rejoinable === 1)
      .map((player) => ({
        player_id: normalizeId(player.id)!,
        display_name: player.display_name,
        color_key: player.color_key,
      })),
    table,
  };
}

// Resolves the X-Damnation-Token header to the player and session it belongs to. The code in
// the URL is not consulted: resuming a game gives it a new code, and players already in the game must keep
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
  if (!player) throw new DamnationError(401, "You're no longer in this game — join again or ask the host");

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
    .query<{ commander_damage_enabled: boolean }>(`
      SELECT commander_damage_enabled FROM damnation_settings WHERE user_id = @userId
    `);
  return { commander_damage_enabled: result.recordset[0]?.commander_damage_enabled ?? true };
}

// Saves the fields present in `change`, keeping the rest. These are defaults for the host's new
// games; a running game keeps its own values.
export async function saveSettings(userId: string, change: { commander_damage_enabled?: boolean }): Promise<DamnationSettings> {
  const pool = await getMainConnection();
  const current = await getSettings(userId);
  await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .input("commanderDamage", sql.Bit, change.commander_damage_enabled ?? current.commander_damage_enabled)
    .query(`
      MERGE damnation_settings AS target
      USING (SELECT @userId AS user_id) AS source ON target.user_id = source.user_id
      WHEN MATCHED THEN
        UPDATE SET commander_damage_enabled = @commanderDamage, ts_updated = GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (user_id, commander_damage_enabled) VALUES (@userId, @commanderDamage);
    `);
  return getSettings(userId);
}

// ---------------------------------------------------------------------------------------------
// BOARD LAYOUT
// ---------------------------------------------------------------------------------------------

// Saves the board arrangement and pushes it to every open board for the game. Not a game event:
// it changes how the table is drawn, not the game, so it is not undoable and not in the feed.
export async function saveBoardLayout(sessionId: string, layoutKey: string, hostUserId: string): Promise<HostSnapshot> {
  const pool = await getMainConnection();
  const current = await readSnapshot(pool, sessionId);
  if (!current) throw new DamnationError(404, "Game not found");
  if (!findLayout(layoutKey, current.max_players)) {
    throw new DamnationError(400, `That layout doesn't fit a ${current.max_players}-player game`);
  }
  await pool
    .request()
    .input("sessionId", sql.UniqueIdentifier, sessionId)
    .input("layout", sql.VarChar(20), layoutKey)
    .query(`UPDATE damnation_sessions SET board_layout = @layout, version = version + 1 WHERE id = @sessionId`);
  await rememberLayout(pool, hostUserId, current.max_players, layoutKey);
  const snapshot = await readSnapshot(pool, sessionId);
  if (!snapshot) throw new DamnationError(404, "Game not found");
  broadcastSnapshot(sessionId, snapshot);
  return snapshot;
}

// Switches commander damage for one game and pushes it to the board and phones. Like the layout,
// not a game event: it changes what the cards offer, not anyone's totals.
export async function saveCommanderDamage(sessionId: string, enabled: boolean): Promise<HostSnapshot> {
  const pool = await getMainConnection();
  await pool
    .request()
    .input("sessionId", sql.UniqueIdentifier, sessionId)
    .input("enabled", sql.Bit, enabled)
    .query(`UPDATE damnation_sessions SET commander_damage_enabled = @enabled, version = version + 1 WHERE id = @sessionId`);
  const snapshot = await readSnapshot(pool, sessionId);
  if (!snapshot) throw new DamnationError(404, "Game not found");
  broadcastSnapshot(sessionId, snapshot);
  return snapshot;
}

// LAYOUT PREFERENCES — the last table layout the host picked for each player count, stored as
// JSON in damnation_settings.board_layouts and applied when a game starts at, or changes to, that
// count. Keys that no longer name a layout for the count are ignored.
type Executor = sql.ConnectionPool | sql.Transaction;
const requestFor = (executor: Executor) => (executor instanceof sql.Transaction ? new sql.Request(executor) : executor.request());

async function readLayoutPreferences(executor: Executor, hostUserId: string): Promise<Record<string, string>> {
  const result = await requestFor(executor)
    .input("userId", sql.UniqueIdentifier, hostUserId)
    .query<{ board_layouts: string | null }>(`SELECT board_layouts FROM damnation_settings WHERE user_id = @userId`);
  return parseLayoutPreferences(result.recordset[0]?.board_layouts);
}

// The host's last layout for the count, or the first layout for it.
export async function preferredLayout(executor: Executor, hostUserId: string, playerCount: number): Promise<string> {
  return resolveLayout((await readLayoutPreferences(executor, hostUserId))[String(playerCount)], playerCount).key;
}

async function rememberLayout(executor: Executor, hostUserId: string, playerCount: number, layoutKey: string): Promise<void> {
  const preferences = await readLayoutPreferences(executor, hostUserId);
  preferences[String(playerCount)] = layoutKey;
  await requestFor(executor)
    .input("userId", sql.UniqueIdentifier, hostUserId)
    .input("layouts", sql.NVarChar(400), JSON.stringify(preferences))
    .query(`
      MERGE damnation_settings AS target
      USING (SELECT @userId AS user_id) AS source ON target.user_id = source.user_id
      WHEN MATCHED THEN UPDATE SET board_layouts = @layouts, ts_updated = GETDATE()
      WHEN NOT MATCHED THEN INSERT (user_id, board_layouts) VALUES (@userId, @layouts);
    `);
}
