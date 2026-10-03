import { getMainConnection } from "@/lib/db";
import type { BuiltCast } from "../types/oracle";
import { MAX_ENTITIES } from "./constants";
import { OracleError } from "./errors";
import { findChallengeRow, statBlockFromChallenge } from "./reference";

// Save an accepted "build cast" proposal in one transaction: either every entry lands, or none
// does. An entry whose name is already in the campaign is skipped, so applying the same proposal
// twice adds nothing the second time.
export async function applyBuiltCast(campaignId: string, built: BuiltCast): Promise<void> {
  const pool = await getMainConnection();
  const transaction = pool.transaction();
  await transaction.begin();
  try {
    const counts = await transaction.request().input("campaignId", campaignId).query(`
      SELECT (SELECT COUNT(*) FROM oracle_entities WITH (UPDLOCK) WHERE campaign_id = @campaignId) AS entities
    `);
    const existingNames = await transaction.request().input("campaignId", campaignId).query(`
      SELECT name FROM oracle_entities WHERE campaign_id = @campaignId
    `);
    const names = new Set<string>(existingNames.recordset.map((row) => String(row.name).toLowerCase()));
    const newEntities = built.entities.filter((entity) => !names.has(entity.name.toLowerCase()));
    if (counts.recordset[0].entities + newEntities.length > MAX_ENTITIES) {
      throw new OracleError(409, `A campaign can have at most ${MAX_ENTITIES} entries`);
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
        .input("source", entity.source)
        .query(`
          INSERT INTO oracle_entities (campaign_id, kind, name, details, attitude, stats, dm_notes, source)
          VALUES (@campaignId, @kind, @name, @details, @attitude, @stats, @dmNotes, @source)
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
