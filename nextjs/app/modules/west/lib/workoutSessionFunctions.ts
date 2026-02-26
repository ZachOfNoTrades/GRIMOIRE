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

// Propagates status changes from a session to sibling sessions, parent week, and parent block.
//
// Rules:
// 1. Current session dictates current week and block.
// 2. All sessions complete in a week → week complete. All weeks complete in a block → block complete.
// 3. Resuming a completed session: becomes current, starts timer, completed=false.
// 4. Starting a current session: starts timer.
// 5. Starting a non-current session: becomes current, starts timer.
//
// On completion for all cases: the lowest-order uncompleted session in the week becomes current.
async function updateStatus(
  transaction: any,
  id: string,
  current: { week_id: string | null; order_index: number | null; is_current: boolean; is_completed: boolean },
  isCurrent: boolean,
  isCompleted: boolean,
): Promise<void> {
  if (!current.week_id) return; // standalone session, no propagation needed

  // Get parent hierarchy
  const hierarchyResult = await transaction.request()
    .input('weekId', current.week_id)
    .query(`
      SELECT w.block_id, b.program_id
      FROM weeks w
      JOIN blocks b ON w.block_id = b.id
      WHERE w.id = @weekId
    `);

  if (hierarchyResult.recordset.length === 0) return;
  const { block_id, program_id } = hierarchyResult.recordset[0];

  // --- Becoming current: propagate up to week and block ---
  if (isCurrent && !current.is_current) {

    // Clear other current sessions in the week
    await transaction.request()
      .input('weekId', current.week_id)
      .input('excludeId', id)
      .query(`UPDATE workout_sessions SET is_current = 0, modified_at = GETDATE() WHERE week_id = @weekId AND is_current = 1 AND id != @excludeId`);

    // Set parent week as current, clear other current weeks in the block
    await transaction.request()
      .input('weekId', current.week_id)
      .input('blockId', block_id)
      .query(`
        UPDATE weeks SET is_current = CASE WHEN id = @weekId THEN 1 ELSE 0 END, modified_at = GETDATE()
        WHERE block_id = @blockId AND (id = @weekId OR is_current = 1)
      `);

    // Set parent block as current, clear other current blocks in the program
    await transaction.request()
      .input('blockId', block_id)
      .input('programId', program_id)
      .query(`
        UPDATE blocks SET is_current = CASE WHEN id = @blockId THEN 1 ELSE 0 END, modified_at = GETDATE()
        WHERE program_id = @programId AND (id = @blockId OR is_current = 1)
      `);
  }

  // --- Completing: advance current to lowest uncompleted session in the week ---
  if (isCompleted && !current.is_completed) {

    // Find the lowest-order uncompleted session (excluding the one being completed)
    const nextResult = await transaction.request()
      .input('weekId', current.week_id)
      .input('excludeId', id)
      .query(`
        SELECT TOP 1 id FROM workout_sessions
        WHERE week_id = @weekId AND id != @excludeId AND is_completed = 0
        ORDER BY order_index ASC
      `);

    if (nextResult.recordset.length > 0) {
      await transaction.request()
        .input('nextId', nextResult.recordset[0].id)
        .query(`UPDATE workout_sessions SET is_current = 1, modified_at = GETDATE() WHERE id = @nextId`);
    }

    // Check if all sessions in the week are now complete
    const weekIncompleteCount = await transaction.request()
      .input('weekId', current.week_id)
      .input('excludeId', id)
      .query(`SELECT COUNT(*) as count FROM workout_sessions WHERE week_id = @weekId AND id != @excludeId AND is_completed = 0`);

    if (weekIncompleteCount.recordset[0].count === 0) {

      // All sessions complete — mark week as complete
      await transaction.request()
        .input('weekId', current.week_id)
        .query(`UPDATE weeks SET is_completed = 1, is_current = 0, modified_at = GETDATE() WHERE id = @weekId`);

      // Check if all weeks in the block are now complete
      const blockIncompleteWeeks = await transaction.request()
        .input('blockId', block_id)
        .query(`SELECT COUNT(*) as count FROM weeks WHERE block_id = @blockId AND is_completed = 0`);

      if (blockIncompleteWeeks.recordset[0].count === 0) {

        // All weeks complete — mark block as complete
        await transaction.request()
          .input('blockId', block_id)
          .query(`UPDATE blocks SET is_completed = 1, is_current = 0, modified_at = GETDATE() WHERE id = @blockId`);
      }
    }
  }

  // --- Uncompleting (resuming): unmark parent completion ---
  if (!isCompleted && current.is_completed) {

    // Unmark week as completed (it now has an incomplete session)
    await transaction.request()
      .input('weekId', current.week_id)
      .query(`UPDATE weeks SET is_completed = 0, modified_at = GETDATE() WHERE id = @weekId AND is_completed = 1`);

    // Unmark block as completed (it now has an incomplete week)
    await transaction.request()
      .input('blockId', block_id)
      .query(`UPDATE blocks SET is_completed = 0, modified_at = GETDATE() WHERE id = @blockId AND is_completed = 1`);
  }
}

export async function updateWorkoutSession(
  id: string,
  name: string,
  notes: string | null,
  startedAt: string | null,
  isCurrent: boolean,
  isCompleted: boolean,
): Promise<void> {
  let pool;
  try {
    pool = await getWestConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Get current session state for status propagation diffing
      const currentResult = await transaction.request()
        .input('id', id)
        .query(`SELECT id, week_id, order_index, is_current, is_completed FROM workout_sessions WHERE id = @id`);

      if (currentResult.recordset.length === 0) {
        throw new Error(`No workout session found for id: '${id}'`);
      }

      const current = currentResult.recordset[0];

      // Propagate status changes to siblings, parent week, and parent block
      await updateStatus(transaction, id, current, isCurrent, isCompleted);

      // Update the session
      await transaction.request()
        .input('id', id)
        .input('name', name)
        .input('notes', notes)
        .input('startedAt', startedAt)
        .input('isCurrent', isCurrent ? 1 : 0)
        .input('isCompleted', isCompleted ? 1 : 0)
        .query(`
          UPDATE workout_sessions
          SET name = @name, notes = @notes, started_at = @startedAt,
              is_current = @isCurrent, is_completed = @isCompleted, modified_at = GETDATE()
          WHERE id = @id
        `);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
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
