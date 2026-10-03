import { randomInt } from "crypto";
import { rm } from "fs/promises";
import path from "path";
import { getMainConnection } from "@/lib/db";
import type { CampaignSummary, OracleCampaign, PanelKind } from "../types/oracle";
import { DISPLAY_CODE_ALPHABET, DISPLAY_CODE_LENGTH, MAX_CAMPAIGNS } from "./constants";
import { OracleError, isUniqueViolation } from "./errors";

export const UPLOAD_ROOT = path.join(process.cwd(), "storage", "oracle-uploads");

const CAMPAIGN_COLUMNS = `id, user_id, name, world, display_code, current_session_id, active_map_id,
  panel_kind, panel_entity_id, panel_image_id, display_blank, chips_paused, version`;

type CampaignRow = {
  id: string;
  user_id: string;
  name: string;
  world: string;
  display_code: string;
  current_session_id: string | null;
  active_map_id: string | null;
  panel_kind: PanelKind | null;
  panel_entity_id: string | null;
  panel_image_id: string | null;
  display_blank: boolean;
  chips_paused: boolean;
  version: number;
};

export function normalizeId(value: string | null): string | null {
  return value ? value.toLowerCase() : null;
}

function toCampaign(row: CampaignRow): OracleCampaign {
  return {
    id: row.id.toLowerCase(),
    name: row.name,
    world: row.world,
    display_code: row.display_code,
    current_session_id: normalizeId(row.current_session_id),
    active_map_id: normalizeId(row.active_map_id),
    panel_kind: row.panel_kind,
    panel_entity_id: normalizeId(row.panel_entity_id),
    panel_image_id: normalizeId(row.panel_image_id),
    display_blank: !!row.display_blank,
    chips_paused: !!row.chips_paused,
    version: row.version,
  };
}

function generateDisplayCode(): string {
  let code = "";
  for (let index = 0; index < DISPLAY_CODE_LENGTH; index += 1) {
    code += DISPLAY_CODE_ALPHABET[randomInt(DISPLAY_CODE_ALPHABET.length)];
  }
  return code;
}

export async function listCampaigns(userId: string): Promise<CampaignSummary[]> {
  const pool = await getMainConnection();
  const result = await pool.request().input("userId", userId).query(`
    SELECT c.id, c.name, c.display_code, c.ts_updated,
           (SELECT COUNT(*) FROM oracle_sessions s WHERE s.campaign_id = c.id) AS session_count
    FROM oracle_campaigns c
    WHERE c.user_id = @userId
    ORDER BY c.ts_updated DESC
  `);

  if (result.recordset.length === 0) {
    console.warn(`No oracle campaigns found for user id: '${userId}'`);
  }

  return result.recordset.map((row) => ({
    id: String(row.id).toLowerCase(),
    name: row.name,
    display_code: row.display_code,
    session_count: row.session_count,
    ts_updated: new Date(row.ts_updated).toISOString(),
  }));
}

// A new campaign starts empty: no map until one is made on the Prep tab. The
// per-user application lock makes the count check and the insert atomic, so a double-click
// cannot create two campaigns.
export async function createCampaign(userId: string, name: string): Promise<OracleCampaign> {
  const pool = await getMainConnection();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const transaction = pool.transaction();
    await transaction.begin();
    try {
      await transaction.request().input("resource", `oracle-campaign-${userId}`).query(`
        EXEC sp_getapplock @Resource = @resource, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 5000
      `);

      const existing = await transaction.request().input("userId", userId).input("name", name).query(`
        SELECT COUNT(*) AS total, SUM(CASE WHEN name = @name THEN 1 ELSE 0 END) AS same_name
        FROM oracle_campaigns WHERE user_id = @userId
      `);
      if (existing.recordset[0].total >= MAX_CAMPAIGNS) {
        throw new OracleError(409, `You can have at most ${MAX_CAMPAIGNS} campaigns`);
      }
      if ((existing.recordset[0].same_name ?? 0) > 0) {
        throw new OracleError(409, "A campaign with that name already exists");
      }

      const created = await transaction
        .request()
        .input("userId", userId)
        .input("name", name)
        .input("code", generateDisplayCode())
        .query(`
          INSERT INTO oracle_campaigns (user_id, name, display_code)
          OUTPUT ${CAMPAIGN_COLUMNS.split(",").map((column) => `INSERTED.${column.trim()}`).join(", ")}
          VALUES (@userId, @name, @code)
        `);

      await transaction.commit();
      return toCampaign(created.recordset[0]);
    } catch (error) {
      await transaction.rollback().catch(() => undefined);
      // A display-code collision is the only retryable failure.
      if (isUniqueViolation(error) && attempt < 4) continue;
      throw error;
    }
  }
  throw new OracleError(500, "Couldn't create the campaign");
}

// Ownership check used by every DM route. A campaign that belongs to someone else is reported
// exactly like one that does not exist.
export async function requireOwnedCampaign(userId: string, campaignId: string): Promise<OracleCampaign> {
  const pool = await getMainConnection();
  const result = await pool.request().input("campaignId", campaignId).input("userId", userId).query(`
    SELECT ${CAMPAIGN_COLUMNS} FROM oracle_campaigns WHERE id = @campaignId AND user_id = @userId
  `);
  if (result.recordset.length === 0) {
    throw new OracleError(404, "Campaign not found");
  }
  return toCampaign(result.recordset[0]);
}

export async function getCampaign(campaignId: string): Promise<OracleCampaign> {
  const pool = await getMainConnection();
  const result = await pool.request().input("campaignId", campaignId).query(`
    SELECT ${CAMPAIGN_COLUMNS} FROM oracle_campaigns WHERE id = @campaignId
  `);
  if (result.recordset.length === 0) {
    throw new OracleError(404, `No campaign found for id: '${campaignId}'`);
  }
  return toCampaign(result.recordset[0]);
}

// Bumps the campaign's display version. Called by every write the player display can see; the
// display polls this number and only refetches when it moves.
export async function bumpVersion(campaignId: string): Promise<void> {
  const pool = await getMainConnection();
  await pool.request().input("campaignId", campaignId).query(`
    UPDATE oracle_campaigns SET version = version + 1, ts_updated = GETDATE() WHERE id = @campaignId
  `);
}

export interface CampaignPatch {
  name?: string;
  world?: string;
  current_session_id?: string | null;
  active_map_id?: string | null;
  chips_paused?: boolean;
}

export async function updateCampaign(userId: string, campaignId: string, patch: CampaignPatch): Promise<OracleCampaign> {
  const pool = await getMainConnection();
  const request = pool.request().input("campaignId", campaignId);
  const updateFields: string[] = [];

  if (patch.name !== undefined) {
    const clash = await pool.request().input("userId", userId).input("campaignId", campaignId).input("name", patch.name).query(`
      SELECT 1 AS found FROM oracle_campaigns WHERE user_id = @userId AND name = @name AND id <> @campaignId
    `);
    if (clash.recordset.length > 0) throw new OracleError(409, "A campaign with that name already exists");
    updateFields.push("name = @name");
    request.input("name", patch.name);
  }
  if (patch.world !== undefined) {
    updateFields.push("world = @world");
    request.input("world", patch.world);
  }
  if (patch.chips_paused !== undefined) {
    updateFields.push("chips_paused = @chipsPaused");
    request.input("chipsPaused", patch.chips_paused ? 1 : 0);
  }
  if (patch.current_session_id !== undefined) {
    if (patch.current_session_id !== null) {
      const session = await pool.request().input("id", patch.current_session_id).input("campaignId", campaignId).query(`
        SELECT 1 AS found FROM oracle_sessions WHERE id = @id AND campaign_id = @campaignId
      `);
      if (session.recordset.length === 0) throw new OracleError(404, "Session not found");
    }
    updateFields.push("current_session_id = @sessionId");
    request.input("sessionId", patch.current_session_id);
  }
  if (patch.active_map_id !== undefined) {
    if (patch.active_map_id !== null) {
      const map = await pool.request().input("id", patch.active_map_id).input("campaignId", campaignId).query(`
        SELECT 1 AS found FROM oracle_maps WHERE id = @id AND campaign_id = @campaignId
      `);
      if (map.recordset.length === 0) throw new OracleError(404, "Map not found");
    }
    // Switching the map changes what the players see.
    updateFields.push("active_map_id = @mapId", "version = version + 1");
    request.input("mapId", patch.active_map_id);
  }

  updateFields.push("ts_updated = GETDATE()");
  const result = await request.query(`
    UPDATE oracle_campaigns
    SET ${updateFields.join(", ")}
    OUTPUT ${CAMPAIGN_COLUMNS.split(",").map((column) => `INSERTED.${column.trim()}`).join(", ")}
    WHERE id = @campaignId
  `);
  if (result.recordset.length === 0) {
    throw new OracleError(404, "Campaign not found");
  }
  return toCampaign(result.recordset[0]);
}

// What the player display's right-hand panel shows, and whether the display is blanked.
export async function setDisplay(
  campaignId: string,
  change: { panel_kind?: PanelKind | null; panel_id?: string | null; blank?: boolean }
): Promise<OracleCampaign> {
  const pool = await getMainConnection();
  const request = pool.request().input("campaignId", campaignId);
  const updateFields: string[] = ["version = version + 1", "ts_updated = GETDATE()"];

  if (change.panel_kind !== undefined) {
    const kind = change.panel_kind;
    const panelId = change.panel_id ?? null;
    if (kind !== null) {
      if (!panelId) throw new OracleError(400, "Choose what to show");
      const table = kind === "entity" ? "oracle_entities" : "oracle_images";
      const target = await pool.request().input("id", panelId).input("campaignId", campaignId).query(`
        SELECT 1 AS found FROM ${table} WHERE id = @id AND campaign_id = @campaignId
      `);
      if (target.recordset.length === 0) throw new OracleError(404, kind === "entity" ? "Entry not found" : "Image not found");
    }
    updateFields.push("panel_kind = @kind", "panel_entity_id = @entityId", "panel_image_id = @imageId");
    request.input("kind", kind);
    request.input("entityId", kind === "entity" ? panelId : null);
    request.input("imageId", kind === "image" ? panelId : null);
  }
  if (change.blank !== undefined) {
    updateFields.push("display_blank = @blank");
    request.input("blank", change.blank ? 1 : 0);
  }

  const result = await request.query(`
    UPDATE oracle_campaigns
    SET ${updateFields.join(", ")}
    OUTPUT ${CAMPAIGN_COLUMNS.split(",").map((column) => `INSERTED.${column.trim()}`).join(", ")}
    WHERE id = @campaignId
  `);
  if (result.recordset.length === 0) {
    throw new OracleError(404, "Campaign not found");
  }
  return toCampaign(result.recordset[0]);
}

// Deleting the campaign row cascades to every table under it; the uploaded files go with it.
export async function deleteCampaign(campaignId: string): Promise<void> {
  const pool = await getMainConnection();
  const result = await pool.request().input("campaignId", campaignId).query(`
    DELETE FROM oracle_campaigns WHERE id = @campaignId
  `);
  if (result.rowsAffected[0] === 0) {
    throw new OracleError(404, "Campaign not found");
  }
  await rm(path.join(UPLOAD_ROOT, campaignId), { recursive: true, force: true }).catch((error) => {
    console.error(`Couldn't remove uploads for campaign id: '${campaignId}'`, error);
  });
}
