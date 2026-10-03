import { getMainConnection } from "@/lib/db";
import type { ExploredCircle, MapData, OracleMap, PictureRect } from "../types/oracle";
import { MAX_MAPS, MAX_UNDO, VISION_DEFAULT, type ScaleUnit } from "./constants";
import { bumpVersion } from "./campaignFunctions";
import { OracleError } from "./errors";
import { blankMapData, coerceExplored, coerceMapData, parseJson } from "./mapData";

const MAP_COLUMNS = "id, name, data, undo_stack, party_x, party_y, vision_radius, explored, background_image_id";

type MapRow = {
  id: string;
  name: string;
  data: string;
  undo_stack: string;
  party_x: number;
  party_y: number;
  vision_radius: number;
  explored: string;
  background_image_id: string | null;
};

export function toMap(row: MapRow): OracleMap {
  const undoStack = parseJson<unknown[]>(row.undo_stack, []);
  return {
    id: row.id.toLowerCase(),
    name: row.name,
    data: coerceMapData(parseJson<unknown>(row.data, null)),
    can_undo: Array.isArray(undoStack) && undoStack.length > 0,
    party_x: row.party_x,
    party_y: row.party_y,
    vision_radius: row.vision_radius,
    explored: coerceExplored(parseJson<unknown>(row.explored, [])),
    background_image_id: row.background_image_id ? String(row.background_image_id).toLowerCase() : null,
  };
}

export async function listMaps(campaignId: string): Promise<OracleMap[]> {
  const pool = await getMainConnection();
  const result = await pool.request().input("campaignId", campaignId).query(`
    SELECT ${MAP_COLUMNS} FROM oracle_maps WHERE campaign_id = @campaignId ORDER BY ts_created
  `);
  return result.recordset.map(toMap);
}

export async function getMap(campaignId: string, mapId: string): Promise<OracleMap> {
  const pool = await getMainConnection();
  const result = await pool.request().input("mapId", mapId).input("campaignId", campaignId).query(`
    SELECT ${MAP_COLUMNS} FROM oracle_maps WHERE id = @mapId AND campaign_id = @campaignId
  `);
  if (result.recordset.length === 0) {
    throw new OracleError(404, "Map not found");
  }
  return toMap(result.recordset[0]);
}

// A new map starts with the party in the middle and only that spot explored.
export async function createMap(campaignId: string, name: string, data: MapData | null): Promise<OracleMap> {
  const mapData = data ?? blankMapData();
  const partyX = mapData.width / 2;
  const partyY = mapData.height / 2;
  const explored: ExploredCircle[] = [{ x: Math.round(partyX), y: Math.round(partyY), r: VISION_DEFAULT }];

  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("campaignId", campaignId)
    .input("name", name)
    .input("data", JSON.stringify(mapData))
    .input("partyX", partyX)
    .input("partyY", partyY)
    .input("explored", JSON.stringify(explored))
    .input("maxMaps", MAX_MAPS)
    .query(`
      INSERT INTO oracle_maps (campaign_id, name, data, party_x, party_y, explored)
      OUTPUT ${MAP_COLUMNS.split(",").map((column) => `INSERTED.${column.trim()}`).join(", ")}
      SELECT @campaignId, @name, @data, @partyX, @partyY, @explored
      WHERE (SELECT COUNT(*) FROM oracle_maps WHERE campaign_id = @campaignId) < @maxMaps
    `);
  if (result.recordset.length === 0) {
    throw new OracleError(409, `A campaign can have at most ${MAX_MAPS} maps`);
  }
  const map = toMap(result.recordset[0]);
  // The campaign's first map goes straight on the table.
  await pool.request().input("campaignId", campaignId).input("mapId", map.id).query(`
    UPDATE oracle_campaigns SET active_map_id = @mapId, version = version + 1 WHERE id = @campaignId AND active_map_id IS NULL
  `);
  return map;
}

export interface MapPatch {
  name?: string;
  party_x?: number;
  party_y?: number;
  vision_radius?: number;
  explored?: ExploredCircle[];
  background_image_id?: string | null;
  // Held inside the map's data; changing them does not touch the features or the undo stack.
  description?: string;
  scale_value?: number;
  scale_unit?: ScaleUnit;
  background?: PictureRect | null;
}

// Party position, vision and the explored area. All of it is visible to the players, so the
// display version moves with it.
export async function updateMap(campaignId: string, mapId: string, patch: MapPatch): Promise<OracleMap> {
  const pool = await getMainConnection();
  const request = pool.request().input("mapId", mapId).input("campaignId", campaignId);
  const updateFields: string[] = [];

  if (patch.name !== undefined) {
    updateFields.push("name = @name");
    request.input("name", patch.name);
  }
  if (patch.party_x !== undefined) {
    updateFields.push("party_x = @partyX");
    request.input("partyX", patch.party_x);
  }
  if (patch.party_y !== undefined) {
    updateFields.push("party_y = @partyY");
    request.input("partyY", patch.party_y);
  }
  if (patch.vision_radius !== undefined) {
    updateFields.push("vision_radius = @visionRadius");
    request.input("visionRadius", patch.vision_radius);
  }
  if (patch.explored !== undefined) {
    updateFields.push("explored = @explored");
    request.input("explored", JSON.stringify(coerceExplored(patch.explored)));
  }
  if (patch.background_image_id !== undefined) {
    if (patch.background_image_id !== null) {
      const image = await pool.request().input("id", patch.background_image_id).input("campaignId", campaignId).query(`
        SELECT 1 AS found FROM oracle_images WHERE id = @id AND campaign_id = @campaignId
      `);
      if (image.recordset.length === 0) throw new OracleError(404, "Picture not found");
    }
    updateFields.push("background_image_id = @backgroundImageId");
    request.input("backgroundImageId", patch.background_image_id);
  }
  if (patch.description !== undefined || patch.scale_value !== undefined || patch.scale_unit !== undefined || patch.background !== undefined) {
    const row = await pool.request().input("mapId", mapId).input("campaignId", campaignId).query(`
      SELECT data FROM oracle_maps WHERE id = @mapId AND campaign_id = @campaignId
    `);
    if (row.recordset.length === 0) throw new OracleError(404, "Map not found");
    const current = coerceMapData(parseJson<unknown>(row.recordset[0].data, null));
    const next = coerceMapData({
      ...current,
      description: patch.description ?? current.description,
      scale_value: patch.scale_value ?? current.scale_value,
      scale_unit: patch.scale_unit ?? current.scale_unit,
      background: patch.background === undefined ? current.background : patch.background,
    });
    updateFields.push("data = @data");
    request.input("data", JSON.stringify(next));
  }
  updateFields.push("ts_updated = GETDATE()");

  const result = await request.query(`
    UPDATE oracle_maps
    SET ${updateFields.join(", ")}
    OUTPUT ${MAP_COLUMNS.split(",").map((column) => `INSERTED.${column.trim()}`).join(", ")}
    WHERE id = @mapId AND campaign_id = @campaignId
  `);
  if (result.recordset.length === 0) {
    throw new OracleError(404, "Map not found");
  }
  await bumpVersion(campaignId);
  return toMap(result.recordset[0]);
}

// Replace the map's features, keeping the previous version on the undo stack. Read and write
// happen under an update lock so two edits cannot both push the same "previous" version.
export async function replaceMapData(campaignId: string, mapId: string, data: MapData): Promise<OracleMap> {
  const pool = await getMainConnection();
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const current = await transaction.request().input("mapId", mapId).input("campaignId", campaignId).query(`
      SELECT data, undo_stack FROM oracle_maps WITH (UPDLOCK, ROWLOCK) WHERE id = @mapId AND campaign_id = @campaignId
    `);
    if (current.recordset.length === 0) {
      throw new OracleError(404, "Map not found");
    }
    const undoStack = parseJson<string[]>(current.recordset[0].undo_stack, []);
    const nextStack = [...(Array.isArray(undoStack) ? undoStack : []), current.recordset[0].data].slice(-MAX_UNDO);

    const result = await transaction
      .request()
      .input("mapId", mapId)
      .input("data", JSON.stringify(data))
      .input("undoStack", JSON.stringify(nextStack))
      .query(`
        UPDATE oracle_maps
        SET data = @data, undo_stack = @undoStack, ts_updated = GETDATE()
        OUTPUT ${MAP_COLUMNS.split(",").map((column) => `INSERTED.${column.trim()}`).join(", ")}
        WHERE id = @mapId
      `);
    await transaction.commit();
    await bumpVersion(campaignId);
    return toMap(result.recordset[0]);
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

// Put back the version before the last change.
export async function undoMapData(campaignId: string, mapId: string): Promise<OracleMap> {
  const pool = await getMainConnection();
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const current = await transaction.request().input("mapId", mapId).input("campaignId", campaignId).query(`
      SELECT undo_stack FROM oracle_maps WITH (UPDLOCK, ROWLOCK) WHERE id = @mapId AND campaign_id = @campaignId
    `);
    if (current.recordset.length === 0) {
      throw new OracleError(404, "Map not found");
    }
    const undoStack = parseJson<string[]>(current.recordset[0].undo_stack, []);
    if (!Array.isArray(undoStack) || undoStack.length === 0) {
      throw new OracleError(409, "Nothing to undo");
    }
    const previous = undoStack[undoStack.length - 1];

    const result = await transaction
      .request()
      .input("mapId", mapId)
      .input("data", previous)
      .input("undoStack", JSON.stringify(undoStack.slice(0, -1)))
      .query(`
        UPDATE oracle_maps
        SET data = @data, undo_stack = @undoStack, ts_updated = GETDATE()
        OUTPUT ${MAP_COLUMNS.split(",").map((column) => `INSERTED.${column.trim()}`).join(", ")}
        WHERE id = @mapId
      `);
    await transaction.commit();
    await bumpVersion(campaignId);
    return toMap(result.recordset[0]);
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

// Entities placed on the deleted map are unplaced, and if it was the active map the oldest
// remaining one takes over (or none, when it was the last).
export async function deleteMap(campaignId: string, mapId: string): Promise<void> {
  const pool = await getMainConnection();
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const result = await transaction.request().input("mapId", mapId).input("campaignId", campaignId).query(`
      DELETE FROM oracle_maps WHERE id = @mapId AND campaign_id = @campaignId
    `);
    if (result.rowsAffected[0] === 0) {
      throw new OracleError(404, "Map not found");
    }
    await transaction.request().input("mapId", mapId).input("campaignId", campaignId).query(`
      UPDATE oracle_entities SET map_id = NULL, map_x = NULL, map_y = NULL WHERE campaign_id = @campaignId AND map_id = @mapId;
      UPDATE oracle_campaigns
      SET active_map_id = (SELECT TOP 1 id FROM oracle_maps WHERE campaign_id = @campaignId ORDER BY ts_created),
          version = version + 1
      WHERE id = @campaignId AND active_map_id = @mapId;
    `);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}
