import { getMainConnection } from "@/lib/db";
import type { Attitude, EntityKind, Knowledge, KnowledgeTier, OracleEntity, StatBlock } from "../types/oracle";
import { MAX_ENTITIES } from "./constants";
import { bumpVersion, normalizeId } from "./campaignFunctions";
import { OracleError, isUniqueViolation } from "./errors";
import { parseJson } from "./mapData";

const ENTITY_COLUMNS = "id, kind, name, details, attitude, stats, dm_notes, map_id, map_x, map_y, image_id, is_revealed, is_down, in_party, party_group_id, source";

type EntityRow = {
  id: string;
  kind: EntityKind;
  name: string;
  details: string;
  attitude: Attitude;
  stats: string | null;
  dm_notes: string;
  map_id: string | null;
  map_x: number | null;
  map_y: number | null;
  image_id: string | null;
  is_revealed: boolean;
  is_down: boolean;
  in_party: boolean;
  party_group_id: string | null;
  source: string | null;
};

type KnowledgeRow = { id: string; entity_id: string; fact: string; skill: string | null; tier: KnowledgeTier | null; ts_created: Date };

function toKnowledge(row: KnowledgeRow): Knowledge {
  return {
    id: row.id.toLowerCase(),
    entity_id: row.entity_id.toLowerCase(),
    fact: row.fact,
    skill: row.skill,
    tier: row.tier,
    ts_created: new Date(row.ts_created).toISOString(),
  };
}

function toEntity(row: EntityRow, knowledge: Knowledge[]): OracleEntity {
  return {
    id: row.id.toLowerCase(),
    kind: row.kind,
    name: row.name,
    details: row.details,
    attitude: row.attitude,
    stats: parseJson<StatBlock | null>(row.stats, null),
    dm_notes: row.dm_notes,
    map_id: normalizeId(row.map_id),
    map_x: row.map_x,
    map_y: row.map_y,
    image_id: normalizeId(row.image_id),
    is_revealed: !!row.is_revealed,
    is_down: !!row.is_down,
    in_party: !!row.in_party,
    party_group_id: row.party_group_id ? String(row.party_group_id).toLowerCase() : null,
    source: row.source ?? null,
    knowledge,
  };
}

export async function listEntities(campaignId: string): Promise<OracleEntity[]> {
  const pool = await getMainConnection();
  const [entities, knowledge] = await Promise.all([
    pool.request().input("campaignId", campaignId).query(`
      SELECT ${ENTITY_COLUMNS} FROM oracle_entities WHERE campaign_id = @campaignId ORDER BY name, ts_created
    `),
    pool.request().input("campaignId", campaignId).query(`
      SELECT k.id, k.entity_id, k.fact, k.skill, k.tier, k.ts_created
      FROM oracle_knowledge k
      INNER JOIN oracle_entities e ON e.id = k.entity_id
      WHERE e.campaign_id = @campaignId
      ORDER BY k.ts_created
    `),
  ]);

  const byEntity = new Map<string, Knowledge[]>();
  for (const row of knowledge.recordset as KnowledgeRow[]) {
    const fact = toKnowledge(row);
    byEntity.set(fact.entity_id, [...(byEntity.get(fact.entity_id) ?? []), fact]);
  }
  return (entities.recordset as EntityRow[]).map((row) => toEntity(row, byEntity.get(row.id.toLowerCase()) ?? []));
}

export async function getEntity(campaignId: string, entityId: string): Promise<OracleEntity> {
  const pool = await getMainConnection();
  const [entity, knowledge] = await Promise.all([
    pool.request().input("entityId", entityId).input("campaignId", campaignId).query(`
      SELECT ${ENTITY_COLUMNS} FROM oracle_entities WHERE id = @entityId AND campaign_id = @campaignId
    `),
    pool.request().input("entityId", entityId).query(`
      SELECT id, entity_id, fact, skill, tier, ts_created FROM oracle_knowledge WHERE entity_id = @entityId ORDER BY ts_created
    `),
  ]);
  if (entity.recordset.length === 0) {
    throw new OracleError(404, "Entry not found");
  }
  return toEntity(entity.recordset[0], (knowledge.recordset as KnowledgeRow[]).map(toKnowledge));
}

export interface EntityInput {
  id?: string;
  kind: EntityKind;
  name: string;
  details: string;
  attitude: Attitude;
  dm_notes: string;
  stats: StatBlock | null;
  source?: string | null;
  map_id: string | null;
  map_x: number | null;
  map_y: number | null;
}

// A map placement must name a map of this campaign and carry both coordinates.
async function checkPlacement(campaignId: string, mapId: string | null, mapX: number | null, mapY: number | null): Promise<void> {
  if (mapId === null) return;
  if (mapX === null || mapY === null) throw new OracleError(400, "A placed entry needs a position");
  const pool = await getMainConnection();
  const map = await pool.request().input("id", mapId).input("campaignId", campaignId).query(`
    SELECT 1 AS found FROM oracle_maps WHERE id = @id AND campaign_id = @campaignId
  `);
  if (map.recordset.length === 0) throw new OracleError(404, "Map not found");
}

// The page may supply the id (so the row it painted is the real one). Re-sending the same id is
// a no-op that returns the existing row, which makes a double-submit harmless.
export async function createEntity(campaignId: string, input: EntityInput): Promise<OracleEntity> {
  await checkPlacement(campaignId, input.map_id, input.map_x, input.map_y);
  const pool = await getMainConnection();
  const request = pool
    .request()
    .input("campaignId", campaignId)
    .input("kind", input.kind)
    .input("name", input.name)
    .input("details", input.details)
    .input("attitude", input.attitude)
    .input("stats", input.kind === "creature" && input.stats ? JSON.stringify(input.stats) : null)
    .input("dmNotes", input.dm_notes)
    .input("source", input.source ?? null)
    .input("mapId", input.map_id)
    .input("mapX", input.map_id ? input.map_x : null)
    .input("mapY", input.map_id ? input.map_y : null)
    .input("maxEntities", MAX_ENTITIES);
  if (input.id) request.input("id", input.id);

  try {
    const result = await request.query(`
      INSERT INTO oracle_entities (${input.id ? "id, " : ""}campaign_id, kind, name, details, attitude, stats, dm_notes, source, map_id, map_x, map_y)
      OUTPUT ${ENTITY_COLUMNS.split(",").map((column) => `INSERTED.${column.trim()}`).join(", ")}
      SELECT ${input.id ? "@id, " : ""}@campaignId, @kind, @name, @details, @attitude, @stats, @dmNotes, @source, @mapId, @mapX, @mapY
      WHERE (SELECT COUNT(*) FROM oracle_entities WHERE campaign_id = @campaignId) < @maxEntities
    `);
    if (result.recordset.length === 0) {
      throw new OracleError(409, `A campaign can have at most ${MAX_ENTITIES} entries`);
    }
    await bumpVersion(campaignId);
    return toEntity(result.recordset[0], []);
  } catch (error) {
    if (input.id && isUniqueViolation(error)) {
      return getEntity(campaignId, input.id);
    }
    throw error;
  }
}

export interface EntityPatch {
  kind?: EntityKind;
  name?: string;
  details?: string;
  attitude?: Attitude;
  dm_notes?: string;
  stats?: StatBlock | null;
  map_id?: string | null;
  map_x?: number | null;
  map_y?: number | null;
  image_id?: string | null;
  is_revealed?: boolean;
  is_down?: boolean;
  in_party?: boolean; // joining clears the map position; placing on a map leaves the party
  party_group_id?: string | null; // the group it travels with; null = with the party token
  source?: string | null;
}

export async function updateEntity(campaignId: string, entityId: string, patch: EntityPatch): Promise<OracleEntity> {
  const pool = await getMainConnection();
  const request = pool.request().input("entityId", entityId).input("campaignId", campaignId);
  const updateFields: string[] = [];

  // PARTY — a companion travels with the party (or a group) instead of standing on a map.
  const joins = patch.in_party === true;
  const placed = patch.map_id !== undefined && patch.map_id !== null;
  if (joins && placed) throw new OracleError(400, "An entry is either with the party or on a map, not both");
  if (joins) {
    const current = await getEntity(campaignId, entityId);
    if ((patch.kind ?? current.kind) === "place") throw new OracleError(400, "A location can't join the party");
    if (patch.map_id === undefined) patch = { ...patch, map_id: null };
  }
  if (joins || patch.in_party === false || placed) {
    updateFields.push("in_party = @inParty");
    request.input("inParty", joins ? 1 : 0);
    if (!joins) patch = { ...patch, party_group_id: null };
  }
  if (patch.party_group_id !== undefined) {
    if (patch.party_group_id !== null) {
      const group = await pool.request().input("id", patch.party_group_id).input("campaignId", campaignId).query(`
        SELECT 1 AS found FROM oracle_party_groups WHERE id = @id AND campaign_id = @campaignId
      `);
      if (group.recordset.length === 0) throw new OracleError(404, "Group not found");
    }
    updateFields.push("party_group_id = @partyGroupId");
    request.input("partyGroupId", patch.party_group_id);
  }
  if (patch.kind !== undefined) {
    updateFields.push("kind = @kind");
    request.input("kind", patch.kind);
  }
  if (patch.name !== undefined) {
    updateFields.push("name = @name");
    request.input("name", patch.name);
  }
  if (patch.details !== undefined) {
    updateFields.push("details = @details");
    request.input("details", patch.details);
  }
  if (patch.attitude !== undefined) {
    updateFields.push("attitude = @attitude");
    request.input("attitude", patch.attitude);
  }
  if (patch.dm_notes !== undefined) {
    updateFields.push("dm_notes = @dmNotes");
    request.input("dmNotes", patch.dm_notes);
  }
  if (patch.stats !== undefined) {
    updateFields.push("stats = @stats");
    request.input("stats", patch.stats ? JSON.stringify(patch.stats) : null);
  }
  if (patch.map_id !== undefined) {
    const mapX = patch.map_id === null ? null : patch.map_x ?? null;
    const mapY = patch.map_id === null ? null : patch.map_y ?? null;
    await checkPlacement(campaignId, patch.map_id, mapX, mapY);
    updateFields.push("map_id = @mapId", "map_x = @mapX", "map_y = @mapY");
    request.input("mapId", patch.map_id);
    request.input("mapX", mapX);
    request.input("mapY", mapY);
  } else if (patch.map_x !== undefined && patch.map_y !== undefined && patch.map_x !== null && patch.map_y !== null) {
    // Moving an entry that is already placed.
    updateFields.push("map_x = CASE WHEN map_id IS NULL THEN NULL ELSE @mapX END", "map_y = CASE WHEN map_id IS NULL THEN NULL ELSE @mapY END");
    request.input("mapX", patch.map_x);
    request.input("mapY", patch.map_y);
  }
  if (patch.source !== undefined) {
    updateFields.push("source = @source");
    request.input("source", patch.source);
  }
  if (patch.is_down !== undefined) {
    updateFields.push("is_down = @isDown");
    request.input("isDown", patch.is_down ? 1 : 0);
  }
  if (patch.is_revealed !== undefined) {
    updateFields.push("is_revealed = @isRevealed");
    request.input("isRevealed", patch.is_revealed ? 1 : 0);
  }
  if (patch.image_id !== undefined) {
    if (patch.image_id !== null) {
      const image = await pool.request().input("id", patch.image_id).input("campaignId", campaignId).query(`
        SELECT 1 AS found FROM oracle_images WHERE id = @id AND campaign_id = @campaignId
      `);
      if (image.recordset.length === 0) throw new OracleError(404, "Image not found");
    }
    updateFields.push("image_id = @imageId");
    request.input("imageId", patch.image_id);
  }

  if (updateFields.length === 0) {
    throw new OracleError(400, "Nothing to change");
  }
  updateFields.push("ts_updated = GETDATE()");

  const result = await request.query(`
    UPDATE oracle_entities
    SET ${updateFields.join(", ")}
    WHERE id = @entityId AND campaign_id = @campaignId
  `);
  if (result.rowsAffected[0] === 0) {
    throw new OracleError(404, "Entry not found");
  }
  await bumpVersion(campaignId);
  return getEntity(campaignId, entityId);
}

// Knowledge rows cascade with the entity. The panel pointer and event links have no foreign
// key, so they are cleared here.
export async function deleteEntity(campaignId: string, entityId: string): Promise<void> {
  const pool = await getMainConnection();
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const result = await transaction.request().input("entityId", entityId).input("campaignId", campaignId).query(`
      DELETE FROM oracle_entities WHERE id = @entityId AND campaign_id = @campaignId
    `);
    if (result.rowsAffected[0] === 0) {
      throw new OracleError(404, "Entry not found");
    }
    await transaction.request().input("entityId", entityId).input("campaignId", campaignId).query(`
      UPDATE oracle_events SET entity_id = NULL WHERE campaign_id = @campaignId AND entity_id = @entityId;
      UPDATE oracle_campaigns
      SET panel_kind = CASE WHEN panel_entity_id = @entityId THEN NULL ELSE panel_kind END,
          panel_entity_id = CASE WHEN panel_entity_id = @entityId THEN NULL ELSE panel_entity_id END,
          version = version + 1
      WHERE id = @campaignId;
    `);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

// Reveal a fact to the players. Re-sending the same fact for the same entity returns the
// existing row, so a double-tap on Reveal cannot add it twice.
export async function addKnowledge(
  campaignId: string,
  entityId: string,
  fact: string,
  skill: string | null,
  tier: KnowledgeTier | null
): Promise<Knowledge> {
  const pool = await getMainConnection();
  const owner = await pool.request().input("entityId", entityId).input("campaignId", campaignId).query(`
    SELECT 1 AS found FROM oracle_entities WHERE id = @entityId AND campaign_id = @campaignId
  `);
  if (owner.recordset.length === 0) {
    throw new OracleError(404, "Entry not found");
  }

  const result = await pool
    .request()
    .input("entityId", entityId)
    .input("fact", fact)
    .input("skill", skill)
    .input("tier", tier)
    .query(`
      INSERT INTO oracle_knowledge (entity_id, fact, skill, tier)
      OUTPUT INSERTED.id, INSERTED.entity_id, INSERTED.fact, INSERTED.skill, INSERTED.tier, INSERTED.ts_created
      SELECT @entityId, @fact, @skill, @tier
      WHERE NOT EXISTS (SELECT 1 FROM oracle_knowledge WHERE entity_id = @entityId AND fact = @fact)
    `);
  if (result.recordset.length === 0) {
    const existing = await pool.request().input("entityId", entityId).input("fact", fact).query(`
      SELECT TOP 1 id, entity_id, fact, skill, tier, ts_created FROM oracle_knowledge WHERE entity_id = @entityId AND fact = @fact
    `);
    return toKnowledge(existing.recordset[0]);
  }
  await bumpVersion(campaignId);
  return toKnowledge(result.recordset[0]);
}

export async function deleteKnowledge(campaignId: string, entityId: string, knowledgeId: string): Promise<void> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("knowledgeId", knowledgeId)
    .input("entityId", entityId)
    .input("campaignId", campaignId)
    .query(`
      DELETE k
      FROM oracle_knowledge k
      INNER JOIN oracle_entities e ON e.id = k.entity_id
      WHERE k.id = @knowledgeId AND k.entity_id = @entityId AND e.campaign_id = @campaignId
    `);
  if (result.rowsAffected[0] === 0) {
    throw new OracleError(404, "Fact not found");
  }
  await bumpVersion(campaignId);
}
