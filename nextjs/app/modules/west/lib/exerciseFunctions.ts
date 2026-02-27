import { getWestConnection, closeWestConnection } from './db';
import { Exercise } from '../types/exercise';

export async function getAllExercises(): Promise<Exercise[]> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request().query(`
      SELECT * FROM exercises ORDER BY name
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
