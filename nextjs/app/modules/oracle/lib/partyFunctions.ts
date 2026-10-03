import { getMainConnection } from "@/lib/db";
import type { OraclePartyGroup, OraclePartyMember } from "../types/oracle";
import { MAX_PARTY_GROUPS, MAX_PARTY_MEMBERS } from "./constants";
import { OracleError } from "./errors";

// PARTY — the player characters, by name and level. The list is the campaign's player count and
// levels (the encounter builder reads it). Characters are with the main party token unless they
// belong to a group: a named token of its own on a map, which sees from where it stands and
// reveals the ground it walks over.

type MemberRow = { id: string; name: string; level: number; group_id: string | null };

const COLUMNS = "id, name, level, group_id";
const OUTPUT = COLUMNS.split(",").map((column) => `INSERTED.${column.trim()}`).join(", ");

function toMember(row: MemberRow): OraclePartyMember {
  return { id: row.id.toLowerCase(), name: row.name, level: row.level, group_id: row.group_id ? row.group_id.toLowerCase() : null };
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
  group_id?: string | null; // the group the member moves to; null = back with the main party
}

// Moving a member between groups changes what the players see (who sees from where), so the
// display version moves with it.
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
  if (patch.group_id !== undefined) {
    if (patch.group_id !== null) {
      const group = await pool.request().input("id", patch.group_id).input("campaignId", campaignId).query(`
        SELECT 1 AS found FROM oracle_party_groups WHERE id = @id AND campaign_id = @campaignId
      `);
      if (group.recordset.length === 0) throw new OracleError(404, "Group not found");
    }
    fields.push("group_id = @groupId");
    request.input("groupId", patch.group_id);
  }
  if (fields.length === 0) throw new OracleError(400, "Nothing to change");
  const result = await request.query(`
    UPDATE oracle_party_members SET ${fields.join(", ")}
    OUTPUT ${OUTPUT}
    WHERE id = @memberId AND campaign_id = @campaignId
  `);
  if (result.recordset.length === 0) throw new OracleError(404, "Party member not found");
  if (patch.group_id !== undefined) await bump(campaignId);
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

async function bump(campaignId: string): Promise<void> {
  const pool = await getMainConnection();
  await pool.request().input("campaignId", campaignId).query(`UPDATE oracle_campaigns SET version = version + 1 WHERE id = @campaignId`);
}

// ---------------------------------------------------------------------------------------------
// GROUPS
// ---------------------------------------------------------------------------------------------

type GroupRow = { id: string; name: string; map_id: string | null; map_x: number | null; map_y: number | null };
const GROUP_COLUMNS = "id, name, map_id, map_x, map_y";
const GROUP_OUTPUT = GROUP_COLUMNS.split(",").map((column) => `INSERTED.${column.trim()}`).join(", ");

function toGroup(row: GroupRow): OraclePartyGroup {
  return { id: row.id.toLowerCase(), name: row.name, map_id: row.map_id ? row.map_id.toLowerCase() : null, map_x: row.map_x, map_y: row.map_y };
}

export async function listPartyGroups(campaignId: string): Promise<OraclePartyGroup[]> {
  const pool = await getMainConnection();
  const result = await pool.request().input("campaignId", campaignId).query(`
    SELECT ${GROUP_COLUMNS} FROM oracle_party_groups WHERE campaign_id = @campaignId ORDER BY ts_created, id
  `);
  return result.recordset.map(toGroup);
}

async function checkMap(campaignId: string, mapId: string | null): Promise<void> {
  if (mapId === null) return;
  const pool = await getMainConnection();
  const map = await pool.request().input("id", mapId).input("campaignId", campaignId).query(`
    SELECT 1 AS found FROM oracle_maps WHERE id = @id AND campaign_id = @campaignId
  `);
  if (map.recordset.length === 0) throw new OracleError(404, "Map not found");
}

export async function createPartyGroup(campaignId: string, input: { name: string; map_id: string | null; map_x: number | null; map_y: number | null }): Promise<OraclePartyGroup> {
  await checkMap(campaignId, input.map_id);
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("campaignId", campaignId)
    .input("name", input.name)
    .input("mapId", input.map_id)
    .input("mapX", input.map_id ? input.map_x : null)
    .input("mapY", input.map_id ? input.map_y : null)
    .input("max", MAX_PARTY_GROUPS)
    .query(`
      INSERT INTO oracle_party_groups (campaign_id, name, map_id, map_x, map_y)
      OUTPUT ${GROUP_OUTPUT}
      SELECT @campaignId, @name, @mapId, @mapX, @mapY
      WHERE (SELECT COUNT(*) FROM oracle_party_groups WHERE campaign_id = @campaignId) < @max
    `);
  if (result.recordset.length === 0) throw new OracleError(409, `A campaign can have at most ${MAX_PARTY_GROUPS} groups`);
  await bump(campaignId);
  return toGroup(result.recordset[0]);
}

export interface PartyGroupPatch {
  name?: string;
  map_id?: string | null;
  map_x?: number | null;
  map_y?: number | null;
}

export async function updatePartyGroup(campaignId: string, groupId: string, patch: PartyGroupPatch): Promise<OraclePartyGroup> {
  const pool = await getMainConnection();
  const request = pool.request().input("campaignId", campaignId).input("groupId", groupId);
  const fields: string[] = [];
  if (patch.name !== undefined) {
    fields.push("name = @name");
    request.input("name", patch.name);
  }
  if (patch.map_id !== undefined) {
    await checkMap(campaignId, patch.map_id);
    fields.push("map_id = @mapId");
    request.input("mapId", patch.map_id);
  }
  if (patch.map_x !== undefined) {
    fields.push("map_x = @mapX");
    request.input("mapX", patch.map_x);
  }
  if (patch.map_y !== undefined) {
    fields.push("map_y = @mapY");
    request.input("mapY", patch.map_y);
  }
  if (fields.length === 0) throw new OracleError(400, "Nothing to change");
  const result = await request.query(`
    UPDATE oracle_party_groups SET ${fields.join(", ")}
    OUTPUT ${GROUP_OUTPUT}
    WHERE id = @groupId AND campaign_id = @campaignId
  `);
  if (result.recordset.length === 0) throw new OracleError(404, "Group not found");
  await bump(campaignId);
  return toGroup(result.recordset[0]);
}

// Disbanding a group sends its members back to the main party.
export async function deletePartyGroup(campaignId: string, groupId: string): Promise<void> {
  const pool = await getMainConnection();
  const result = await pool.request().input("campaignId", campaignId).input("groupId", groupId).query(`
    DELETE FROM oracle_party_groups WHERE id = @groupId AND campaign_id = @campaignId;
    UPDATE oracle_party_members SET group_id = NULL WHERE campaign_id = @campaignId AND group_id = @groupId;
    UPDATE oracle_campaigns SET version = version + 1 WHERE id = @campaignId;
  `);
  if (result.rowsAffected[0] === 0) throw new OracleError(404, "Group not found");
}
