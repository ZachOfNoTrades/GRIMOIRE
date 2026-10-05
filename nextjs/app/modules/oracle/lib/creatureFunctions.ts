import { getMainConnection } from "@/lib/db";
import type { StatBlock } from "../types/oracle";
import { parseJson } from "./mapData";

// THE CREATURE LIBRARY — creatures a DM can bring into a campaign, kept once for everyone rather
// than per campaign.
//
// `official_source` names the published book a creature comes from and is the whole test of
// whether it is official. The library is seeded from the SRD, which is published under CC BY and
// is the only material that can be shipped; a creature written by hand or by the AI leaves the
// source empty and is homebrew. The DM's notes are not an official source either: they describe
// a campaign, they do not publish a creature.
export interface LibraryCreature {
  id: string;
  slug: string;
  name: string;
  official_source: string | null;
  license_url: string | null;
  source_url: string | null; // the creature's own page in that source
  size: string | null;
  creature_type: string | null;
  alignment: string | null;
  cr: string;
  details: string | null;
  stats: StatBlock | null;
}

const COLUMNS = "id, slug, name, official_source, license_url, source_url, size, creature_type, alignment, cr, details, stats";

interface Row {
  id: string;
  slug: string;
  name: string;
  official_source: string | null;
  license_url: string | null;
  source_url: string | null;
  size: string | null;
  creature_type: string | null;
  alignment: string | null;
  cr: string;
  details: string | null;
  stats: string | null;
}

const toCreature = (row: Row): LibraryCreature => ({
  id: String(row.id).toLowerCase(),
  slug: row.slug,
  name: row.name,
  official_source: row.official_source,
  license_url: row.license_url,
  source_url: row.source_url,
  size: row.size,
  creature_type: row.creature_type,
  alignment: row.alignment,
  cr: row.cr,
  details: row.details,
  stats: parseJson<StatBlock | null>(row.stats, null),
});

/**
 * Creatures whose name matches `query`, the DM's own alongside the shared library. A name that
 * starts with the query comes first, so typing "gi" offers Giant crab before Hill giant.
 */
export async function searchCreatures(userId: string, query: string, limit = 30): Promise<LibraryCreature[]> {
  const needle = query.trim().slice(0, 60);
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("userId", userId)
    .input("like", `%${needle.replace(/[%_[]/g, (match) => `[${match}]`)}%`)
    .input("starts", `${needle.replace(/[%_[]/g, (match) => `[${match}]`)}%`)
    .input("limit", limit)
    .query(`
      SELECT TOP (@limit) ${COLUMNS}
      FROM oracle_creatures
      WHERE (user_id IS NULL OR user_id = @userId)
        AND (@like = '%%' OR name LIKE @like)
      ORDER BY CASE WHEN name LIKE @starts THEN 0 ELSE 1 END, name
    `);
  return result.recordset.map(toCreature);
}

export async function getCreature(userId: string, id: string): Promise<LibraryCreature | null> {
  const pool = await getMainConnection();
  const result = await pool.request().input("userId", userId).input("id", id).query(`
    SELECT ${COLUMNS} FROM oracle_creatures WHERE id = @id AND (user_id IS NULL OR user_id = @userId)
  `);
  return result.recordset.length > 0 ? toCreature(result.recordset[0]) : null;
}
