// DB access for engine-driven generation: reads the new day-archetype/slot schema and assembles
// candidate pools. Singleton-pool convention. Pairs with loader.ts (per-exercise history).
import { getGolemConnection, closeGolemConnection } from '../db';
import type { ProgressionModel } from './types';
import type { ScoringCandidate, SlotSpec } from './selection';
import type { SlotDefinition } from './orchestrator';

// Resolve the day archetype a session instantiates (the progression-lineage identity).
export async function getDayArchetypeIdForSession(userId: string, sessionId: string): Promise<string | null> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('sessionId', sessionId)
      .query(`SELECT day_archetype_id FROM workout_sessions WHERE id = @sessionId AND user_id = @userId`);
    if (result.recordset.length === 0) throw new Error(`No workout session found for id: '${sessionId}'`);
    return result.recordset[0].day_archetype_id ?? null;
  } catch (error) {
    console.error('Error fetching day archetype id for session:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Load the ordered slot definitions (SlotSpec + ProgressionState) for a day archetype.
export async function getSlotDefinitions(userId: string, dayArchetypeId: string): Promise<SlotDefinition[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('archetypeId', dayArchetypeId)
      .query(`
        SELECT s.id, s.order_index, s.role, s.category_filter, s.rotation_cadence,
               CAST(s.pinned_exercise_id AS NVARCHAR(36)) AS pinned_exercise_id,
               mg.name AS target_muscle,
               s.required_muscles, s.excluded_muscles,
               s.progression_model, s.rep_low, s.rep_high, s.time_low_seconds, s.time_high_seconds, s.target_rpe,
               s.load_step_pct, s.round_to_step, s.set_target, s.is_optional, s.is_warmup
        FROM day_slots s
        LEFT JOIN muscle_groups mg ON mg.id = s.target_muscle_group_id
        WHERE s.day_archetype_id = @archetypeId AND s.user_id = @userId
        ORDER BY s.is_warmup DESC, s.order_index
      `);

    if (result.recordset.length === 0) {
      console.warn(`No slots found for day archetype id: '${dayArchetypeId}'`);
    }

    return result.recordset.map((r) => {
      const isTimeEffort = r.progression_model === 'time_effort';
      const isWarmup = !!r.is_warmup;
      // Per-slot movement-pattern constraints: comma-separated muscle names the candidate must ALSO
      // recruit (required) / must NOT recruit (excluded). Blank/null → no constraint.
      const parseMuscles = (csv: string | null): string[] | undefined => {
        const list = (csv ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        return list.length ? list : undefined;
      };
      const slot: SlotSpec = {
        role: r.role,
        targetMuscle: r.target_muscle ?? null,
        categoryFilter: r.category_filter,
        rotationCadence: r.rotation_cadence,
        pinnedExerciseId: r.pinned_exercise_id ?? null,
        excludeExerciseIds: [],
        contraindicatedMuscles: parseMuscles(r.excluded_muscles),
        requiredMuscles: parseMuscles(r.required_muscles),
        // time_effort → only timed exercises; rep-based models → only rep-loggable (non-timed) exercises.
        // Warmup slots accept either (a warmup can be timed or rep-based), so they impose no timed requirement.
        requireTimed: isWarmup ? undefined : isTimeEffort,
      };
      // The time range is a CARDIO-only concept (a prescribed dose). Strength holds get no guardrails —
      // timeRange stays null so nextTimeEffort drives purely off logged history (self-report on cold start).
      const timeRange: [number, number] | null =
        isTimeEffort && r.category_filter === 'Cardio' && r.time_low_seconds != null && r.time_high_seconds != null
          ? [Number(r.time_low_seconds), Number(r.time_high_seconds)]
          : null;
      return {
        slot,
        isWarmup,
        progression: {
          model: r.progression_model as ProgressionModel,
          repRange: [r.rep_low, r.rep_high] as [number, number],
          timeRange,
          targetRpe: r.target_rpe ?? null,
          loadStepPct: Number(r.load_step_pct),
          roundToStep: Number(r.round_to_step),
          setTarget: r.set_target,
        },
      };
    });
  } catch (error) {
    console.error('Error fetching slot definitions:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// An exercise is equipment-available at a location if every equipment row it requires
// (exercise_equipment.is_required = 1) is among that location's selected equipment
// (location_equipment). Exercises with no required-equipment rows (bodyweight / unmapped)
// are always available. When no location is set, filtering is skipped (permissive).
// T-SQL has no boolean expression type usable in a SELECT list, so the predicate is
// wrapped in CASE WHEN ... THEN 1 ELSE 0 END to produce a bit column.
const EQUIPMENT_AVAILABLE_SQL = `
  CASE WHEN (
    @locationId IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM exercise_equipment ee
      WHERE ee.exercise_id = p.id AND ee.is_required = 1
        AND NOT EXISTS (
          SELECT 1 FROM location_equipment le
          WHERE le.location_id = @locationId AND le.equipment_id = ee.equipment_id
        )
    )
  ) THEN 1 ELSE 0 END
`;

// Candidate pool for a target muscle: every exercise that is a PRIMARY mover for it, enabled at the
// governing location, with recency + recent-history for scoring, gated on the location's equipment.
export async function getCandidatesForMuscle(
  userId: string,
  muscle: string,
  locationId: string | null,
): Promise<ScoringCandidate[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('muscle', muscle)
      .input('locationId', locationId)
      .query(`
        WITH primaries AS (
          SELECT DISTINCT e.id, e.name, e.category, e.is_timed
          FROM exercises e
          JOIN exercise_muscle_groups emg ON emg.exercise_id = e.id AND emg.is_primary = 1
          JOIN muscle_groups mg ON mg.id = emg.muscle_group_id AND mg.name = @muscle
          WHERE (e.user_id = @userId OR e.user_id IS NULL)
            AND NOT EXISTS (
              SELECT 1 FROM location_exercise_overrides leo
              WHERE leo.exercise_id = e.id AND leo.location_id = @locationId AND leo.is_disabled = 1
            )
            -- Per-user temporary hold (injury/contraindication) — excludes across ALL locations
            -- until disabled_until passes (NULL = permanent). See user_exercise_holds.
            AND NOT EXISTS (
              SELECT 1 FROM user_exercise_holds ueh
              WHERE ueh.exercise_id = e.id AND ueh.user_id = @userId
                AND (ueh.disabled_until IS NULL OR ueh.disabled_until > GETDATE())
            )
        )
        SELECT p.id, p.name, p.category, p.is_timed,
          (SELECT STRING_AGG(mg2.name, ',') FROM exercise_muscle_groups m2 JOIN muscle_groups mg2 ON mg2.id = m2.muscle_group_id WHERE m2.exercise_id = p.id AND m2.is_primary = 1) AS primary_muscles,
          (SELECT STRING_AGG(mg3.name, ',') FROM exercise_muscle_groups m3 JOIN muscle_groups mg3 ON mg3.id = m3.muscle_group_id WHERE m3.exercise_id = p.id) AS all_muscles,
          rec.days_since, rec.sessions_120,
          ${EQUIPMENT_AVAILABLE_SQL} AS equipment_available
        FROM primaries p
        OUTER APPLY (
          SELECT DATEDIFF(day, MAX(ws.started_at), GETDATE()) AS days_since,
                 COUNT(DISTINCT CASE WHEN ws.started_at >= DATEADD(day,-120,GETDATE()) THEN ws.id END) AS sessions_120
          FROM session_segments ss JOIN workout_sessions ws ON ss.session_id = ws.id
          WHERE ss.exercise_id = p.id AND ws.user_id = @userId AND ws.is_completed = 1
        ) rec
      `);

    return result.recordset.map((r) => ({
      exerciseId: r.id,
      name: r.name,
      category: r.category,
      primaryMuscles: (r.primary_muscles ?? '').split(',').filter(Boolean),
      allMuscles: (r.all_muscles ?? '').split(',').filter(Boolean),
      daysSinceUsed: r.days_since ?? null,
      historySessions: r.sessions_120 ?? 0,
      equipmentAvailable: !!r.equipment_available,
      isTimed: !!r.is_timed,
    }));
  } catch (error) {
    console.error('Error fetching candidates for muscle:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Candidate pool for a muscle-less slot (e.g. conditioning / Cardio, or a generic isolation slot with no
// target_muscle_group_id): every ENABLED exercise of the given category at the governing location, with
// recency + recent-history for scoring. Without this, slots whose target_muscle_group_id is NULL get an
// empty pool and are silently dropped from the generated session (conditioning vanishing on regenerate).
export async function getCandidatesByCategory(
  userId: string,
  category: string,
  locationId: string | null,
): Promise<ScoringCandidate[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('category', category)
      .input('locationId', locationId)
      .query(`
        WITH pool AS (
          SELECT e.id, e.name, e.category, e.is_timed
          FROM exercises e
          WHERE e.category = @category
            AND (e.user_id = @userId OR e.user_id IS NULL)
            AND NOT EXISTS (
              SELECT 1 FROM location_exercise_overrides leo
              WHERE leo.exercise_id = e.id AND leo.location_id = @locationId AND leo.is_disabled = 1
            )
            -- Per-user temporary hold (injury/contraindication) — excludes across ALL locations
            -- until disabled_until passes (NULL = permanent). See user_exercise_holds.
            AND NOT EXISTS (
              SELECT 1 FROM user_exercise_holds ueh
              WHERE ueh.exercise_id = e.id AND ueh.user_id = @userId
                AND (ueh.disabled_until IS NULL OR ueh.disabled_until > GETDATE())
            )
        )
        SELECT p.id, p.name, p.category, p.is_timed,
          (SELECT STRING_AGG(mg2.name, ',') FROM exercise_muscle_groups m2 JOIN muscle_groups mg2 ON mg2.id = m2.muscle_group_id WHERE m2.exercise_id = p.id AND m2.is_primary = 1) AS primary_muscles,
          (SELECT STRING_AGG(mg3.name, ',') FROM exercise_muscle_groups m3 JOIN muscle_groups mg3 ON mg3.id = m3.muscle_group_id WHERE m3.exercise_id = p.id) AS all_muscles,
          rec.days_since, rec.sessions_120,
          ${EQUIPMENT_AVAILABLE_SQL} AS equipment_available
        FROM pool p
        OUTER APPLY (
          SELECT DATEDIFF(day, MAX(ws.started_at), GETDATE()) AS days_since,
                 COUNT(DISTINCT CASE WHEN ws.started_at >= DATEADD(day,-120,GETDATE()) THEN ws.id END) AS sessions_120
          FROM session_segments ss JOIN workout_sessions ws ON ss.session_id = ws.id
          WHERE ss.exercise_id = p.id AND ws.user_id = @userId AND ws.is_completed = 1
        ) rec
      `);

    return result.recordset.map((r) => ({
      exerciseId: r.id,
      name: r.name,
      category: r.category,
      primaryMuscles: (r.primary_muscles ?? '').split(',').filter(Boolean),
      allMuscles: (r.all_muscles ?? '').split(',').filter(Boolean),
      daysSinceUsed: r.days_since ?? null,
      historySessions: r.sessions_120 ?? 0,
      equipmentAvailable: !!r.equipment_available,
      isTimed: !!r.is_timed,
    }));
  } catch (error) {
    console.error('Error fetching candidates by category:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}
