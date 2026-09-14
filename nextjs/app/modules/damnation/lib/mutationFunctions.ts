import sql from "mssql";
import { getMainConnection } from "@/lib/db";
import {
  COMMANDER_DAMAGE_MAX,
  LIFE_MAX,
  LIFE_MIN,
} from "./constants";
import { DamnationError, isUniqueViolation } from "./errors";
import { generatePlayerToken } from "./playerTokens";
import { broadcastSnapshot, endSession, revokePlayer } from "./sessionBus";
import { readSnapshot } from "./snapshotFunctions";
import type { EventType, HostSnapshot, SessionStatus } from "../types/damnation";

// Every write to a session goes through runMutation, one transaction that:
//   1. bumps damnation_sessions.version — the row lock this takes serializes every write to
//      the session, so concurrent taps, joins and undos can never interleave;
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

type Apply = (transaction: sql.Transaction, context: { sessionId: string; status: SessionStatus; version: number }) =>
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
  if (message.includes("UX_damnation_players_seat")) return new DamnationError(409, "That seat was just taken — try again");
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
  allowFinished?: boolean;
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
      .query<{ version: number; status: SessionStatus }>(`
        UPDATE damnation_sessions
        SET version = version + 1, ts_updated = GETDATE()
        OUTPUT INSERTED.version, INSERTED.status
        WHERE id = @sessionId ${options.allowFinished ? "" : "AND status <> 'finished'"}
      `);
    if (bump.recordset.length === 0) {
      await rollback();
      throw new DamnationError(410, "This game has ended");
    }
    const { version, status } = bump.recordset[0];

    // IDEMPOTENCY
    const seen = await request(transaction)
      .input("opId", sql.UniqueIdentifier, opId)
      .query(`SELECT 1 AS seen FROM damnation_events WHERE op_id = @opId`);
    if (seen.recordset.length > 0) {
      await rollback();
      return { snapshot: await currentSnapshot(sessionId), duplicate: true, changed: false };
    }

    // APPLY
    const draft = await apply(transaction, { sessionId, status, version });
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
// GAME CHANGES — callable by any seated player or by the host
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

// Undo reverses the most recent not-yet-undone game change. A player can only undo their own
// changes — with everyone able to edit everyone, a shared stack would let players reverse each
// other. The host can undo the latest change at the table, whoever made it.
export function undoLastChange(sessionId: string, opId: string, actor: Actor) {
  return runMutation({
    sessionId,
    opId,
    actor,
    apply: async (transaction) => {
      const lookup = request(transaction).input("sessionId", sql.UniqueIdentifier, sessionId);
      let actorFilter = "";
      if (actor.kind === "player") {
        lookup.input("actorPlayerId", sql.UniqueIdentifier, actor.playerId);
        actorFilter = "AND e.actor_player_id = @actorPlayerId";
      }
      const found = await lookup.query<{
        id: string;
        event_type: EventType;
        target_player_id: string;
        payload: string | null;
      }>(`
        SELECT TOP 1 e.id, e.event_type, e.target_player_id, e.payload
        FROM damnation_events e
        WHERE e.session_id = @sessionId
          AND e.event_type IN ('life', 'commander_damage', 'status')
          ${actorFilter}
          AND NOT EXISTS (SELECT 1 FROM damnation_events u WHERE u.undoes_event_id = e.id)
        ORDER BY e.session_version DESC
      `);
      if (found.recordset.length === 0) throw new DamnationError(404, "Nothing to undo");

      const original = found.recordset[0];
      const targetPlayerId = original.target_player_id.toLowerCase();
      const payload = JSON.parse(original.payload ?? "{}");

      // The original target may have been kicked since; undo still restores its row.
      const target = await request(transaction)
        .input("playerId", sql.UniqueIdentifier, targetPlayerId)
        .query<{ life_total: number }>(`SELECT life_total FROM damnation_players WITH (UPDLOCK) WHERE id = @playerId`);
      const currentLife = target.recordset[0]?.life_total ?? 0;

      if (original.event_type === "life") {
        await setLife(transaction, targetPlayerId, clamp(currentLife - Number(payload.delta ?? 0), LIFE_MIN, LIFE_MAX));
      } else if (original.event_type === "commander_damage") {
        await adjustCommanderCell(
          transaction,
          sessionId,
          String(payload.source_player_id),
          targetPlayerId,
          -Number(payload.cell_delta ?? 0)
        );
        await setLife(transaction, targetPlayerId, clamp(currentLife - Number(payload.life_delta ?? 0), LIFE_MIN, LIFE_MAX));
      } else {
        const from = payload.from ?? {};
        await request(transaction)
          .input("playerId", sql.UniqueIdentifier, targetPlayerId)
          .input("conceded", sql.Bit, Boolean(from.conceded))
          .input("override", sql.Bit, from.eliminated_override ?? null)
          .query(`
            UPDATE damnation_players SET conceded = @conceded, eliminated_override = @override, ts_updated = GETDATE()
            WHERE id = @playerId
          `);
      }

      return {
        eventType: "undo",
        targetPlayerId,
        undoesEventId: original.id,
        payload: { undone_type: original.event_type, ...payload },
      };
    },
  });
}

// ---------------------------------------------------------------------------------------------
// SEATING
// ---------------------------------------------------------------------------------------------

// Seats a new player in the lowest free seat. Colors may be shared; names may not. Shared by guest joins (with a token) and
// players the host adds from the board (no token, is_manual = 1). Runs inside runMutation,
// so the session row lock already serializes it against every other seat change.
async function seatPlayer(
  transaction: sql.Transaction,
  sessionId: string,
  displayName: string,
  colorKey: string,
  tokenHash: Buffer | null
): Promise<string> {
  const seating = await request(transaction)
    .input("sessionId", sql.UniqueIdentifier, sessionId)
    .query<{ seat: number; display_name: string; max_seats: number; starting_life: number }>(`
      SELECT p.seat, p.display_name, s.max_seats, s.starting_life
      FROM damnation_sessions s
      LEFT JOIN damnation_players p ON p.session_id = s.id AND p.kicked = 0
      WHERE s.id = @sessionId
    `);
  const { max_seats: maxSeats, starting_life: startingLife } = seating.recordset[0];
  const taken = seating.recordset.filter((row) => row.seat !== null);

  if (taken.length >= maxSeats) throw new DamnationError(409, "The table is full");
  if (taken.some((row) => row.display_name.toLowerCase() === displayName.toLowerCase())) {
    throw new DamnationError(409, "Someone at the table already has that name");
  }

  const takenSeats = new Set(taken.map((row) => row.seat));
  let seat = 1;
  while (takenSeats.has(seat)) seat += 1;

  const inserted = await request(transaction)
    .input("sessionId", sql.UniqueIdentifier, sessionId)
    .input("seat", sql.Int, seat)
    .input("displayName", sql.NVarChar(24), displayName)
    .input("colorKey", sql.VarChar(20), colorKey)
    .input("tokenHash", sql.VarBinary(32), tokenHash)
    .input("isManual", sql.Bit, tokenHash === null)
    .input("life", sql.Int, startingLife)
    .query<{ id: string }>(`
      INSERT INTO damnation_players (session_id, seat, display_name, color_key, token_hash, is_manual, life_total)
      OUTPUT INSERTED.id
      VALUES (@sessionId, @seat, @displayName, @colorKey, @tokenHash, @isManual, @life)
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
      if (context.status !== "lobby") {
        throw new DamnationError(409, "Joining is closed — ask the host to reopen joins");
      }
      playerId = await seatPlayer(transaction, sessionId, displayName, colorKey, token.hash);
      return { eventType: "join", actorPlayerId: playerId, targetPlayerId: playerId };
    },
  });

  // A replayed join can't hand the token back (only its hash is stored); the first response
  // was lost, so the orphaned seat is for the host to remove.
  if (result.duplicate) throw new DamnationError(409, "That join was already processed — ask the host to free the seat");
  return { token: token.plaintext, playerId, result };
}

// A player the host adds from the board, for someone playing without a phone. Allowed whether
// or not joining is open — it's the host's own seat to fill. The card is edited from the board
// or from any seated phone; the seat is not claimable until the host hands it to a phone.
export function addManualPlayer(sessionId: string, opId: string, displayName: string, colorKey: string) {
  return runMutation({
    sessionId,
    opId,
    actor: { kind: "host" },
    apply: async (transaction) => {
      const playerId = await seatPlayer(transaction, sessionId, displayName, colorKey, null);
      return { eventType: "join", actorPlayerId: null, targetPlayerId: playerId, payload: { manual: true } };
    },
  });
}

// Takes over a seat the host freed (a player whose phone died). Keeps the seat's life and
// commander damage; works whether or not joins are open.
export async function claimSeat(
  sessionId: string,
  opId: string,
  claimPlayerId: string
): Promise<{ token: string; playerId: string; result: MutationResult }> {
  const token = generatePlayerToken();

  const result = await runMutation({
    sessionId,
    opId,
    actor: { kind: "host" },
    apply: async (transaction) => {
      const updated = await request(transaction)
        .input("sessionId", sql.UniqueIdentifier, sessionId)
        .input("playerId", sql.UniqueIdentifier, claimPlayerId)
        .input("tokenHash", sql.VarBinary(32), token.hash)
        .query(`
          UPDATE damnation_players SET token_hash = @tokenHash, ts_updated = GETDATE()
          WHERE id = @playerId AND session_id = @sessionId AND kicked = 0 AND token_hash IS NULL AND is_manual = 0
        `);
      if (updated.rowsAffected[0] === 0) throw new DamnationError(409, "That seat isn't open");
      return { eventType: "claim", actorPlayerId: claimPlayerId, targetPlayerId: claimPlayerId };
    },
  });

  if (result.duplicate) throw new DamnationError(409, "That claim was already processed — ask the host to free the seat again");
  return { token: token.plaintext, playerId: claimPlayerId, result };
}

// ---------------------------------------------------------------------------------------------
// HOST CONTROLS
// ---------------------------------------------------------------------------------------------

export function setJoinsOpen(sessionId: string, opId: string, open: boolean) {
  return runMutation({
    sessionId,
    opId,
    actor: { kind: "host" },
    apply: async (transaction, context) => {
      const nextStatus: SessionStatus = open ? "lobby" : "active";
      if (context.status === nextStatus) return null;
      await request(transaction)
        .input("sessionId", sql.UniqueIdentifier, sessionId)
        .input("status", sql.VarChar(10), nextStatus)
        .query(`UPDATE damnation_sessions SET status = @status WHERE id = @sessionId`);
      return { eventType: open ? "reopen" : "start" };
    },
  });
}

export function removePlayer(sessionId: string, opId: string, playerId: string, mode: "kick" | "free_seat") {
  return runMutation({
    sessionId,
    opId,
    actor: { kind: "host" },
    apply: async (transaction) => {
      const player = await lockPlayer(transaction, sessionId, playerId);
      await request(transaction)
        .input("playerId", sql.UniqueIdentifier, playerId)
        .query(
          mode === "kick"
            ? `UPDATE damnation_players SET kicked = 1, token_hash = NULL, ts_updated = GETDATE() WHERE id = @playerId`
            : `UPDATE damnation_players SET token_hash = NULL, ts_updated = GETDATE() WHERE id = @playerId`
        );
      return { eventType: mode, targetPlayerId: playerId, payload: player.is_manual ? { manual: true } : null };
    },
  }).then((result) => {
    // Cut the removed phone's live stream now rather than at its next request.
    if (result.changed) revokePlayer(sessionId, playerId, mode === "kick" ? "kicked" : "seat_freed");
    return result;
  });
}

// Gives a session a fresh join code inside the current mutation.
async function assignNewJoinCode(transaction: sql.Transaction, sessionId: string, generateCode: () => string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    const clash = await request(transaction)
      .input("code", sql.VarChar(8), code)
      .query(`SELECT 1 AS clash FROM damnation_sessions WHERE join_code = @code`);
    if (clash.recordset.length > 0) continue;
    await request(transaction)
      .input("sessionId", sql.UniqueIdentifier, sessionId)
      .input("code", sql.VarChar(8), code)
      .query(`UPDATE damnation_sessions SET join_code = @code WHERE id = @sessionId`);
    return;
  }
  throw new DamnationError(503, "Couldn't generate a new code — try again");
}

export function rotateJoinCode(sessionId: string, opId: string, generateCode: () => string) {
  return runMutation({
    sessionId,
    opId,
    actor: { kind: "host" },
    apply: async (transaction) => {
      await assignNewJoinCode(transaction, sessionId, generateCode);
      return { eventType: "rotate_code" };
    },
  });
}

// Reopens a finished game (ended by the host or expired while idle) with its totals intact.
// Phones lost their seats when the game ended, so every phone seat reopens to be taken over
// with the new code; players without a phone stay as they were. Joining stays closed.
export function resumeSession(sessionId: string, opId: string, generateCode: () => string) {
  return runMutation({
    sessionId,
    opId,
    actor: { kind: "host" },
    allowFinished: true,
    apply: async (transaction, context) => {
      if (context.status !== "finished") throw new DamnationError(409, "This game is still running");
      await assignNewJoinCode(transaction, sessionId, generateCode);
      await request(transaction)
        .input("sessionId", sql.UniqueIdentifier, sessionId)
        .query(`
          UPDATE damnation_sessions SET status = 'active', ts_finished = NULL WHERE id = @sessionId;
          UPDATE damnation_players SET token_hash = NULL, ts_updated = GETDATE()
          WHERE session_id = @sessionId AND kicked = 0 AND is_manual = 0;
        `);
      return { eventType: "reopen", payload: { resumed: true } };
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
