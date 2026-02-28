import { getWestConnection, closeWestConnection } from './db';
import { Exercise, ExerciseSummary } from '../types/exercise';

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

export async function createExercise(name: string, description: string | null): Promise<Exercise> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request()
      .input('name', name)
      .input('description', description)
      .query(`
        INSERT INTO exercises (name, description)
        OUTPUT INSERTED.*
        VALUES (@name, @description)
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
      SELECT e.id, e.name, mg.name AS muscle_group_name, emg.is_primary
      FROM exercises e
      LEFT JOIN exercise_muscle_groups emg ON e.id = emg.exercise_id
      LEFT JOIN muscle_groups mg ON emg.muscle_group_id = mg.id
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
          primary_muscles: [],
          secondary_muscles: [],
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
