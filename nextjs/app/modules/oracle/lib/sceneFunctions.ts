import { getMainConnection } from "@/lib/db";
import type { OracleScene } from "../types/oracle";
import { MAX_SCENES } from "./constants";
import { OracleError } from "./errors";

type SceneRow = { id: string; sort_order: number; title: string; summary: string; is_done: boolean };

export function toScene(row: SceneRow): OracleScene {
  return {
    id: row.id.toLowerCase(),
    sort_order: row.sort_order,
    title: row.title,
    summary: row.summary,
    is_done: !!row.is_done,
  };
}

export async function listScenes(campaignId: string): Promise<OracleScene[]> {
  const pool = await getMainConnection();
  const result = await pool.request().input("campaignId", campaignId).query(`
    SELECT id, sort_order, title, summary, is_done
    FROM oracle_scenes
    WHERE campaign_id = @campaignId
    ORDER BY sort_order, ts_created
  `);
  return result.recordset.map(toScene);
}

// New scenes go to the end of the list.
export async function createScene(campaignId: string, title: string, summary: string): Promise<OracleScene> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("campaignId", campaignId)
    .input("title", title)
    .input("summary", summary)
    .input("maxScenes", MAX_SCENES)
    .query(`
      INSERT INTO oracle_scenes (campaign_id, title, summary, sort_order)
      OUTPUT INSERTED.id, INSERTED.sort_order, INSERTED.title, INSERTED.summary, INSERTED.is_done
      SELECT @campaignId, @title, @summary, ISNULL(MAX(sort_order), 0) + 10
      FROM oracle_scenes
      WHERE campaign_id = @campaignId
      HAVING COUNT(*) < @maxScenes
    `);
  if (result.recordset.length === 0) {
    throw new OracleError(409, `A campaign can have at most ${MAX_SCENES} scenes`);
  }
  return toScene(result.recordset[0]);
}

export async function updateScene(
  campaignId: string,
  sceneId: string,
  patch: { title?: string; summary?: string; is_done?: boolean; sort_order?: number }
): Promise<OracleScene> {
  const pool = await getMainConnection();
  const request = pool.request().input("sceneId", sceneId).input("campaignId", campaignId);
  const updateFields: string[] = [];

  if (patch.title !== undefined) {
    updateFields.push("title = @title");
    request.input("title", patch.title);
  }
  if (patch.summary !== undefined) {
    updateFields.push("summary = @summary");
    request.input("summary", patch.summary);
  }
  if (patch.is_done !== undefined) {
    updateFields.push("is_done = @isDone");
    request.input("isDone", patch.is_done ? 1 : 0);
  }
  if (patch.sort_order !== undefined) {
    updateFields.push("sort_order = @sortOrder");
    request.input("sortOrder", patch.sort_order);
  }
  updateFields.push("ts_updated = GETDATE()");

  const result = await request.query(`
    UPDATE oracle_scenes
    SET ${updateFields.join(", ")}
    OUTPUT INSERTED.id, INSERTED.sort_order, INSERTED.title, INSERTED.summary, INSERTED.is_done
    WHERE id = @sceneId AND campaign_id = @campaignId
  `);
  if (result.recordset.length === 0) {
    throw new OracleError(404, "Scene not found");
  }
  return toScene(result.recordset[0]);
}

// The campaign's current-scene pointer has no foreign key, so it is cleared here.
export async function deleteScene(campaignId: string, sceneId: string): Promise<void> {
  const pool = await getMainConnection();
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const result = await transaction.request().input("sceneId", sceneId).input("campaignId", campaignId).query(`
      DELETE FROM oracle_scenes WHERE id = @sceneId AND campaign_id = @campaignId
    `);
    if (result.rowsAffected[0] === 0) {
      throw new OracleError(404, "Scene not found");
    }
    await transaction.request().input("sceneId", sceneId).input("campaignId", campaignId).query(`
      UPDATE oracle_campaigns SET current_scene_id = NULL WHERE id = @campaignId AND current_scene_id = @sceneId
    `);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}
