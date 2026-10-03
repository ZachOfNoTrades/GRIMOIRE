import { getMainConnection } from "@/lib/db";
import type { OracleEvent } from "../types/oracle";
import { EVENT_PAGE_SIZE } from "./constants";
import { normalizeId } from "./campaignFunctions";
import { OracleError } from "./errors";

type EventRow = { id: string; entity_id: string | null; session_title: string | null; body: string; ts_created: Date };

function toEvent(row: EventRow): OracleEvent {
  return {
    id: row.id.toLowerCase(),
    entity_id: normalizeId(row.entity_id),
    session_title: row.session_title,
    body: row.body,
    ts_created: new Date(row.ts_created).toISOString(),
  };
}

// Newest first, capped: the log page and the per-entity history both read from this list.
export async function listEvents(campaignId: string): Promise<OracleEvent[]> {
  const pool = await getMainConnection();
  const result = await pool.request().input("campaignId", campaignId).input("pageSize", EVENT_PAGE_SIZE).query(`
    SELECT TOP (@pageSize) id, entity_id, session_title, body, ts_created
    FROM oracle_events
    WHERE campaign_id = @campaignId
    ORDER BY ts_created DESC, id
  `);
  return result.recordset.map(toEvent);
}

// The live session's title is copied onto the event so the log still reads right after sessions
// are renamed or deleted.
export async function addEvent(campaignId: string, body: string, entityId: string | null): Promise<OracleEvent> {
  const pool = await getMainConnection();
  if (entityId !== null) {
    const entity = await pool.request().input("entityId", entityId).input("campaignId", campaignId).query(`
      SELECT 1 AS found FROM oracle_entities WHERE id = @entityId AND campaign_id = @campaignId
    `);
    if (entity.recordset.length === 0) throw new OracleError(404, "Entry not found");
  }
  const result = await pool
    .request()
    .input("campaignId", campaignId)
    .input("entityId", entityId)
    .input("body", body)
    .query(`
      INSERT INTO oracle_events (campaign_id, entity_id, session_title, body)
      OUTPUT INSERTED.id, INSERTED.entity_id, INSERTED.session_title, INSERTED.body, INSERTED.ts_created
      SELECT @campaignId, @entityId,
             (SELECT s.title FROM oracle_sessions s INNER JOIN oracle_campaigns c ON c.current_session_id = s.id WHERE c.id = @campaignId),
             @body
    `);
  return toEvent(result.recordset[0]);
}

export async function deleteEvent(campaignId: string, eventId: string): Promise<void> {
  const pool = await getMainConnection();
  const result = await pool.request().input("eventId", eventId).input("campaignId", campaignId).query(`
    DELETE FROM oracle_events WHERE id = @eventId AND campaign_id = @campaignId
  `);
  if (result.rowsAffected[0] === 0) {
    throw new OracleError(404, "Log entry not found");
  }
}
