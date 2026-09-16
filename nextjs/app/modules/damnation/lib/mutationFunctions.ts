import sql from "mssql";
import { getMainConnection } from "@/lib/db";
import {
  COMMANDER_DAMAGE_MAX,
  LIFE_MAX,
  LIFE_MIN,
} from "./constants";
import { preferredLayout, requireNoOpenGame } from "./sessionFunctions";
import { DamnationError, isUniqueViolation } from "./errors";
import { generatePlayerToken } from "./playerTokens";
import { broadcastSnapshot, endSession, revokePlayer } from "./sessionBus";
import { readSnapshot } from "./snapshotFunctions";
import type { EventType, HostSnapshot, SessionStatus } from "../types/damnation";

// Every write to a session goes through runMutation, one transaction that:
//   1. bumps damnation_sessions.version — the row lock this takes serializes every write to
//      the session, so concurrent taps and joins can never interleave;
//   2. refuses an op_id it has already applied, so a retried request can't double-apply;
//   3. applies the change and records the event (with the deltas actually applied);
//   4. commits, then broadcasts a snapshot stamped with the new version. Clients drop any
//      snapshot older than the newest they've seen, so out-of-order broadcasts are harmless.

export type Actor = { kind: "host" } | { kind: "player"; playerId: string };

export interface EventDraft {
  eventType: EventType;
  targetPlayerId?: string | null;
  // Set when the actor is a player who doesn't exist yet at call time (join).
  actorPlayerId?: string | null;
  payload?: Record<string, unknown> | null;
  undoesEventId?: string | null;
}

export interface MutationResult {
  snapshot: HostSnapshot;
  duplicate: boolean;
  changed: boolean;
}

type Apply = (transaction: sql.Transaction, context: { sessionId: string; status: SessionStatus; joinsOpen: boolean; version: number }) =>
  Promise<EventDraft | null>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function request(transaction: sql.Transaction): sql.Request {
  return new sql.Request(transaction);
}

// Translates a unique-index violation from inside a mutation into something a player can act on.
function conflictFor(error: unknown): DamnationError | null {
  if (!isUniqueViolation(error)) return null;
  const message = String((error as Error).message ?? "");
  if (message.includes("UX_damnation_players_name")) return new DamnationError(409, "Someone at the table already has that name");
  if (message.includes("UX_damnation_players_seat")) return new DamnationError(409, "Someone joined at the same moment — try again");
  if (message.includes("UX_damnation_events_undoes")) return new DamnationError(409, "That change was already undone");
  return null;
}

// SQL Server resolves a lock cycle by killing one transaction (error 1205) and expecting the
// client to rerun it. Every mutation is a self-contained transaction keyed by op_id, so rerunning
// it is safe; a few quick retries with jitter make a victim invisible to the player.
const DEADLOCK_RETRIES = 4;

function isDeadlock(error: unknown): boolean {
  return (error as { number?: number; originalError?: { info?: { number?: number } } } | null)?.number === 1205 ||
    (error as { originalError?: { info?: { number?: number } } } | null)?.originalError?.info?.number === 1205;
}

export async function runMutation(options: Parameters<typeof runMutationOnce>[0]): Promise<MutationResult> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await runMutationOnce(options);
    } catch (error) {
      if (!isDeadlock(error) || attempt >= DEADLOCK_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * attempt + Math.random() * 40));
    }
  }
}

async function runMutationOnce(options: {
  sessionId: string;
  opId: string;
  actor: Actor;
  apply: Apply;
  // Adding, editing, moving or removing someone else: a player may only do it while the host lets
  // guests manage players (damnation_sessions.guests_manage_players).
  playerManagement?: boolean;
}): Promise<MutationResult> {
  const { sessionId, opId, actor, apply } = options;
  const pool = await getMainConnection();
  const transaction = pool.transaction();
  await transaction.begin();
  let settled = false;

  const rollback = async () => {
    if (settled) return;
    settled = true;
    try {
      await transaction.rollback();
    } catch {
      /* the transaction may already be aborted */
    }
  };

  try {
    // LOCK + VERSION
    const bump = await request(transaction)
      .input("sessionId", sql.UniqueIdentifier, sessionId)
      .query<{ version: number; status: SessionStatus; joins_open: boolean; guests_manage_players: boolean }>(`
        UPDATE damnation_sessions
        SET version = version + 1, ts_updated = GETDATE()
        OUTPUT INSERTED.version, INSERTED.status, INSERTED.joins_open, INSERTED.guests_manage_players
        WHERE id = @sessionId AND status <> 'finished'
      `);
    if (bump.recordset.length === 0) {
      await rollback();
      throw new DamnationError(410, "This game has ended");
    }
    const { version, status, joins_open: joinsOpen, guests_manage_players: guestsManagePlayers } = bump.recordset[0];
    if (options.playerManagement && actor.kind === "player" && !guestsManagePlayers) {
      await rollback();
      throw new DamnationError(403, "The host hasn't let players manage the table");
    }

    // IDEMPOTENCY
    const seen = await request(transaction)
      .input("opId", sql.UniqueIdentifier, opId)
      .query(`SELECT 1 AS seen FROM damnation_events WHERE op_id = @opId`);
    if (seen.recordset.length > 0) {
      await rollback();
      return { snapshot: await currentSnapshot(sessionId), duplicate: true, changed: false };
    }

    // APPLY
    const draft = await apply(transaction, { sessionId, status, joinsOpen, version });
    if (!draft) {
      // Nothing changed (e.g. a clamp absorbed the delta) — don't spend a version on it.
      await rollback();
      return { snapshot: await currentSnapshot(sessionId), duplicate: false, changed: false };
    }

    const actorPlayerId = draft.actorPlayerId ?? (actor.kind === "player" ? actor.playerId : null);
    await request(transaction)
      .input("sessionId", sql.UniqueIdentifier, sessionId)
      .input("opId", sql.UniqueIdentifier, opId)
      .input("version", sql.Int, version)
      .input("eventType", sql.VarChar(24), draft.eventType)
      .input("actorPlayerId", sql.UniqueIdentifier, actorPlayerId)
      .input("targetPlayerId", sql.UniqueIdentifier, draft.targetPlayerId ?? null)
      .input("payload", sql.NVarChar(1000), draft.payload ? JSON.stringify(draft.payload) : null)
      .input("undoesEventId", sql.UniqueIdentifier, draft.undoesEventId ?? null)
      .query(`
        INSERT INTO damnation_events
          (session_id, op_id, session_version, event_type, actor_player_id, target_player_id, payload, undoes_event_id)
        VALUES (@sessionId, @opId, @version, @eventType, @actorPlayerId, @targetPlayerId, @payload, @undoesEventId)
      `);

    await transaction.commit();
    settled = true;

    // Read after commit, not inside the transaction: every write to this session waits on the
    // row lock, so the four-statement snapshot read would otherwise stretch each lock hold.
    // The snapshot is at least as new as this write, which is all the version check needs.
    const snapshot = await currentSnapshot(sessionId);
    if (snapshot.status === "finished") endSession(sessionId, snapshot);
    else broadcastSnapshot(sessionId, snapshot);
    return { snapshot, duplicate: false, changed: true };
  } catch (error) {
    await rollback();
    if (error instanceof DamnationError) throw error;
    // Two requests carrying the same op_id raced past the SELECT (only possible across sessions).
    if (isUniqueViolation(error) && String((error as Error).message).includes("UK_damnation_events_op")) {
      return { snapshot: await currentSnapshot(sessionId), duplicate: true, changed: false };
    }
    const conflict = conflictFor(error);
    if (conflict) throw conflict;
    throw error;
  }
}

async function currentSnapshot(sessionId: string): Promise<HostSnapshot> {
  const snapshot = await readSnapshot(await getMainConnection(), sessionId);
  if (!snapshot) throw new DamnationError(404, "Game not found");
  return snapshot;
}

// ---------------------------------------------------------------------------------------------
// GAME CHANGES — callable by any player in the game or by the host
// ---------------------------------------------------------------------------------------------

async function lockPlayer(transaction: sql.Transaction, sessionId: string, playerId: string) {
  const result = await request(transaction)
    .input("sessionId", sql.UniqueIdentifier, sessionId)
    .input("playerId", sql.UniqueIdentifier, playerId)
    .query<{ life_total: number; conceded: boolean; eliminated_override: boolean | null; token_hash: Buffer | null; is_manual: boolean }>(`
      SELECT life_total, conceded, eliminated_override, token_hash, is_manual
      FROM damnation_players WITH (UPDLOCK)
      WHERE id = @playerId AND session_id = @sessionId AND kicked = 0
    `);
  // The session_id predicate is the authorization check: a token for one game can never
  // reach a player in another, whatever id the client sends.
  if (result.recordset.length === 0) throw new DamnationError(404, "Player not found");
  return result.recordset[0];
}

async function setLife(transaction: sql.Transaction, playerId: string, life: number) {
  await request(transaction)
    .input("playerId", sql.UniqueIdentifier, playerId)
    .input("life", sql.Int, life)
    .query(`UPDATE damnation_players SET life_total = @life, ts_updated = GETDATE() WHERE id = @playerId`);
}

export function changeLife(sessionId: string, opId: string, actor: Actor, targetPlayerId: string, delta: number) {
  return runMutation({
    sessionId,
    opId,
    actor,
    apply: async (transaction) => {
      const target = await lockPlayer(transaction, sessionId, targetPlayerId);
      const life = clamp(target.life_total + delta, LIFE_MIN, LIFE_MAX);
      const applied = life - target.life_total;
      if (applied === 0) return null;
      await setLife(transaction, targetPlayerId, life);
      return { eventType: "life", targetPlayerId, payload: { delta: applied } };
    },
  });
}

async function adjustCommanderCell(
  transaction: sql.Transaction,
  sessionId: string,
  sourcePlayerId: string,
  targetPlayerId: string,
  delta: number
): Promise<number> {
  const cell = await request(transaction)
    .input("source", sql.UniqueIdentifier, sourcePlayerId)
    .input("target", sql.UniqueIdentifier, targetPlayerId)
    .query<{ damage: number }>(`
      SELECT damage FROM damnation_commander_damage WITH (UPDLOCK)
      WHERE source_player_id = @source AND target_player_id = @target
    `);
  const previous = cell.recordset[0]?.damage ?? 0;
  const next = clamp(previous + delta, 0, COMMANDER_DAMAGE_MAX);
  if (next === previous) return 0;

  const write = request(transaction)
    .input("sessionId", sql.UniqueIdentifier, sessionId)
    .input("source", sql.UniqueIdentifier, sourcePlayerId)
    .input("target", sql.UniqueIdentifier, targetPlayerId)
    .input("damage", sql.Int, next);
  if (cell.recordset.length > 0) {
    await write.query(`
      UPDATE damnation_commander_damage SET damage = @damage, ts_updated = GETDATE()
      WHERE source_player_id = @source AND target_player_id = @target
    `);
  } else {
    await write.query(`
      INSERT INTO damnation_commander_damage (session_id, source_player_id, target_player_id, damage)
      VALUES (@sessionId, @source, @target, @damage)
    `);
  }
  return next - previous;
}

// Commander damage is also life loss, so the grid cell and the target's life move together
// in the same transaction.
export function changeCommanderDamage(
  sessionId: string,
  opId: string,
  actor: Actor,
  targetPlayerId: string,
  sourcePlayerId: string,
  delta: number
) {
  return runMutation({
    sessionId,
    opId,
    actor,
    apply: async (transaction) => {
      if (sourcePlayerId === targetPlayerId) {
        throw new DamnationError(400, "A commander can't damage its own player");
      }
      const target = await lockPlayer(transaction, sessionId, targetPlayerId);
      await lockPlayer(transaction, sessionId, sourcePlayerId);

      const cellDelta = await adjustCommanderCell(transaction, sessionId, sourcePlayerId, targetPlayerId, delta);
      if (cellDelta === 0) return null;

      const life = clamp(target.life_total - cellDelta, LIFE_MIN, LIFE_MAX);
      const lifeDelta = life - target.life_total;
      if (lifeDelta !== 0) await setLife(transaction, targetPlayerId, life);

      return {
        eventType: "commander_damage",
        targetPlayerId,
        payload: { source_player_id: sourcePlayerId, cell_delta: cellDelta, life_delta: lifeDelta },
      };
    },
  });
}

export function changeStatus(
  sessionId: string,
  opId: string,
  actor: Actor,
  targetPlayerId: string,
  change: { conceded?: boolean; eliminated_override?: boolean | null }
) {
  return runMutation({
    sessionId,
    opId,
    actor,
    apply: async (transaction) => {
      const target = await lockPlayer(transaction, sessionId, targetPlayerId);
      const from = { conceded: target.conceded, eliminated_override: target.eliminated_override };
      const to = {
        conceded: change.conceded ?? from.conceded,
        eliminated_override: change.eliminated_override === undefined ? from.eliminated_override : change.eliminated_override,
      };
      if (to.conceded === from.conceded && to.eliminated_override === from.eliminated_override) return null;

      await request(transaction)
        .input("playerId", sql.UniqueIdentifier, targetPlayerId)
        .input("conceded", sql.Bit, to.conceded)
        .input("override", sql.Bit, to.eliminated_override)
        .query(`
          UPDATE damnation_players SET conceded = @conceded, eliminated_override = @override, ts_updated = GETDATE()
          WHERE id = @playerId
        `);
      return { eventType: "status", targetPlayerId, payload: { from, to } };
    },
  });
}

// ---------------------------------------------------------------------------------------------
// PLAYERS
// ---------------------------------------------------------------------------------------------

// Adds a player at the next free position. Colors may be shared; names may not. Shared by guest joins (with a token) and
// players the host adds from the board (no token, is_manual = 1). Runs inside runMutation,
// so the session row lock already serializes it against every other change to the roster.
async function addPlayerToGame(
  transaction: sql.Transaction,
  sessionId: string,
  displayName: string,
  colorKey: string,
  tokenHash: Buffer | null,
  preferredPosition?: number,
  playerId?: string
): Promise<string> {
  const roster = await request(transaction)
    .input("sessionId", sql.UniqueIdentifier, sessionId)
    .query<{ seat: number; display_name: string; max_seats: number; starting_life: number }>(`
      SELECT p.seat, p.display_name, s.max_seats, s.starting_life
      FROM damnation_sessions s
      LEFT JOIN damnation_players p ON p.session_id = s.id AND p.kicked = 0
      WHERE s.id = @sessionId
    `);
  const { max_seats: maxPlayers, starting_life: startingLife } = roster.recordset[0];
  const taken = roster.recordset.filter((row) => row.seat !== null);

  if (taken.length >= maxPlayers) throw new DamnationError(409, "The table is full");
  if (taken.some((row) => row.display_name.toLowerCase() === displayName.toLowerCase())) {
    throw new DamnationError(409, "Someone at the table already has that name");
  }

  // `seat` is the player's spot on the board: the one asked for if it's free, otherwise the lowest
  // spot not already in use.
  const usedPositions = new Set(taken.map((row) => row.seat));
  let position = 1;
  while (usedPositions.has(position)) position += 1;
  if (preferredPosition !== undefined && preferredPosition <= maxPlayers && !usedPositions.has(preferredPosition)) {
    position = preferredPosition;
  }

  const inserted = await request(transaction)
    .input("sessionId", sql.UniqueIdentifier, sessionId)
    .input("seat", sql.Int, position)
    .input("displayName", sql.NVarChar(24), displayName)
    .input("colorKey", sql.VarChar(20), colorKey)
    .input("tokenHash", sql.VarBinary(32), tokenHash)
    .input("isManual", sql.Bit, tokenHash === null)
    .input("life", sql.Int, startingLife)
    .input("playerId", sql.UniqueIdentifier, playerId ?? null)
    .query<{ id: string }>(`
      INSERT INTO damnation_players (id, session_id, seat, display_name, color_key, token_hash, is_manual, life_total)
      OUTPUT INSERTED.id
      VALUES (COALESCE(@playerId, NEWID()), @sessionId, @seat, @displayName, @colorKey, @tokenHash, @isManual, @life)
    `);
  return inserted.recordset[0].id.toLowerCase();
}

export async function joinSession(
  sessionId: string,
  opId: string,
  displayName: string,
  colorKey: string
): Promise<{ token: string; playerId: string; result: MutationResult }> {
  const token = generatePlayerToken();
  let playerId = "";

  const result = await runMutation({
    sessionId,
    opId,
    actor: { kind: "host" },
    apply: async (transaction, context) => {
      // Open before the game starts, and during it once the host allows joining.
      if (context.status !== "lobby" && !context.joinsOpen) {
        throw new DamnationError(409, "Joining is closed — ask the host to reopen joins");
      }
      playerId = await addPlayerToGame(transaction, sessionId, displayName, colorKey, token.hash);
      return { eventType: "join", actorPlayerId: playerId, targetPlayerId: playerId };
    },
  });

  // A replayed join can't hand the token back (only its hash is stored); the first response
  // was lost, so the duplicate player is for the host to remove.
  if (result.duplicate) throw new DamnationError(409, "That join was already processed — ask the host to remove the duplicate player");
  return { token: token.plaintext, playerId, result };
}

// A player the host adds from the board, for someone playing without a phone. Allowed whether
// or not joining is open. The card is edited from the board or from any player's phone.
export function addManualPlayer(
  sessionId: string,
  opId: string,
  displayName: string,
  colorKey: string,
  position?: number,
  playerId?: string,
  actor: Actor = { kind: "host" }
) {
  return runMutation({
    sessionId,
    opId,
    actor,
    playerManagement: true,
    apply: async (transaction) => {
      const addedId = await addPlayerToGame(transaction, sessionId, displayName, colorKey, null, position, playerId);
      return { eventType: "join", targetPlayerId: addedId, payload: { manual: true } };
    },
  });
}

// Starts the game over with the same table: every player back to the starting life, commander
// damage cleared and nobody out. Players, their spots, the settings and whether joining is open stay.
export function resetGame(sessionId: string, opId: string) {
  return runMutation({
    sessionId,
    opId,
    actor: { kind: "host" },
    apply: async (transaction) => {
      await request(transaction)
        .input("sessionId", sql.UniqueIdentifier, sessionId)
        .query(`
          UPDATE p SET life_total = s.starting_life, conceded = 0, eliminated_override = NULL, ts_updated = GETDATE()
          FROM damnation_players p JOIN damnation_sessions s ON s.id = p.session_id
          WHERE p.session_id = @sessionId AND p.kicked = 0;
          DELETE FROM damnation_commander_damage WHERE session_id = @sessionId;
        `);
      return { eventType: "reset" };
    },
  });
}

// Opens or closes joining. Before the game, closing joining starts it. During the game joining
// opens and closes without leaving the game (joins_open), so a late arrival or a lost phone can
// join while the totals keep counting.
export function setJoinsOpen(sessionId: string, opId: string, open: boolean) {
  return runMutation({
    sessionId,
    opId,
    actor: { kind: "host" },
    apply: async (transaction, context) => {
      if (context.status === "lobby") {
        if (open) return null;
        await request(transaction)
          .input("sessionId", sql.UniqueIdentifier, sessionId)
          .query(`UPDATE damnation_sessions SET status = 'active', joins_open = 0 WHERE id = @sessionId`);
        return { eventType: "start" };
      }
      if (context.joinsOpen === open) return null;
      await request(transaction)
        .input("sessionId", sql.UniqueIdentifier, sessionId)
        .input("open", sql.Bit, open)
        .query(`UPDATE damnation_sessions SET joins_open = @open WHERE id = @sessionId`);
      // Closing joining mid-game doesn't start anything; the feed tells the two apart by the payload.
      return open ? { eventType: "reopen" } : { eventType: "start", payload: { during_game: true } };
    },
  });
}

// Takes a player out of the game: the host removing them, or the player leaving from their phone.
// Their card, life and commander damage go with them and their phone is signed out.
export function removePlayer(sessionId: string, opId: string, playerId: string, actor: Actor) {
  return runMutation({
    sessionId,
    opId,
    actor,
    // Leaving the game (a player removing themselves) is always allowed.
    playerManagement: actor.kind === "player" && actor.playerId !== playerId,
    apply: async (transaction) => {
      await lockPlayer(transaction, sessionId, playerId);
      await request(transaction)
        .input("playerId", sql.UniqueIdentifier, playerId)
        .query(`UPDATE damnation_players SET kicked = 1, token_hash = NULL, ts_updated = GETDATE() WHERE id = @playerId`);
      return { eventType: "kick", targetPlayerId: playerId };
    },
  }).then((result) => {
    // Cut the removed phone's live stream now rather than at its next request.
    if (result.changed) revokePlayer(sessionId, playerId, "kicked");
    return result;
  });
}

// Swaps two players' seats, or moves a player into an open seat. A seat is the player's spot on the
// board. A swap changes both seat values in one statement so the per-game seat index never sees a
// duplicate mid-update.
export function movePlayer(
  sessionId: string,
  opId: string,
  playerId: string,
  target: { withPlayerId: string } | { toPosition: number },
  actor: Actor = { kind: "host" }
) {
  return runMutation({
    sessionId,
    opId,
    actor,
    playerManagement: true,
    apply: async (transaction) => {
      await lockPlayer(transaction, sessionId, playerId);
      const order = await request(transaction)
        .input("sessionId", sql.UniqueIdentifier, sessionId)
        .query<{ id: string; seat: number; max_seats: number }>(`
          SELECT p.id, p.seat, s.max_seats
          FROM damnation_players p WITH (UPDLOCK)
          JOIN damnation_sessions s ON s.id = p.session_id
          WHERE p.session_id = @sessionId AND p.kicked = 0
          ORDER BY p.seat
        `);
      const rows = order.recordset.map((row) => ({ id: row.id.toLowerCase(), seat: row.seat }));
      const mover = rows.find((row) => row.id === playerId);
      if (!mover) return null;

      if ("toPosition" in target) {
        const maxSeats = order.recordset[0].max_seats;
        if (target.toPosition > maxSeats) throw new DamnationError(400, "That spot isn't on the board");
        if (target.toPosition === mover.seat) return null;
        if (rows.some((row) => row.seat === target.toPosition)) throw new DamnationError(409, "Someone is already in that spot");
        await request(transaction)
          .input("playerId", sql.UniqueIdentifier, playerId)
          .input("seat", sql.Int, target.toPosition)
          .query(`UPDATE damnation_players SET seat = @seat, ts_updated = GETDATE() WHERE id = @playerId`);
        return { eventType: "reorder", targetPlayerId: playerId, payload: { to_position: target.toPosition } };
      }

      if (target.withPlayerId === playerId) return null;
      const neighbor = rows.find((row) => row.id === target.withPlayerId);
      if (!neighbor) throw new DamnationError(404, "Player not found");

      await request(transaction)
        .input("playerId", sql.UniqueIdentifier, playerId)
        .input("neighborId", sql.UniqueIdentifier, neighbor.id)
        .input("playerSeat", sql.Int, mover.seat)
        .input("neighborSeat", sql.Int, neighbor.seat)
        .query(`
          UPDATE damnation_players
          SET seat = CASE WHEN id = @playerId THEN @neighborSeat ELSE @playerSeat END, ts_updated = GETDATE()
          WHERE id IN (@playerId, @neighborId)
        `);
      return { eventType: "reorder", targetPlayerId: playerId, payload: { with_player_id: target.withPlayerId } };
    },
  });
}

// Renames a player and/or changes their color, from the board. Names stay unique at the table
// (checked here, and by UX_damnation_players_name under the session lock).
export function editPlayer(
  sessionId: string,
  opId: string,
  playerId: string,
  change: { display_name?: string; color_key?: string },
  actor: Actor = { kind: "host" }
) {
  return runMutation({
    sessionId,
    opId,
    actor,
    playerManagement: true,
    apply: async (transaction) => {
      await lockPlayer(transaction, sessionId, playerId);
      const current = await request(transaction)
        .input("playerId", sql.UniqueIdentifier, playerId)
        .query<{ display_name: string; color_key: string }>(`SELECT display_name, color_key FROM damnation_players WHERE id = @playerId`);
      const from = current.recordset[0];
      const payload: Record<string, string> = {};

      if (change.display_name !== undefined && change.display_name !== from.display_name) {
        const clash = await request(transaction)
          .input("sessionId", sql.UniqueIdentifier, sessionId)
          .input("playerId", sql.UniqueIdentifier, playerId)
          .input("name", sql.NVarChar(24), change.display_name)
          .query(`
            SELECT 1 AS clash FROM damnation_players
            WHERE session_id = @sessionId AND kicked = 0 AND id <> @playerId AND LOWER(display_name) = LOWER(@name)
          `);
        if (clash.recordset.length > 0) throw new DamnationError(409, "Someone at the table already has that name");
        payload.display_name_from = from.display_name;
      }
      if (change.color_key !== undefined && change.color_key !== from.color_key) payload.color_from = from.color_key;
      if (Object.keys(payload).length === 0) return null;

      await request(transaction)
        .input("playerId", sql.UniqueIdentifier, playerId)
        .input("name", sql.NVarChar(24), change.display_name ?? from.display_name)
        .input("color", sql.VarChar(20), change.color_key ?? from.color_key)
        .query(`UPDATE damnation_players SET display_name = @name, color_key = @color, ts_updated = GETDATE() WHERE id = @playerId`);
      return { eventType: "edit_player", targetPlayerId: playerId, payload };
    },
  });
}

// Changes starting life and/or the player count, before the game or during it (Game Setup). A new
// starting life moves every player's total by the same difference, so taps made before the change
// are kept. A player count below the players already in the game is refused, and a new count takes
// the host's last table layout for that count (or the first layout for it).
export function changeGameSetup(
  sessionId: string,
  opId: string,
  change: { starting_life?: number; max_players?: number }
) {
  return runMutation({
    sessionId,
    opId,
    actor: { kind: "host" },
    apply: async (transaction) => {
      const current = await request(transaction)
        .input("sessionId", sql.UniqueIdentifier, sessionId)
        .query<{ starting_life: number; max_seats: number; board_layout: string | null; host_user_id: string; player_count: number }>(`
          SELECT s.starting_life, s.max_seats, s.board_layout, s.host_user_id,
                 (SELECT COUNT(*) FROM damnation_players p WHERE p.session_id = s.id AND p.kicked = 0) AS player_count
          FROM damnation_sessions s WHERE s.id = @sessionId
        `);
      const row = current.recordset[0];
      const payload: Record<string, number> = {};

      if (change.starting_life !== undefined && change.starting_life !== row.starting_life) {
        await request(transaction)
          .input("sessionId", sql.UniqueIdentifier, sessionId)
          .input("startingLife", sql.Int, change.starting_life)
          .input("difference", sql.Int, change.starting_life - row.starting_life)
          .input("lifeMin", sql.Int, LIFE_MIN)
          .input("lifeMax", sql.Int, LIFE_MAX)
          .query(`
            UPDATE damnation_sessions SET starting_life = @startingLife WHERE id = @sessionId;
            UPDATE damnation_players
            SET life_total = CASE
                  WHEN life_total + @difference < @lifeMin THEN @lifeMin
                  WHEN life_total + @difference > @lifeMax THEN @lifeMax
                  ELSE life_total + @difference END,
                ts_updated = GETDATE()
            WHERE session_id = @sessionId AND kicked = 0;
          `);
        payload.starting_life = change.starting_life;
      }

      if (change.max_players !== undefined && change.max_players !== row.max_seats) {
        if (change.max_players < row.player_count) {
          throw new DamnationError(409, `${row.player_count} players are already in — remove someone first`);
        }
        // The host's last layout for this player count, if they have one.
        const nextLayout = await preferredLayout(transaction, row.host_user_id, change.max_players);
        // Players keep their spots; anyone in a spot the smaller table no longer has moves to a free one.
        const seats = await request(transaction)
          .input("sessionId", sql.UniqueIdentifier, sessionId)
          .query<{ id: string; seat: number }>(`
            SELECT id, seat FROM damnation_players WITH (UPDLOCK) WHERE session_id = @sessionId AND kicked = 0 ORDER BY seat
          `);
        const used = new Set(seats.recordset.filter((player) => player.seat <= change.max_players!).map((player) => player.seat));
        for (const player of seats.recordset.filter((player) => player.seat > change.max_players!)) {
          let free = 1;
          while (used.has(free)) free += 1;
          used.add(free);
          await request(transaction)
            .input("playerId", sql.UniqueIdentifier, player.id)
            .input("seat", sql.Int, free)
            .query(`UPDATE damnation_players SET seat = @seat, ts_updated = GETDATE() WHERE id = @playerId`);
        }
        await request(transaction)
          .input("sessionId", sql.UniqueIdentifier, sessionId)
          .input("maxPlayers", sql.Int, change.max_players)
          .input("layout", sql.VarChar(20), nextLayout)
          .query(`UPDATE damnation_sessions SET max_seats = @maxPlayers, board_layout = @layout WHERE id = @sessionId`);
        payload.max_players = change.max_players;
      }

      return Object.keys(payload).length > 0 ? { eventType: "setup", payload } : null;
    },
  });
}

export function finishSession(sessionId: string, opId: string) {
  return runMutation({
    sessionId,
    opId,
    actor: { kind: "host" },
    apply: async (transaction) => {
      await request(transaction)
        .input("sessionId", sql.UniqueIdentifier, sessionId)
        .query(`
          UPDATE damnation_sessions SET status = 'finished', join_code = NULL, ts_finished = GETDATE()
          WHERE id = @sessionId
        `);
      return { eventType: "end" };
    },
  });
}
