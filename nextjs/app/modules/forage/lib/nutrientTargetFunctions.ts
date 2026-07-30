import sql from 'mssql';
import { getFoodConnection, closeFoodConnection } from './db';
import { listNutrients, getNutrientById } from './nutrientFunctions';
import { getActiveProgram } from './programFunctions';
import { ResolvedNutrientTarget } from '../types/food';

// Thrown when a write is attempted with no active program to attach the override
// to. The API maps this to a 409 (overrides live ON a program — set one first).
export const NO_ACTIVE_PROGRAM = 'No active program';

// Resolve every nutrient's effective floor/target/ceiling band for a user. A
// nutrient override belongs to the user's ACTIVE program, applied PER MARKER: a
// non-null floor/target/ceiling on the override row wins; a NULL marker (the user
// left that field blank) falls back to the nutrient's FDA default for that marker.
// With no active program or no override row, the FDA defaults win outright. This
// per-marker fallback is what makes the wizard's FDA placeholders honest — a blank
// field stays on the FDA value rather than being persisted as a custom override.
export async function getResolvedNutrientTargets(userId: string): Promise<ResolvedNutrientTarget[]> {
  const nutrients = await listNutrients();
  const num = (v: unknown) => (v != null ? Number(v) : null);

  const program = await getActiveProgram(userId);

  const overrides = new Map<string, { floor: number | null; target: number | null; ceiling: number | null }>();
  if (program) {
    let pool;
    try {
      pool = await getFoodConnection();
      const result = await pool
        .request()
        .input('programId', sql.UniqueIdentifier, program.id)
        .query<any>(
          // Micro overrides now live in nutrient_targets_v2 (scope='micro'); the
          // filtered unique index guarantees one row per program+nutrient.
          `SELECT nutrient_id, floor, target, ceiling
           FROM nutrient_targets_v2
           WHERE scope='micro' AND program_id = @programId`
        );
      for (const r of result.recordset) {
        overrides.set(r.nutrient_id, { floor: num(r.floor), target: num(r.target), ceiling: num(r.ceiling) });
      }
    } finally {
      if (pool) await closeFoodConnection(pool);
    }
  }

  return nutrients.map((n) => {
    const o = overrides.get(n.id);
    if (o) {
      // Per-marker fallback: a blank (NULL) override marker uses the FDA default.
      return {
        nutrient_id: n.id, code: n.code,
        floor: o.floor ?? n.default_floor,
        target: o.target ?? n.default_target,
        ceiling: o.ceiling ?? n.default_ceiling,
        source: 'manual' as const,
      };
    }
    return {
      nutrient_id: n.id, code: n.code,
      floor: n.default_floor, target: n.default_target, ceiling: n.default_ceiling,
      source: 'default' as const,
    };
  });
}

// The active program's RAW override rows — only nutrients that actually have an
// override, with their stored markers (NULL preserved, i.e. NOT FDA-filled). The
// program wizard seeds its editor from this so it can show which markers the user
// set vs. which fall back to the FDA placeholder. Empty when there's no active
// program or no overrides.
export async function getNutrientOverrides(
  userId: string,
): Promise<{ nutrient_id: string; code: string; floor: number | null; target: number | null; ceiling: number | null }[]> {
  const program = await getActiveProgram(userId);
  if (!program) return [];

  const nutrients = await listNutrients();
  const codeById = new Map(nutrients.map((n) => [n.id, n.code]));
  const num = (v: unknown) => (v != null ? Number(v) : null);

  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('programId', sql.UniqueIdentifier, program.id)
      .query<any>(
        `SELECT nutrient_id, floor, target, ceiling
         FROM nutrient_targets_v2
         WHERE scope='micro' AND program_id = @programId`
      );
    return result.recordset
      .filter((r) => codeById.has(r.nutrient_id))
      .map((r) => ({
        nutrient_id: r.nutrient_id, code: codeById.get(r.nutrient_id)!,
        floor: num(r.floor), target: num(r.target), ceiling: num(r.ceiling),
      }));
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Resolve a single nutrient's effective band for a user (same rule as the list
// resolver). Throws if the nutrient id is unknown so the API can 404.
export async function getResolvedNutrientTargetById(
  userId: string,
  nutrientId: string,
): Promise<ResolvedNutrientTarget> {
  const all = await getResolvedNutrientTargets(userId);
  const found = all.find((t) => t.nutrient_id === nutrientId);
  if (!found) throw new Error(`No nutrient found for id: '${nutrientId}'`);
  return found;
}

// Upsert a MANUAL override for one nutrient onto the user's ACTIVE program: the
// row's presence flips that nutrient to manual mode, and floor/target/ceiling
// (each NULL = no marker) fully replace the FDA default band. Saving an all-NULL
// band is a valid manual state (explicitly suppress the defaults); use
// deleteNutrientTarget to fall back to the defaults instead. Throws
// NO_ACTIVE_PROGRAM when there is no program to attach to. Returns the
// newly-resolved band.
export async function upsertNutrientTarget(
  userId: string,
  nutrientId: string,
  band: { floor: number | null; target: number | null; ceiling: number | null },
): Promise<ResolvedNutrientTarget> {
  // Guard the FK up front so an unknown nutrient is a 404, not a SQL error.
  const nutrient = await getNutrientById(nutrientId);
  if (!nutrient) throw new Error(`No nutrient found for id: '${nutrientId}'`);

  // Overrides hang off the active program — there must be one.
  const program = await getActiveProgram(userId);
  if (!program) throw new Error(NO_ACTIVE_PROGRAM);

  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('programId', sql.UniqueIdentifier, program.id)
      .input('nutrientId', sql.UniqueIdentifier, nutrientId)
      .input('floor', sql.Decimal(12, 4), band.floor)
      .input('target', sql.Decimal(12, 4), band.target)
      .input('ceiling', sql.Decimal(12, 4), band.ceiling)
      .query(
        // Micro overrides live in nutrient_targets_v2 (scope='micro', one row per
        // program+nutrient). The MERGE source is scoped to micro so a macro row for
        // the same nutrient is never matched/clobbered.
        `MERGE nutrient_targets_v2 AS tgt
         USING (SELECT @programId AS program_id, @nutrientId AS nutrient_id) AS src
           ON tgt.scope = 'micro' AND tgt.program_id = src.program_id AND tgt.nutrient_id = src.nutrient_id
         WHEN MATCHED THEN UPDATE SET floor = @floor, target = @target, ceiling = @ceiling, updated_at = SYSUTCDATETIME()
         WHEN NOT MATCHED THEN INSERT (scope, program_id, nutrient_id, floor, target, ceiling, is_active, source)
           VALUES ('micro', @programId, @nutrientId, @floor, @target, @ceiling, 1, 'manual');`
      );
  } finally {
    if (pool) await closeFoodConnection(pool);
  }

  return { nutrient_id: nutrient.id, code: nutrient.code, floor: band.floor, target: band.target, ceiling: band.ceiling, source: 'manual' };
}

// Drop one nutrient's override from the user's active program — its band reverts
// to the FDA defaults. A no-op (still returns the default band) when there is no
// active program or no override row. Returns the resolved (now default) band.
export async function deleteNutrientTarget(userId: string, nutrientId: string): Promise<ResolvedNutrientTarget> {
  const nutrient = await getNutrientById(nutrientId);
  if (!nutrient) throw new Error(`No nutrient found for id: '${nutrientId}'`);

  const program = await getActiveProgram(userId);
  if (program) {
    let pool;
    try {
      pool = await getFoodConnection();
      await pool
        .request()
        .input('programId', sql.UniqueIdentifier, program.id)
        .input('nutrientId', sql.UniqueIdentifier, nutrientId)
        .query(`DELETE FROM nutrient_targets_v2 WHERE scope='micro' AND program_id = @programId AND nutrient_id = @nutrientId`);
    } finally {
      if (pool) await closeFoodConnection(pool);
    }
  }

  return {
    nutrient_id: nutrient.id, code: nutrient.code,
    floor: nutrient.default_floor, target: nutrient.default_target, ceiling: nutrient.default_ceiling,
    source: 'default',
  };
}
