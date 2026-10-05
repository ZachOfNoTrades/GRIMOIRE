import { getMainConnection } from "@/lib/db";
import type { StatBlock } from "../types/oracle";
import { parseJson } from "./mapData";
import { makeSearchRanker } from "@/lib/searchMatch";

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
 * Creatures matching `query`, the DM's own alongside the shared library.
 *
 * Matched the way every other list in the app is: each word must appear somewhere, in any order,
 * with punctuation and unit spellings normalized, so "crab giant" finds the Giant Crab. The
 * library is a few hundred rows, so it is read once and matched here rather than with a SQL LIKE,
 * which could only do a literal phrase.
 *
 * A name that begins with what was typed comes first, so "gi" offers Giant Crab before Hill Giant.
 */
export async function searchCreatures(userId: string, query: string, limit = 30): Promise<LibraryCreature[]> {
  const pool = await getMainConnection();
  const result = await pool.request().input("userId", userId).query(`
    SELECT ${COLUMNS} FROM oracle_creatures WHERE user_id IS NULL OR user_id = @userId ORDER BY name
  `);
  const creatures = result.recordset.map(toCreature);

  const needle = query.trim();
  if (!needle) return creatures.slice(0, limit);

  // Closeness to the query sets the order: an exact name first, then names that begin with it,
  // and only then a match on the type or size or a near miss ("orin" finding "Orrin").
  const rank = makeSearchRanker(needle);
  const score = (creature: LibraryCreature) => {
    const onName = rank(creature.name);
    return onName > 0 ? onName * 2 : rank(`${creature.creature_type ?? ""} ${creature.size ?? ""}`);
  };
  return creatures
    .map((creature) => ({ creature, score: score(creature) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.creature.name.localeCompare(b.creature.name))
    .slice(0, limit)
    .map((row) => row.creature);
}

export async function getCreature(userId: string, id: string): Promise<LibraryCreature | null> {
  const pool = await getMainConnection();
  const result = await pool.request().input("userId", userId).input("id", id).query(`
    SELECT ${COLUMNS} FROM oracle_creatures WHERE id = @id AND (user_id IS NULL OR user_id = @userId)
  `);
  return result.recordset.length > 0 ? toCreature(result.recordset[0]) : null;
}
