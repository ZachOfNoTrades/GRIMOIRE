import { getWestConnection, closeWestConnection } from './db';
import { WorkoutSession } from '../types/workoutSession';

export async function getAllWorkoutSessions(): Promise<WorkoutSession[]> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request().query(`
      SELECT * FROM workout_sessions ORDER BY session_date DESC
    `);

    if (result.recordset.length === 0) {
      console.warn('No workout sessions found');
    }

    return result.recordset;
  } catch (error) {
    console.error('Error fetching workout sessions:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}

export async function getWorkoutSessionById(id: string): Promise<WorkoutSession> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request()
      .input('id', id)
      .query(`SELECT * FROM workout_sessions WHERE id = @id`);

    if (result.recordset.length === 0) {
      throw new Error(`No workout session found for id: '${id}'`);
    }

    return result.recordset[0];
  } catch (error) {
    console.error('Error fetching workout session:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}

export async function getWorkoutSessionCount(): Promise<number> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request().query(`
      SELECT COUNT(*) as count FROM workout_sessions
    `);

    return result.recordset[0].count;
  } catch (error) {
    console.error('Error fetching workout session count:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}
