import { getWestConnection, closeWestConnection } from './db';
import { Exercise, ExerciseSummary, ExerciseHistoryEntry } from '../types/exercise';
// TODO: Update all other e1RM calculations across the codebase to use this shared util
import { calculateEstimatedOneRepMax } from '../utils/calc';

export async function getAllExercises(includeDisabled: boolean = false): Promise<Exercise[]> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request().query(`
      SELECT * FROM exercises ${includeDisabled ? '' : 'WHERE is_disabled = 0'} ORDER BY name
    `);

    if (result.recordset.length === 0) {
      console.warn('No exercises found');
    }

    return result.recordset;
  } catch (error) {
    console.error('Error fetching exercises:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}

export async function getExerciseById(id: string): Promise<Exercise> {
  let pool;
  try {
    pool = await getWestConnection();
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
      await closeWestConnection(pool);
    }
  }
}

export async function createExercise(name: string, description: string | null, category: string = 'Strength'): Promise<Exercise> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request()
      .input('name', name)
      .input('description', description)
      .input('category', category)
      .query(`
        INSERT INTO exercises (name, description, category)
        OUTPUT INSERTED.*
        VALUES (@name, @description, @category)
      `);

    return result.recordset[0];
  } catch (error) {
    console.error('Error creating exercise:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}

export async function updateExercise(id: string, name: string, description: string | null): Promise<Exercise> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request()
      .input('id', id)
      .input('name', name)
      .input('description', description)
      .query(`
        UPDATE exercises
        SET name = @name, description = @description, modified_at = GETDATE()
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
      await closeWestConnection(pool);
    }
  }
}

export async function disableExercise(id: string): Promise<void> {
  let pool;
  try {
    pool = await getWestConnection();
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
      await closeWestConnection(pool);
    }
  }
}

export async function enableExercise(id: string): Promise<void> {
  let pool;
  try {
    pool = await getWestConnection();
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
      await closeWestConnection(pool);
    }
  }
}

export async function getAllExercisesWithMuscleGroups(): Promise<ExerciseSummary[]> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request().query(`
      SELECT e.id, e.name, e.category, mg.name AS muscle_group_name, emg.is_primary,
             best.best_set_weight, best.best_set_reps
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
          WHERE ses.is_warmup = 0 AND ses.weight > 0 AND ses.reps > 0
        ) ranked
        WHERE rn = 1
      ) best ON e.id = best.exercise_id
      WHERE e.is_disabled = 0
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
          primary_muscles: [],
          secondary_muscles: [],
          estimated_one_rep_max: row.best_set_weight && row.best_set_reps
            ? calculateEstimatedOneRepMax(row.best_set_weight, row.best_set_reps)
            : null,
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
      await closeWestConnection(pool);
    }
  }
}

export async function getExerciseHistory(exerciseId: string): Promise<ExerciseHistoryEntry[]> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request()
      .input('exerciseId', exerciseId)
      .query(`
        SELECT
          ws.id AS session_id,
          ws.name AS session_name,
          ws.started_at,
          p.name AS program_name,
          sss.set_number,
          sss.is_warmup,
          sss.reps,
          sss.weight,
          sss.rpe
        FROM session_segments ss
        JOIN workout_sessions ws ON ss.session_id = ws.id
        JOIN session_segment_sets sss ON sss.session_segment_id = ss.id
        LEFT JOIN weeks w ON ws.week_id = w.id
        LEFT JOIN blocks b ON w.block_id = b.id
        LEFT JOIN programs p ON b.program_id = p.id
        WHERE ss.exercise_id = @exerciseId
          AND ws.started_at IS NOT NULL
        ORDER BY ws.started_at DESC, sss.is_warmup DESC, sss.set_number ASC
      `);

    if (result.recordset.length === 0) {
      console.warn(`No exercise history found for exercise id: '${exerciseId}'`);
    }

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
      });
    }

    return Array.from(sessionMap.values());
  } catch (error) {
    console.error('Error fetching exercise history:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}

export async function getExerciseCount(): Promise<number> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request().query(`
      SELECT COUNT(*) as count FROM exercises
    `);

    return result.recordset[0].count;
  } catch (error) {
    console.error('Error fetching exercise count:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}
