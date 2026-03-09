import { getGolemConnection, closeGolemConnection } from './db';
import { WorkoutSession } from '../types/workoutSession';

export async function getAllWorkoutSessions(page?: number, pageSize?: number): Promise<{ sessions: WorkoutSession[]; totalCount: number }> {
  let pool;
  try {
    pool = await getGolemConnection();

    const request = pool.request();

    let paginationClause = '';
    if (page && pageSize) {
      const offset = (page - 1) * pageSize;
      request.input('offset', offset).input('pageSize', pageSize);
      paginationClause = 'OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY';
    }

    const query = `
      SELECT *, COUNT(*) OVER() AS _total_count
      FROM workout_sessions
      WHERE week_id IS NULL
      ORDER BY created_at DESC
      ${paginationClause}
    `;

    const result = await request.query(query);

    if (result.recordset.length === 0) {
      console.warn('No workout sessions found');
      return { sessions: [], totalCount: 0 };
    }

    const totalCount = result.recordset[0]._total_count;

    // Strip the _total_count column from each row
    const sessions = result.recordset.map(({ _total_count, ...session }) => session as WorkoutSession);

    return { sessions, totalCount };
  } catch (error) {
    console.error('Error fetching workout sessions:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function createWorkoutSession(name: string): Promise<string> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('name', name)
      .query(`
        INSERT INTO workout_sessions (name)
        OUTPUT INSERTED.id
        VALUES (@name)
      `);

    return result.recordset[0].id;
  } catch (error) {
    console.error('Error creating workout session:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function getCurrentWorkoutSession(): Promise<WorkoutSession | null> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request().query(`
      SELECT * FROM workout_sessions WHERE is_current = 1
    `);

    if (result.recordset.length === 0) {
      console.warn('No current workout session found');
      return null;
    }

    return result.recordset[0];
  } catch (error) {
    console.error('Error fetching current workout session:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function getWorkoutSessionById(id: string): Promise<WorkoutSession> {
  let pool;
  try {
    pool = await getGolemConnection();
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
      await closeGolemConnection(pool);
    }
  }
}

// Clears all is_current flags across a program, then sets current on the lowest
// incomplete block → week → session. Pass excludeSessionId to skip a session that
// is about to be completed but hasn't been written to the DB yet.
async function advanceProgramCurrent(
  transaction: any,
  programId: string,
  excludeSessionId: string = '00000000-0000-0000-0000-000000000000',
): Promise<void> {

  // Clear all current flags across the program
  await transaction.request()
    .input('programId', programId)
    .query(`
      UPDATE ws
      SET ws.is_current = 0, ws.modified_at = GETDATE()
      FROM workout_sessions ws
      JOIN weeks w ON ws.week_id = w.id
      JOIN blocks b ON w.block_id = b.id
      WHERE b.program_id = @programId AND ws.is_current = 1
    `);

  await transaction.request()
    .input('programId', programId)
    .query(`
      UPDATE w
      SET w.is_current = 0, w.modified_at = GETDATE()
      FROM weeks w
      JOIN blocks b ON w.block_id = b.id
      WHERE b.program_id = @programId AND w.is_current = 1
    `);

  await transaction.request()
    .input('programId', programId)
    .query(`UPDATE blocks SET is_current = 0, modified_at = GETDATE() WHERE program_id = @programId AND is_current = 1`);

  // Find lowest incomplete block
  const blockResult = await transaction.request()
    .input('programId', programId)
    .query(`SELECT TOP 1 id FROM blocks WHERE program_id = @programId AND is_completed = 0 ORDER BY order_index ASC`);

  if (blockResult.recordset.length === 0) return;
  const blockId = blockResult.recordset[0].id;

  await transaction.request()
    .input('blockId', blockId)
    .query(`UPDATE blocks SET is_current = 1, modified_at = GETDATE() WHERE id = @blockId`);

  // Find lowest incomplete week in that block
  const weekResult = await transaction.request()
    .input('blockId', blockId)
    .query(`SELECT TOP 1 id FROM weeks WHERE block_id = @blockId AND is_completed = 0 ORDER BY week_number ASC`);

  if (weekResult.recordset.length === 0) return;
  const weekId = weekResult.recordset[0].id;

  await transaction.request()
    .input('weekId', weekId)
    .query(`UPDATE weeks SET is_current = 1, modified_at = GETDATE() WHERE id = @weekId`);

  // Find lowest incomplete session in that week (excluding the session being completed)
  const sessionResult = await transaction.request()
    .input('weekId', weekId)
    .input('excludeSessionId', excludeSessionId)
    .query(`
      SELECT TOP 1 id FROM workout_sessions
      WHERE week_id = @weekId AND is_completed = 0 AND id != @excludeSessionId
      ORDER BY order_index ASC
    `);

  if (sessionResult.recordset.length > 0) {
    await transaction.request()
      .input('sessionId', sessionResult.recordset[0].id)
      .query(`UPDATE workout_sessions SET is_current = 1, modified_at = GETDATE() WHERE id = @sessionId`);
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

    // Clear is_current from all other sessions in the program (ensures only one active at a time)
    await transaction.request()
      .input('programId', program_id)
      .input('excludeId', id)
      .query(`
        UPDATE ws
        SET ws.is_current = 0, ws.modified_at = GETDATE()
        FROM workout_sessions ws
        JOIN weeks w ON ws.week_id = w.id
        JOIN blocks b ON w.block_id = b.id
        WHERE b.program_id = @programId AND ws.id != @excludeId AND ws.is_current = 1
      `);

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

  // --- Completing: cascade completion markers, then recalculate current pointer ---
  if (isCompleted && !current.is_completed) {

    // Check if all sessions in the week are now complete (excluding the one being completed)
    const weekIncompleteCount = await transaction.request()
      .input('weekId', current.week_id)
      .input('excludeId', id)
      .query(`SELECT COUNT(*) as count FROM workout_sessions WHERE week_id = @weekId AND id != @excludeId AND is_completed = 0`);

    if (weekIncompleteCount.recordset[0].count === 0) {

      // All sessions complete — mark week as complete
      await transaction.request()
        .input('weekId', current.week_id)
        .query(`UPDATE weeks SET is_completed = 1, modified_at = GETDATE() WHERE id = @weekId`);

      // Check if all weeks in the block are now complete
      const blockIncompleteCount = await transaction.request()
        .input('blockId', block_id)
        .query(`SELECT COUNT(*) as count FROM weeks WHERE block_id = @blockId AND is_completed = 0`);

      if (blockIncompleteCount.recordset[0].count === 0) {

        // All weeks complete — mark block as complete
        await transaction.request()
          .input('blockId', block_id)
          .query(`UPDATE blocks SET is_completed = 1, modified_at = GETDATE() WHERE id = @blockId`);

        // Check if all blocks in the program are now complete
        const programIncompleteCount = await transaction.request()
          .input('programId', program_id)
          .query(`SELECT COUNT(*) as count FROM blocks WHERE program_id = @programId AND is_completed = 0`);

        if (programIncompleteCount.recordset[0].count === 0) {

          // All blocks complete — mark program as complete
          await transaction.request()
            .input('programId', program_id)
            .query(`UPDATE programs SET is_completed = 1, modified_at = GETDATE() WHERE id = @programId`);
        }
      }
    }

    // Recalculate the program-wide current pointer (exclude the completing session)
    await advanceProgramCurrent(transaction, program_id, id);
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
  description: string | null,
  review: string | null,
  analysis: string | null,
  startedAt: string | null,
  resumedAt: string | null,
  duration: number | null,
  isCurrent: boolean,
  isCompleted: boolean,
): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
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
        .input('description', description)
        .input('review', review)
        .input('analysis', analysis)
        .input('startedAt', startedAt)
        .input('resumedAt', resumedAt)
        .input('duration', duration)
        .input('isCurrent', isCurrent ? 1 : 0)
        .input('isCompleted', isCompleted ? 1 : 0)
        .query(`
          UPDATE workout_sessions
          SET name = @name, description = @description, review = @review, analysis = @analysis,
              started_at = @startedAt, resumed_at = @resumedAt, duration = @duration,
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
      await closeGolemConnection(pool);
    }
  }
}

export async function deleteWorkoutSession(id: string): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Look up the session's program ID before deleting (NULL for standalone sessions)
      const sessionLookup = await transaction.request()
        .input('id', id)
        .query(`
          SELECT ws.id, b.program_id
          FROM workout_sessions ws
          LEFT JOIN weeks w ON ws.week_id = w.id
          LEFT JOIN blocks b ON w.block_id = b.id
          WHERE ws.id = @id
        `);

      if (sessionLookup.recordset.length === 0) {
        throw new Error(`No workout session found for id: '${id}'`);
      }

      const programId: string | null = sessionLookup.recordset[0].program_id ?? null;

      // Delete sets for all segments in this session
      await transaction.request()
        .input('id', id)
        .query(`
          DELETE FROM session_segment_sets
          WHERE session_segment_id IN (
            SELECT id FROM session_segments WHERE session_id = @id
          )
        `);

      // Delete segments for this session
      await transaction.request()
        .input('id', id)
        .query(`
          DELETE FROM session_segments WHERE session_id = @id
        `);

      // Delete target sets for all target segments in this session
      await transaction.request()
        .input('id', id)
        .query(`
          DELETE FROM target_session_segment_sets
          WHERE target_session_segment_id IN (
            SELECT id FROM target_session_segments WHERE session_id = @id
          )
        `);

      // Delete target segments for this session
      await transaction.request()
        .input('id', id)
        .query(`
          DELETE FROM target_session_segments WHERE session_id = @id
        `);

      // Delete the session
      await transaction.request()
        .input('id', id)
        .query(`
          DELETE FROM workout_sessions WHERE id = @id
        `);

      // Advance the current pointer to the next incomplete session (program sessions only)
      if (programId) {
        await advanceProgramCurrent(transaction, programId);
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
      await closeGolemConnection(pool);
    }
  }
}

// Resets an incomplete session: clears started_at, removes current flag, and advances
// the program-wide current pointer to the lowest incomplete block → week → session.
export async function resetWorkoutSession(id: string): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Get current session state
      const currentResult = await transaction.request()
        .input('id', id)
        .query(`SELECT id, week_id, order_index FROM workout_sessions WHERE id = @id`);

      if (currentResult.recordset.length === 0) {
        throw new Error(`No workout session found for id: '${id}'`);
      }

      const current = currentResult.recordset[0];

      // Delete logged segment sets, then segments
      await transaction.request()
        .input('id', id)
        .query(`
          DELETE FROM session_segment_sets
          WHERE session_segment_id IN (
            SELECT id FROM session_segments WHERE session_id = @id
          )
        `);

      await transaction.request()
        .input('id', id)
        .query(`DELETE FROM session_segments WHERE session_id = @id`);

      if (!current.week_id) {
        // Standalone session — clear timing and status fields
        await transaction.request()
          .input('id', id)
          .query(`
            UPDATE workout_sessions
            SET started_at = NULL, resumed_at = NULL, duration = NULL,
                is_current = 0, is_completed = 0, review = NULL, analysis = NULL,
                modified_at = GETDATE()
            WHERE id = @id
          `);

        await transaction.commit();
        return;
      }

      // Get parent hierarchy
      const hierarchyResult = await transaction.request()
        .input('weekId', current.week_id)
        .query(`
          SELECT w.block_id, b.program_id
          FROM weeks w
          JOIN blocks b ON w.block_id = b.id
          WHERE w.id = @weekId
        `);

      if (hierarchyResult.recordset.length === 0) {
        throw new Error(`No hierarchy found for week: '${current.week_id}'`);
      }

      const { program_id } = hierarchyResult.recordset[0];

      // Clear timing and status fields
      await transaction.request()
        .input('id', id)
        .query(`
          UPDATE workout_sessions
          SET started_at = NULL, resumed_at = NULL, duration = NULL,
              is_current = 0, is_completed = 0, review = NULL, analysis = NULL,
              modified_at = GETDATE()
          WHERE id = @id
        `);

      // Recalculate the program-wide current pointer
      await advanceProgramCurrent(transaction, program_id);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error resetting workout session:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function getWorkoutSessionCount(): Promise<number> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request().query(`
      SELECT COUNT(*) as count FROM workout_sessions
    `);

    return result.recordset[0].count;
  } catch (error) {
    console.error('Error fetching workout session count:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function getTemplateIdForSession(sessionId: string): Promise<string | null> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('sessionId', sessionId)
      .query(`
        SELECT p.template_id
        FROM workout_sessions ws
        JOIN weeks w ON ws.week_id = w.id
        JOIN blocks b ON w.block_id = b.id
        JOIN programs p ON b.program_id = p.id
        WHERE ws.id = @sessionId
      `);

    if (result.recordset.length === 0) {
      return null;
    }

    return result.recordset[0].template_id;
  } catch (error) {
    console.error('Error fetching template id for session:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}
