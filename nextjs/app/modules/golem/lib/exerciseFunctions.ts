import { getGolemConnection, closeGolemConnection } from './db';
import { Exercise, ExerciseSummary, ExerciseHistoryEntry } from '../types/exercise';
import { calculateEstimatedOneRepMax } from '../utils/calc';

export async function getAllExercises(
  options: {
    showDisabled?: boolean;
    search?: string;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<{ exercises: Exercise[]; totalCount: number }> {
  let pool;
  try {
    pool = await getGolemConnection();

    const request = pool.request();
    const conditions: string[] = [];

    // Filter by disabled status
    if (options.showDisabled) {
      conditions.push('is_disabled = 1');
    } else {
      conditions.push('is_disabled = 0');
    }

    // Search filter — match each word independently so searches like "sumo deadlift" finds "sumo deficit deadlift"
    if (options.search) {
      const searchWords = options.search.trim().split(/\s+/).filter(Boolean);
      searchWords.forEach((word, index) => {
        request.input(`search${index}`, `%${word}%`);
        conditions.push(`name LIKE @search${index}`);
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
      SELECT *, COUNT(*) OVER() AS _total_count
      FROM exercises
      ${whereClause}
      ORDER BY name
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

export async function getExerciseById(id: string): Promise<Exercise> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('id', id)
      .query(`SELECT * FROM exercises WHERE id = @id`);

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

export async function createExercise(name: string, description: string | null, category: string = 'Strength', isTimed: boolean = false): Promise<Exercise> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('name', name)
      .input('description', description)
      .input('category', category)
      .input('isTimed', isTimed ? 1 : 0)
      .query(`
        INSERT INTO exercises (name, description, category, is_timed)
        OUTPUT INSERTED.*
        VALUES (@name, @description, @category, @isTimed)
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

export async function updateExercise(id: string, name: string, description: string | null, category: string, isTimed: boolean = false): Promise<Exercise> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('id', id)
      .input('name', name)
      .input('description', description)
      .input('category', category)
      .input('isTimed', isTimed ? 1 : 0)
      .query(`
        UPDATE exercises
        SET name = @name, description = @description, category = @category, is_timed = @isTimed, modified_at = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
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

export async function disableExercise(id: string): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('id', id)
      .query(`
        UPDATE exercises
        SET is_disabled = 1, modified_at = GETDATE()
        WHERE id = @id AND is_disabled = 0
      `);

    if (result.rowsAffected[0] === 0) {
      throw new Error(`No exercise found for id: '${id}'`);
    }
  } catch (error) {
    console.error('Error disabling exercise:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function enableExercise(id: string): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('id', id)
      .query(`
        UPDATE exercises
        SET is_disabled = 0, modified_at = GETDATE()
        WHERE id = @id AND is_disabled = 1
      `);

    if (result.rowsAffected[0] === 0) {
      throw new Error(`No disabled exercise found for id: '${id}'`);
    }
  } catch (error) {
    console.error('Error enabling exercise:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function getAllExercisesWithMuscleGroups(): Promise<ExerciseSummary[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request().query(`
      SELECT e.id, e.name, e.category, e.is_timed, e.is_disabled, mg.name AS muscle_group_name, emg.is_primary,
             best.best_set_weight, best.best_set_reps, last_use.last_used_at
      FROM exercises e
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
        ) ranked
        WHERE rn = 1
      ) best ON e.id = best.exercise_id
      LEFT JOIN (
        SELECT se.exercise_id, MAX(ws.started_at) AS last_used_at
        FROM session_segments se
        JOIN workout_sessions ws ON se.session_id = ws.id
        WHERE ws.started_at IS NOT NULL
        GROUP BY se.exercise_id
      ) last_use ON e.id = last_use.exercise_id
      ORDER BY e.name, emg.is_primary DESC, mg.name
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
  exerciseId: string,
  options: { startDate?: string; endDate?: string } = {},
): Promise<{ history: ExerciseHistoryEntry[]; totalCount: number }> {
  let pool;
  try {
    pool = await getGolemConnection();
    const request = pool.request().input('exerciseId', exerciseId);

    const conditions: string[] = [
      'ss.exercise_id = @exerciseId',
      'ws.is_completed = 1',
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
          sss.time_seconds
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

    // Total completed session count for this exercise
    const totalResult = await pool.request()
      .input('exerciseId', exerciseId)
      .query(`
        SELECT COUNT(DISTINCT ws.id) AS total_count
        FROM session_segments ss
        JOIN workout_sessions ws ON ss.session_id = ws.id
        WHERE ss.exercise_id = @exerciseId AND ws.is_completed = 1
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

export async function getExerciseCount(): Promise<number> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request().query(`
      SELECT COUNT(*) as count FROM exercises
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
