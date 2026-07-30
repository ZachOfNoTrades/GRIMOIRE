import { getGolemConnection, closeGolemConnection } from './db';
import { resolveLocationId } from './locationFunctions';
import { Exercise, ExerciseSummary, ExerciseHistoryEntry, ExerciseHold } from '../types/exercise';
import { calculateEstimatedOneRepMax } from '../utils/calc';

export async function getAllExercises(
  userId: string,
  options: {
    locationId?: string | null;
    showDisabled?: boolean;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<{ exercises: Exercise[]; totalCount: number }> {
  let pool;
  try {
    // Enabled state is per-location — resolve the location whose list we are reading.
    const locationId = await resolveLocationId(userId, options.locationId);

    pool = await getGolemConnection();

    const request = pool.request();
    request.input('userId', userId);
    request.input('locationId', locationId);
    const conditions: string[] = [
      '(e.user_id IS NULL OR e.user_id = @userId)',
    ];

    // Filter by disabled status — absence of a location override row means enabled.
    if (options.showDisabled) {
      conditions.push('COALESCE(leo.is_disabled, 0) = 1');
    } else {
      conditions.push('COALESCE(leo.is_disabled, 0) = 0');
    }

    // Search filter — match each word independently so searches like "sumo deadlift" finds "sumo deficit deadlift"
    if (options.search) {
      const searchWords = options.search.trim().split(/\s+/).filter(Boolean);
      searchWords.forEach((word, index) => {
        request.input(`search${index}`, `%${word}%`);
        conditions.push(`COALESCE(o.custom_name, e.name) LIKE @search${index}`);
      });
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let paginationClause = '';
    if (options.page && options.pageSize) {
      const offset = (options.page - 1) * options.pageSize;
      request.input('offset', offset).input('pageSize', options.pageSize);
      paginationClause = 'OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY';
    }

    const query = `
      SELECT e.id, COALESCE(o.custom_name, e.name) AS name,
             COALESCE(o.custom_description, e.description) AS description,
             e.category, e.is_timed, e.distance_type,
             COALESCE(leo.is_disabled, 0) AS is_disabled,
             e.created_at, e.modified_at,
             COUNT(*) OVER() AS _total_count
      FROM exercises e
      LEFT JOIN user_exercise_overrides o ON o.exercise_id = e.id AND o.user_id = @userId
      LEFT JOIN location_exercise_overrides leo ON leo.exercise_id = e.id AND leo.location_id = @locationId
      ${whereClause}
      ORDER BY COALESCE(o.custom_name, e.name)
      ${paginationClause}
    `;

    const result = await request.query(query);

    if (result.recordset.length === 0) {
      console.warn('No exercises found');
      return { exercises: [], totalCount: 0 };
    }

    const totalCount = result.recordset[0]._total_count;
    const exercises = result.recordset.map(({ _total_count, ...exercise }) => exercise as Exercise);

    return { exercises, totalCount };
  } catch (error) {
    console.error('Error fetching exercises:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function getExerciseById(userId: string, id: string, locationId?: string | null): Promise<Exercise> {
  let pool;
  try {
    // is_disabled reflects the resolved location's enabled list.
    const resolvedLocationId = await resolveLocationId(userId, locationId);

    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('id', id)
      .input('locationId', resolvedLocationId)
      .query(`
        SELECT e.id, COALESCE(o.custom_name, e.name) AS name,
               COALESCE(o.custom_description, e.description) AS description,
               e.category, e.is_timed, e.distance_type,
               COALESCE(leo.is_disabled, 0) AS is_disabled,
               e.created_at, e.modified_at
        FROM exercises e
        LEFT JOIN user_exercise_overrides o ON o.exercise_id = e.id AND o.user_id = @userId
        LEFT JOIN location_exercise_overrides leo ON leo.exercise_id = e.id AND leo.location_id = @locationId
        WHERE e.id = @id AND (e.user_id IS NULL OR e.user_id = @userId)
      `);

    if (result.recordset.length === 0) {
      throw new Error(`No exercise found for id: '${id}'`);
    }

    return result.recordset[0];
  } catch (error) {
    console.error('Error fetching exercise:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Sentinel thrown when a new custom exercise name collides with an already-accessible one.
// The API layer maps this to a 409 (same as a DB unique-index violation).
export const DUPLICATE_EXERCISE_NAME_ERROR = 'DUPLICATE_EXERCISE_NAME';

export async function createExercise(userId: string, name: string, description: string | null, category: string = 'Strength', isTimed: boolean = false, distanceType: string | null = null): Promise<Exercise> {
  let pool;
  try {
    pool = await getGolemConnection();

    // Guard against a custom exercise colliding with an already-accessible one. The two filtered
    // unique indexes (UX_exercises_system_name on user_id IS NULL, UX_exercises_user_name on
    // user_id IS NOT NULL) are disjoint, so the DB alone lets a user's custom exercise reuse a
    // SYSTEM exercise's name — producing duplicate entries in every list/swap menu. Name collation
    // is case-insensitive, so this catch is case-insensitive too.
    const existing = await pool.request()
      .input('userId', userId)
      .input('name', name)
      .query(`
        SELECT TOP 1 id FROM exercises
        WHERE name = @name AND (user_id IS NULL OR user_id = @userId)
      `);

    if (existing.recordset.length > 0) {
      throw new Error(DUPLICATE_EXERCISE_NAME_ERROR);
    }

    const result = await pool.request()
      .input('userId', userId)
      .input('name', name)
      .input('description', description)
      .input('category', category)
      .input('isTimed', isTimed ? 1 : 0)
      .input('distanceType', distanceType)
      .query(`
        INSERT INTO exercises (user_id, name, description, category, is_timed, distance_type)
        OUTPUT INSERTED.*
        VALUES (@userId, @name, @description, @category, @isTimed, @distanceType)
      `);

    return result.recordset[0];
  } catch (error) {
    console.error('Error creating exercise:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Accessible = a system exercise (user_id IS NULL) OR this user's own custom exercise. System
// exercises are edited here the same way their muscle groups + equipment already are (all global
// metadata edited from the same form); scoping the UPDATE to user_id = @userId only would 404 on
// every system exercise — i.e. ~99% of the library could never be edited at all.
export async function updateExercise(userId: string, id: string, name: string, description: string | null, category: string, isTimed: boolean = false, distanceType: string | null = null): Promise<Exercise> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('id', id)
      .input('name', name)
      .input('description', description)
      .input('category', category)
      .input('isTimed', isTimed ? 1 : 0)
      .input('distanceType', distanceType)
      .query(`
        UPDATE exercises
        SET name = @name, description = @description, category = @category, is_timed = @isTimed, distance_type = @distanceType, modified_at = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id AND (user_id IS NULL OR user_id = @userId)
      `);

    if (result.recordset.length === 0) {
      throw new Error(`No exercise found for id: '${id}'`);
    }

    return result.recordset[0];
  } catch (error) {
    console.error('Error updating exercise:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Returns the equipment ids required by an exercise (exercise_equipment join). Equipment is
// global metadata on the exercise (not user-scoped), like muscle groups. The generation engine
// treats every row here as required (is_required = 1), so we only surface the equipment ids.
export async function getExerciseEquipment(exerciseId: string): Promise<string[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('exerciseId', exerciseId)
      .query(`
        SELECT ee.equipment_id
        FROM exercise_equipment ee
        JOIN equipment e ON e.id = ee.equipment_id
        WHERE ee.exercise_id = @exerciseId
        ORDER BY e.sort_order, e.name
      `);

    return result.recordset.map((row) => row.equipment_id);
  } catch (error) {
    console.error('Error fetching exercise equipment:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Replaces the equipment associated with an exercise (delete-then-insert in a transaction, same
// shape as updateExerciseMuscleGroups). Every row is written as is_required = 1 / alt_group = NULL
// — the only shape the whole library uses today and the only field the generation engine reads.
export async function setExerciseEquipment(exerciseId: string, equipmentIds: string[]): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Clear existing equipment associations
      await transaction.request()
        .input('exerciseId', exerciseId)
        .query(`DELETE FROM exercise_equipment WHERE exercise_id = @exerciseId`);

      // Insert the new set (dedupe defensively so a repeated id can't violate the UNIQUE constraint)
      for (const equipmentId of Array.from(new Set(equipmentIds))) {
        await transaction.request()
          .input('exerciseId', exerciseId)
          .input('equipmentId', equipmentId)
          .query(`
            INSERT INTO exercise_equipment (exercise_id, equipment_id, is_required, alt_group)
            VALUES (@exerciseId, @equipmentId, 1, NULL)
          `);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error updating exercise equipment:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Sets the disabled state for an exercise AT A SPECIFIC LOCATION. Enabled state is
// per-location: the state is stored as an upserted row in location_exercise_overrides,
// keyed on (location_id, exercise_id). When no locationId is supplied it resolves to the
// active location (falling back to the default). Works the same for system and custom
// exercises — only that the exercise must be accessible to the user.
async function setExerciseDisabledState(
  userId: string,
  id: string,
  disabled: boolean,
  locationId?: string | null,
): Promise<void> {
  let pool;
  try {
    const resolvedLocationId = await resolveLocationId(userId, locationId);

    pool = await getGolemConnection();

    // Verify the exercise is accessible to this user (system or their own custom).
    const existing = await pool.request()
      .input('userId', userId)
      .input('id', id)
      .query(`
        SELECT 1 AS found
        FROM exercises
        WHERE id = @id AND (user_id IS NULL OR user_id = @userId)
      `);

    if (existing.recordset.length === 0) {
      throw new Error(`No exercise found for id: '${id}'`);
    }

    // Upsert the per-location override row.
    await pool.request()
      .input('locationId', resolvedLocationId)
      .input('id', id)
      .input('isDisabled', disabled ? 1 : 0)
      .query(`
        MERGE INTO location_exercise_overrides AS dest
        USING (SELECT @locationId AS location_id, @id AS exercise_id) AS source
        ON dest.location_id = source.location_id AND dest.exercise_id = source.exercise_id
        WHEN MATCHED THEN
          UPDATE SET is_disabled = @isDisabled, modified_at = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (location_id, exercise_id, is_disabled)
          VALUES (@locationId, @id, @isDisabled);
      `);
  } catch (error) {
    console.error(`Error ${disabled ? 'disabling' : 'enabling'} exercise:`, error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function disableExercise(userId: string, id: string, locationId?: string | null): Promise<void> {
  return setExerciseDisabledState(userId, id, true, locationId);
}

export async function enableExercise(userId: string, id: string, locationId?: string | null): Promise<void> {
  return setExerciseDisabledState(userId, id, false, locationId);
}

// PER-USER EXERCISE HOLD (injury / contraindication)
// A hold removes an exercise from the deterministic generator's candidate pool for this user across
// ALL locations (unlike location_exercise_overrides, which is per-location equipment gating).
// disabledUntil null = permanent; a future Date auto-expires with no cleanup job. Upsert — one hold
// row per (user, exercise).
export async function setExerciseHold(
  userId: string,
  exerciseId: string,
  disabledUntil: Date | null,
  reason?: string | null,
): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();

    // Verify the exercise is accessible to this user (system or their own custom).
    const existing = await pool.request()
      .input('userId', userId)
      .input('id', exerciseId)
      .query(`SELECT 1 AS found FROM exercises WHERE id = @id AND (user_id IS NULL OR user_id = @userId)`);

    if (existing.recordset.length === 0) {
      throw new Error(`No exercise found for id: '${exerciseId}'`);
    }

    // Upsert the per-user hold row.
    await pool.request()
      .input('userId', userId)
      .input('id', exerciseId)
      .input('disabledUntil', disabledUntil ?? null)
      .input('reason', reason ?? null)
      .query(`
        MERGE INTO user_exercise_holds AS dest
        USING (SELECT @userId AS user_id, @id AS exercise_id) AS source
        ON dest.user_id = source.user_id AND dest.exercise_id = source.exercise_id
        WHEN MATCHED THEN
          UPDATE SET disabled_until = @disabledUntil, reason = @reason, modified_at = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (user_id, exercise_id, disabled_until, reason)
          VALUES (@userId, @id, @disabledUntil, @reason);
      `);
  } catch (error) {
    console.error('Error setting exercise hold:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Remove a per-user hold entirely (re-enable the exercise for generation).
export async function clearExerciseHold(userId: string, exerciseId: string): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    await pool.request()
      .input('userId', userId)
      .input('id', exerciseId)
      .query(`DELETE FROM user_exercise_holds WHERE user_id = @userId AND exercise_id = @id`);
  } catch (error) {
    console.error('Error clearing exercise hold:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// All per-user holds with the exercise name and whether the hold is currently in effect (permanent,
// or disabled_until still in the future). activeOnly filters to currently-effective holds.
export async function getExerciseHolds(userId: string, activeOnly = false): Promise<ExerciseHold[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .query(`
        SELECT ueh.exercise_id,
               COALESCE(o.custom_name, e.name) AS name,
               ueh.disabled_until, ueh.reason,
               CASE WHEN ueh.disabled_until IS NULL OR ueh.disabled_until > GETDATE() THEN 1 ELSE 0 END AS is_active
        FROM user_exercise_holds ueh
        JOIN exercises e ON e.id = ueh.exercise_id
        LEFT JOIN user_exercise_overrides o ON o.exercise_id = e.id AND o.user_id = @userId
        WHERE ueh.user_id = @userId
        ${activeOnly ? 'AND (ueh.disabled_until IS NULL OR ueh.disabled_until > GETDATE())' : ''}
        ORDER BY is_active DESC, name
      `);

    if (result.recordset.length === 0) {
      console.warn(`No exercise holds found for user id: '${userId}'`);
    }

    return result.recordset.map((r) => ({
      exercise_id: r.exercise_id,
      name: r.name,
      disabled_until: r.disabled_until ? new Date(r.disabled_until).toISOString() : null,
      reason: r.reason ?? null,
      is_active: !!r.is_active,
    }));
  } catch (error) {
    console.error('Error fetching exercise holds:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function getAllExercisesWithMuscleGroups(userId: string, locationId?: string | null): Promise<ExerciseSummary[]> {
  let pool;
  try {
    // is_disabled reflects the resolved location's enabled list.
    const resolvedLocationId = await resolveLocationId(userId, locationId);

    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('locationId', resolvedLocationId)
      .query(`
        SELECT e.id, COALESCE(o.custom_name, e.name) AS name, e.category, e.is_timed, e.distance_type,
               COALESCE(leo.is_disabled, 0) AS is_disabled,
               mg.name AS muscle_group_name, emg.is_primary,
               best.best_set_weight, best.best_set_reps, last_use.last_used_at
        FROM exercises e
        LEFT JOIN user_exercise_overrides o ON o.exercise_id = e.id AND o.user_id = @userId
        LEFT JOIN location_exercise_overrides leo ON leo.exercise_id = e.id AND leo.location_id = @locationId
        LEFT JOIN exercise_muscle_groups emg ON e.id = emg.exercise_id
        LEFT JOIN muscle_groups mg ON emg.muscle_group_id = mg.id
        LEFT JOIN (
          SELECT exercise_id, weight AS best_set_weight, reps AS best_set_reps
          FROM (
            SELECT se.exercise_id, ses.weight, ses.reps,
              ROW_NUMBER() OVER (PARTITION BY se.exercise_id ORDER BY ses.weight * ses.reps DESC) AS rn
            FROM session_segment_sets ses
            JOIN session_segments se ON ses.session_segment_id = se.id
            JOIN workout_sessions ws ON se.session_id = ws.id
            WHERE ses.is_warmup = 0 AND ses.weight > 0 AND ses.reps > 0 AND ws.started_at IS NOT NULL
              AND ws.user_id = @userId
          ) ranked
          WHERE rn = 1
        ) best ON e.id = best.exercise_id
        LEFT JOIN (
          SELECT se.exercise_id, MAX(ws.started_at) AS last_used_at
          FROM session_segments se
          JOIN workout_sessions ws ON se.session_id = ws.id
          WHERE ws.started_at IS NOT NULL AND ws.user_id = @userId
          GROUP BY se.exercise_id
        ) last_use ON e.id = last_use.exercise_id
        WHERE (e.user_id IS NULL OR e.user_id = @userId)
        ORDER BY COALESCE(o.custom_name, e.name), emg.is_primary DESC, mg.name
      `);

    if (result.recordset.length === 0) {
      console.warn('No exercises found');
    }

    // Group flat rows by exercise
    // Output: [{ id: "abc", name: "Bench Press", primary_muscles: ["Chest"], secondary_muscles: ["Triceps"] }]
    const exerciseMap = new Map<string, ExerciseSummary>();

    for (const row of result.recordset) {
      if (!exerciseMap.has(row.id)) {
        exerciseMap.set(row.id, {
          id: row.id,
          name: row.name,
          category: row.category,
          is_timed: row.is_timed,
          distance_type: row.distance_type ?? null,
          is_disabled: row.is_disabled,
          primary_muscles: [],
          secondary_muscles: [],
          estimated_one_rep_max: row.best_set_weight && row.best_set_reps
            ? calculateEstimatedOneRepMax(row.best_set_weight, row.best_set_reps)
            : null,
          last_used_at: row.last_used_at ?? null,
        });
      }

      const exercise = exerciseMap.get(row.id)!;

      if (row.muscle_group_name) {
        if (row.is_primary) {
          exercise.primary_muscles.push(row.muscle_group_name);
        } else {
          exercise.secondary_muscles.push(row.muscle_group_name);
        }
      }
    }

    return Array.from(exerciseMap.values());
  } catch (error) {
    console.error('Error fetching exercises with muscle groups:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function getExerciseHistory(
  userId: string,
  exerciseId: string,
  options: { startDate?: string; endDate?: string } = {},
): Promise<{ history: ExerciseHistoryEntry[]; totalCount: number }> {
  let pool;
  try {
    pool = await getGolemConnection();
    const request = pool.request().input('userId', userId).input('exerciseId', exerciseId);

    const conditions: string[] = [
      'ss.exercise_id = @exerciseId',
      'ws.is_completed = 1',
      'ws.user_id = @userId',
    ];

    if (options.startDate) {
      request.input('startDate', options.startDate);
      conditions.push('ws.started_at >= @startDate');
    }
    if (options.endDate) {
      request.input('endDate', options.endDate);
      conditions.push('ws.started_at < DATEADD(DAY, 1, CAST(@endDate AS DATE))');
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const result = await request.query(`
        SELECT
          ws.id AS session_id,
          ws.name AS session_name,
          ws.started_at,
          p.name AS program_name,
          sss.set_number,
          sss.is_warmup,
          sss.reps,
          sss.weight,
          sss.rpe,
          sss.time_seconds,
          sss.distance
        FROM session_segments ss
        JOIN workout_sessions ws ON ss.session_id = ws.id
        JOIN session_segment_sets sss ON sss.session_segment_id = ss.id
        LEFT JOIN weeks w ON ws.week_id = w.id
        LEFT JOIN blocks b ON w.block_id = b.id
        LEFT JOIN programs p ON b.program_id = p.id
        ${whereClause}
        ORDER BY ws.started_at DESC, sss.is_warmup DESC, sss.set_number ASC
      `);

    if (result.recordset.length === 0) {
      console.warn(`No exercise history found for exercise id: '${exerciseId}'`);
    }

    // Total completed session count for this exercise. Join through session_segment_sets so that
    // completed sessions which contain the exercise as a segment but have NO logged sets aren't
    // counted — otherwise history shows a useless "Showing 0 of N sessions" (the history list inner-
    // joins sets and renders nothing for such sessions).
    const totalResult = await pool.request()
      .input('userId', userId)
      .input('exerciseId', exerciseId)
      .query(`
        SELECT COUNT(DISTINCT ws.id) AS total_count
        FROM session_segments ss
        JOIN workout_sessions ws ON ss.session_id = ws.id
        JOIN session_segment_sets sss ON sss.session_segment_id = ss.id
        WHERE ss.exercise_id = @exerciseId AND ws.is_completed = 1 AND ws.user_id = @userId
      `);
    const totalCount = totalResult.recordset[0].total_count;

    // Group flat rows by session
    const sessionMap = new Map<string, ExerciseHistoryEntry>();

    for (const row of result.recordset) {
      if (!sessionMap.has(row.session_id)) {
        sessionMap.set(row.session_id, {
          session_id: row.session_id,
          session_name: row.session_name,
          started_at: row.started_at,
          program_name: row.program_name,
          sets: [],
        });
      }

      sessionMap.get(row.session_id)!.sets.push({
        set_number: row.set_number,
        is_warmup: row.is_warmup,
        reps: row.reps,
        weight: row.weight,
        rpe: row.rpe,
        time_seconds: row.time_seconds,
        distance: row.distance ?? null,
      });
    }

    return { history: Array.from(sessionMap.values()), totalCount };
  } catch (error) {
    console.error('Error fetching exercise history:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function getExerciseCount(userId: string): Promise<number> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .query(`
        SELECT COUNT(*) as count FROM exercises
        WHERE (user_id IS NULL OR user_id = @userId)
      `);

    return result.recordset[0].count;
  } catch (error) {
    console.error('Error fetching exercise count:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}
