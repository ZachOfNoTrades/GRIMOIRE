import { getMainConnection } from "@/lib/db";
import type { OracleSession } from "../types/oracle";
import { MAX_SESSIONS } from "./constants";
import { OracleError } from "./errors";

// SESSIONS — one per night at the table. A session holds the DM's rough notes going in and a
// recap coming out; the campaign points at the one that is live. Entities, maps and pictures belong
// to the campaign and are reused across sessions.

type SessionRow = { id: string; title: string; session_date: Date | string | null; notes: string; recap: string; is_done: boolean; ts_created: Date };

const COLUMNS = "id, title, session_date, notes, recap, is_done, ts_created";
const OUTPUT = "INSERTED.id, INSERTED.title, INSERTED.session_date, INSERTED.notes, INSERTED.recap, INSERTED.is_done, INSERTED.ts_created";

function dateOnly(value: Date | string | null): string | null {
  if (!value) return null;
  return (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10);
}

export function toSession(row: SessionRow): OracleSession {
  return {
    id: row.id.toLowerCase(),
    title: row.title,
    session_date: dateOnly(row.session_date),
    notes: row.notes ?? "",
    recap: row.recap ?? "",
    is_done: !!row.is_done,
    ts_created: new Date(row.ts_created).toISOString(),
  };
}

// Oldest first: the list reads as the campaign's history, numbered from the first night.
export async function listSessions(campaignId: string): Promise<OracleSession[]> {
  const pool = await getMainConnection();
  const result = await pool.request().input("campaignId", campaignId).query(`
    SELECT ${COLUMNS} FROM oracle_sessions WHERE campaign_id = @campaignId ORDER BY ts_created, id
  `);
  return result.recordset.map(toSession);
}

export async function getSession(campaignId: string, sessionId: string): Promise<OracleSession> {
  const pool = await getMainConnection();
  const result = await pool.request().input("sessionId", sessionId).input("campaignId", campaignId).query(`
    SELECT ${COLUMNS} FROM oracle_sessions WHERE id = @sessionId AND campaign_id = @campaignId
  `);
  if (result.recordset.length === 0) throw new OracleError(404, "Session not found");
  return toSession(result.recordset[0]);
}

export async function createSession(campaignId: string, title: string, sessionDate: string | null): Promise<OracleSession> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("campaignId", campaignId)
    .input("title", title)
    .input("sessionDate", sessionDate)
    .input("max", MAX_SESSIONS)
    .query(`
      INSERT INTO oracle_sessions (campaign_id, title, session_date)
      OUTPUT ${OUTPUT}
      SELECT @campaignId, @title, @sessionDate
      WHERE (SELECT COUNT(*) FROM oracle_sessions WHERE campaign_id = @campaignId) < @max
    `);
  if (result.recordset.length === 0) throw new OracleError(409, `A campaign can have at most ${MAX_SESSIONS} sessions`);
  return toSession(result.recordset[0]);
}

export interface SessionPatch {
  title?: string;
  session_date?: string | null;
  notes?: string;
  recap?: string;
  is_done?: boolean;
}

export async function updateSession(campaignId: string, sessionId: string, patch: SessionPatch): Promise<OracleSession> {
  const pool = await getMainConnection();
  const request = pool.request().input("sessionId", sessionId).input("campaignId", campaignId);
  const updateFields: string[] = [];
  if (patch.title !== undefined) {
    updateFields.push("title = @title");
    request.input("title", patch.title);
  }
  if (patch.session_date !== undefined) {
    updateFields.push("session_date = @sessionDate");
    request.input("sessionDate", patch.session_date);
  }
  if (patch.notes !== undefined) {
    updateFields.push("notes = @notes");
    request.input("notes", patch.notes);
  }
  if (patch.recap !== undefined) {
    updateFields.push("recap = @recap");
    request.input("recap", patch.recap);
  }
  if (patch.is_done !== undefined) {
    updateFields.push("is_done = @isDone");
    request.input("isDone", patch.is_done ? 1 : 0);
  }
  updateFields.push("ts_updated = GETDATE()");
  const result = await request.query(`
    UPDATE oracle_sessions SET ${updateFields.join(", ")}
    OUTPUT ${OUTPUT}
    WHERE id = @sessionId AND campaign_id = @campaignId
  `);
  if (result.recordset.length === 0) throw new OracleError(404, "Session not found");
  return toSession(result.recordset[0]);
}

// The campaign's live-session pointer has no foreign key, so it is cleared here. Log entries
// keep the session's title (copied onto them when written).
export async function deleteSession(campaignId: string, sessionId: string): Promise<void> {
  const pool = await getMainConnection();
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const result = await transaction.request().input("sessionId", sessionId).input("campaignId", campaignId).query(`
      DELETE FROM oracle_sessions WHERE id = @sessionId AND campaign_id = @campaignId
    `);
    if (result.rowsAffected[0] === 0) throw new OracleError(404, "Session not found");
    await transaction.request().input("sessionId", sessionId).input("campaignId", campaignId).query(`
      UPDATE oracle_campaigns SET current_session_id = NULL WHERE id = @campaignId AND current_session_id = @sessionId
    `);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}
