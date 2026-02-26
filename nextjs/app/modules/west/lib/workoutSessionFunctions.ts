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

export async function createWorkoutSession(name: string, sessionDate: string): Promise<string> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request()
      .input('name', name)
      .input('sessionDate', sessionDate)
      .query(`
        INSERT INTO workout_sessions (name, session_date)
        OUTPUT INSERTED.id
        VALUES (@name, @sessionDate)
      `);

    return result.recordset[0].id;
  } catch (error) {
    console.error('Error creating workout session:', error);
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

export async function updateWorkoutSession(id: string, name: string, notes: string | null): Promise<void> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request()
      .input('id', id)
      .input('name', name)
      .input('notes', notes)
      .query(`
        UPDATE workout_sessions
        SET name = @name, notes = @notes, modified_at = GETDATE()
        WHERE id = @id
      `);

    if (result.rowsAffected[0] === 0) {
      throw new Error(`No workout session found for id: '${id}'`);
    }
  } catch (error) {
    console.error('Error updating workout session:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}

export async function deleteWorkoutSession(id: string): Promise<void> {
  let pool;
  try {
    pool = await getWestConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Delete sets for all exercises in this session
      await transaction.request()
        .input('id', id)
        .query(`
          DELETE FROM session_exercise_sets
          WHERE session_exercise_id IN (
            SELECT id FROM session_exercises WHERE session_id = @id
          )
        `);

      // Delete exercises for this session
      await transaction.request()
        .input('id', id)
        .query(`
          DELETE FROM session_exercises WHERE session_id = @id
        `);

      // Delete the session
      const result = await transaction.request()
        .input('id', id)
        .query(`
          DELETE FROM workout_sessions WHERE id = @id
        `);

      if (result.rowsAffected[0] === 0) {
        throw new Error(`No workout session found for id: '${id}'`);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error deleting workout session:', error);
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
