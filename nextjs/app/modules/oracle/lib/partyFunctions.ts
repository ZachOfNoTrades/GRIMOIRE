import { getMainConnection } from "@/lib/db";
import type { OraclePartyMember } from "../types/oracle";
import { MAX_PARTY_MEMBERS } from "./constants";
import { OracleError } from "./errors";

// PARTY — the player characters, by name and level. The list is the campaign's player count and
// levels (the encounter builder reads it). A member with a map position stands apart from the
// party token: it has its own token, sees the map from where it is, and the explored area grows
// as it moves.

type MemberRow = { id: string; name: string; level: number; map_id: string | null; map_x: number | null; map_y: number | null };

const COLUMNS = "id, name, level, map_id, map_x, map_y";
const OUTPUT = COLUMNS.split(",").map((column) => `INSERTED.${column.trim()}`).join(", ");

function toMember(row: MemberRow): OraclePartyMember {
  return {
    id: row.id.toLowerCase(),
    name: row.name,
    level: row.level,
    map_id: row.map_id ? row.map_id.toLowerCase() : null,
    map_x: row.map_x,
    map_y: row.map_y,
  };
}

export async function listPartyMembers(campaignId: string): Promise<OraclePartyMember[]> {
  const pool = await getMainConnection();
  const result = await pool.request().input("campaignId", campaignId).query(`
    SELECT ${COLUMNS} FROM oracle_party_members WHERE campaign_id = @campaignId ORDER BY ts_created, id
  `);
  return result.recordset.map(toMember);
}

export async function createPartyMember(campaignId: string, name: string, level: number): Promise<OraclePartyMember> {
  const pool = await getMainConnection();
  const result = await pool.request().input("campaignId", campaignId).input("name", name).input("level", level).input("max", MAX_PARTY_MEMBERS).query(`
    INSERT INTO oracle_party_members (campaign_id, name, level)
    OUTPUT ${OUTPUT}
    SELECT @campaignId, @name, @level
    WHERE (SELECT COUNT(*) FROM oracle_party_members WHERE campaign_id = @campaignId) < @max
  `);
  if (result.recordset.length === 0) throw new OracleError(409, `A party can have at most ${MAX_PARTY_MEMBERS} members`);
  return toMember(result.recordset[0]);
}

export interface PartyMemberPatch {
  name?: string;
  level?: number;
  map_id?: string | null;
  map_x?: number | null;
  map_y?: number | null;
}

// A position change moves what the players see, so the display version moves with it.
export async function updatePartyMember(campaignId: string, memberId: string, patch: PartyMemberPatch): Promise<OraclePartyMember> {
  const pool = await getMainConnection();
  const request = pool.request().input("campaignId", campaignId).input("memberId", memberId);
  const fields: string[] = [];
  if (patch.name !== undefined) {
    fields.push("name = @name");
    request.input("name", patch.name);
  }
  if (patch.level !== undefined) {
    fields.push("level = @level");
    request.input("level", patch.level);
  }
  let moved = false;
  if (patch.map_id !== undefined) {
    if (patch.map_id !== null) {
      const map = await pool.request().input("id", patch.map_id).input("campaignId", campaignId).query(`
        SELECT 1 AS found FROM oracle_maps WHERE id = @id AND campaign_id = @campaignId
      `);
      if (map.recordset.length === 0) throw new OracleError(404, "Map not found");
    }
    fields.push("map_id = @mapId");
    request.input("mapId", patch.map_id);
    moved = true;
  }
  if (patch.map_x !== undefined) {
    fields.push("map_x = @mapX");
    request.input("mapX", patch.map_x);
    moved = true;
  }
  if (patch.map_y !== undefined) {
    fields.push("map_y = @mapY");
    request.input("mapY", patch.map_y);
    moved = true;
  }
  if (fields.length === 0) throw new OracleError(400, "Nothing to change");
  const result = await request.query(`
    UPDATE oracle_party_members SET ${fields.join(", ")}
    OUTPUT ${OUTPUT}
    WHERE id = @memberId AND campaign_id = @campaignId
  `);
  if (result.recordset.length === 0) throw new OracleError(404, "Party member not found");
  if (moved) {
    await pool.request().input("campaignId", campaignId).query(`UPDATE oracle_campaigns SET version = version + 1 WHERE id = @campaignId`);
  }
  return toMember(result.recordset[0]);
}

export async function deletePartyMember(campaignId: string, memberId: string): Promise<void> {
  const pool = await getMainConnection();
  const result = await pool.request().input("campaignId", campaignId).input("memberId", memberId).query(`
    DELETE FROM oracle_party_members WHERE id = @memberId AND campaign_id = @campaignId;
    UPDATE oracle_campaigns SET version = version + 1 WHERE id = @campaignId;
  `);
  if (result.rowsAffected[0] === 0) throw new OracleError(404, "Party member not found");
}
