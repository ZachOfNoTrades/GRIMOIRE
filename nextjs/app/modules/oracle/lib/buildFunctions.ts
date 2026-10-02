import { getMainConnection } from "@/lib/db";
import type { BuiltSession } from "../types/oracle";
import { MAX_ENTITIES, MAX_SCENES } from "./constants";
import { OracleError } from "./errors";
import { findChallengeRow, statBlockFromChallenge } from "./reference";

// Save an accepted "build session" proposal in one transaction: either every scene and entry
// lands, or none does. Scenes go after the existing ones. An entry whose name is already in the
// campaign is skipped, so applying the same proposal twice adds nothing the second time.
export async function applyBuiltSession(campaignId: string, built: BuiltSession): Promise<void> {
  const pool = await getMainConnection();
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const counts = await transaction.request().input("campaignId", campaignId).query(`
      SELECT (SELECT COUNT(*) FROM oracle_scenes WITH (UPDLOCK) WHERE campaign_id = @campaignId) AS scenes,
             (SELECT ISNULL(MAX(sort_order), 0) FROM oracle_scenes WHERE campaign_id = @campaignId) AS last_order,
             (SELECT COUNT(*) FROM oracle_entities WITH (UPDLOCK) WHERE campaign_id = @campaignId) AS entities
    `);
    const existingTitles = await transaction.request().input("campaignId", campaignId).query(`
      SELECT title FROM oracle_scenes WHERE campaign_id = @campaignId
    `);
    const existingNames = await transaction.request().input("campaignId", campaignId).query(`
      SELECT name FROM oracle_entities WHERE campaign_id = @campaignId
    `);
    const titles = new Set<string>(existingTitles.recordset.map((row) => String(row.title).toLowerCase()));
    const names = new Set<string>(existingNames.recordset.map((row) => String(row.name).toLowerCase()));

    const newScenes = built.scenes.filter((scene) => !titles.has(scene.title.toLowerCase()));
    const newEntities = built.entities.filter((entity) => !names.has(entity.name.toLowerCase()));
    if (counts.recordset[0].scenes + newScenes.length > MAX_SCENES) {
      throw new OracleError(409, `A campaign can have at most ${MAX_SCENES} scenes`);
    }
    if (counts.recordset[0].entities + newEntities.length > MAX_ENTITIES) {
      throw new OracleError(409, `A campaign can have at most ${MAX_ENTITIES} entries`);
    }

    let sortOrder: number = counts.recordset[0].last_order;
    for (const scene of newScenes) {
      sortOrder += 10;
      await transaction
        .request()
        .input("campaignId", campaignId)
        .input("title", scene.title)
        .input("summary", scene.summary)
        .input("sortOrder", sortOrder)
        .query(`INSERT INTO oracle_scenes (campaign_id, title, summary, sort_order) VALUES (@campaignId, @title, @summary, @sortOrder)`);
    }

    for (const entity of newEntities) {
      const row = entity.kind === "creature" ? findChallengeRow(entity.cr) : null;
      await transaction
        .request()
        .input("campaignId", campaignId)
        .input("kind", entity.kind)
        .input("name", entity.name)
        .input("details", entity.details)
        .input("attitude", entity.attitude)
        .input("stats", row ? JSON.stringify(statBlockFromChallenge(row)) : null)
        .input("dmNotes", entity.dm_notes)
        .query(`
          INSERT INTO oracle_entities (campaign_id, kind, name, details, attitude, stats, dm_notes)
          VALUES (@campaignId, @kind, @name, @details, @attitude, @stats, @dmNotes)
        `);
    }

    await transaction.request().input("campaignId", campaignId).query(`
      UPDATE oracle_campaigns SET ts_updated = GETDATE() WHERE id = @campaignId
    `);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}
