import { getGolemConnection, closeGolemConnection } from './db';
import { WorkoutSession, WorkoutSessionHistoryItem } from '../types/workoutSession';
import { clearProgramCurrentFlags } from './programFunctions';

export async function getAllWorkoutSessions(userId: string, page?: number, pageSize?: number, scope: 'all' | 'standalone' = 'all'): Promise<{ sessions: WorkoutSessionHistoryItem[]; totalCount: number }> {
  let pool;
  try {
    pool = await getGolemConnection();

    const request = pool.request();
    request.input('userId', userId);

    let paginationClause = '';
    if (page && pageSize) {
      const offset = (page - 1) * pageSize;
      request.input('offset', offset).input('pageSize', pageSize);
      paginationClause = 'OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY';
    }

    // 'standalone' keeps the legacy behavior (ad-hoc sessions only); 'all' includes program sessions.
    const scopeClause = scope === 'standalone' ? 'AND ws.week_id IS NULL' : '';

    // LEFT JOIN up the program hierarchy (week -> block -> program) so each session carries its
    // program context. Standalone sessions (week_id IS NULL) get NULLs for the program columns.
    // Order by started_at when present (program sessions are batch-generated, so created_at clusters them).
    const query = `
      SELECT
        ws.*,
        p.id AS program_id,
        p.name AS program_name,
        b.name AS block_name,
        w.week_number AS week_number,
        COUNT(*) OVER() AS _total_count
      FROM workout_sessions ws
      LEFT JOIN weeks w ON ws.week_id = w.id
      LEFT JOIN blocks b ON w.block_id = b.id
      LEFT JOIN programs p ON b.program_id = p.id
      WHERE ws.user_id = @userId ${scopeClause}
      ORDER BY COALESCE(ws.started_at, ws.created_at) DESC
      ${paginationClause}
    `;

    const result = await request.query(query);

    if (result.recordset.length === 0) {
      console.warn('No workout sessions found');
      return { sessions: [], totalCount: 0 };
    }

    const totalCount = result.recordset[0]._total_count;

    // Strip the _total_count column from each row
    const sessions = result.recordset.map(({ _total_count, ...session }) => session as WorkoutSessionHistoryItem);

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

export async function createWorkoutSession(
  userId: string,
  name: string,
  description: string | null = null,
  dayArchetypeId: string | null = null, // optional engine archetype to generate the session from
): Promise<string> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('name', name)
      .input('description', description)
      .input('dayArchetypeId', dayArchetypeId)
      .query(`
        INSERT INTO workout_sessions (user_id, name, description, day_archetype_id)
        OUTPUT INSERTED.id
        VALUES (@userId, @name, @description, @dayArchetypeId)
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

// Create a session INSIDE a program week (vs. createWorkoutSession which makes a standalone session).
// Validates the week belongs to the user (via its program), resolves order_index (append at the end by
// default, or insert at an explicit position shifting later sessions down), and optionally links a day
// archetype. New sessions are incomplete/non-current with no started_at (table defaults). Returns the new id.
export async function createProgramSession(
  userId: string,
  weekId: string,
  input: { name: string; description?: string | null; dayArchetypeId?: string | null; orderIndex?: number | null },
): Promise<string> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();
    try {
      // Validate the week exists and belongs to this user (scoped via blocks → programs.user_id).
      const weekCheck = await transaction.request()
        .input('userId', userId)
        .input('weekId', weekId)
        .query(`
          SELECT w.id FROM weeks w
          JOIN blocks b ON w.block_id = b.id
          JOIN programs p ON b.program_id = p.id
          WHERE w.id = @weekId AND p.user_id = @userId
        `);
      if (weekCheck.recordset.length === 0) {
        throw new Error(`No week found for id: '${weekId}'`);
      }

      // Resolve order_index: explicit position shifts later siblings down; otherwise append at the end.
      let orderIndex: number;
      if (input.orderIndex != null) {
        orderIndex = input.orderIndex;
        await transaction.request()
          .input('weekId', weekId)
          .input('orderIndex', orderIndex)
          .query(`UPDATE workout_sessions SET order_index = order_index + 1, modified_at = GETDATE()
                  WHERE week_id = @weekId AND order_index >= @orderIndex`);
      } else {
        const maxResult = await transaction.request()
          .input('weekId', weekId)
          .query(`SELECT ISNULL(MAX(order_index), -1) AS maxIdx FROM workout_sessions WHERE week_id = @weekId`);
        orderIndex = maxResult.recordset[0].maxIdx + 1;
      }

      const result = await transaction.request()
        .input('userId', userId)
        .input('weekId', weekId)
        .input('orderIndex', orderIndex)
        .input('name', input.name)
        .input('description', input.description ?? null)
        .input('dayArchetypeId', input.dayArchetypeId ?? null)
        .query(`
          INSERT INTO workout_sessions (user_id, week_id, order_index, name, description, day_archetype_id)
          OUTPUT INSERTED.id
          VALUES (@userId, @weekId, @orderIndex, @name, @description, @dayArchetypeId)
        `);

      await transaction.commit();
      return result.recordset[0].id;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error creating program session:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function getCurrentWorkoutSession(userId: string): Promise<WorkoutSession | null> {
  let pool;
  try {
    pool = await getGolemConnection();
    // Defense in depth: there should only ever be one current session, but if stale flags leave more
    // than one (see the program-aware clearing in setWorkoutSessionAsCurrent), resolve deterministically —
    // prefer the session belonging to the current program, then the most recently touched — instead of
    // returning an arbitrary row.
    const result = await pool.request()
      .input('userId', userId)
      .query(`
        SELECT TOP 1 ws.*
        FROM workout_sessions ws
        LEFT JOIN weeks w ON ws.week_id = w.id
        LEFT JOIN blocks b ON w.block_id = b.id
        LEFT JOIN programs p ON b.program_id = p.id
        WHERE ws.is_current = 1 AND ws.user_id = @userId
        ORDER BY CASE WHEN p.is_current = 1 THEN 0 ELSE 1 END, ws.modified_at DESC
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

export async function getWorkoutSessionById(userId: string, id: string): Promise<WorkoutSession> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('id', id)
      .query(`
        SELECT ws.*, da.name AS day_archetype_name
        FROM workout_sessions ws
        LEFT JOIN day_archetypes da ON da.id = ws.day_archetype_id
        WHERE ws.id = @id AND ws.user_id = @userId
      `);

    if (result.recordset.length === 0) {
      throw new Error(`No workout session found for id: '${id}'`);
    }

    const session = result.recordset[0];

    // Bundle the assigned archetype's slots with the session so the empty-session slot preview renders
    // immediately with the session details (no follow-up /day-archetypes round trip → no lag). Same query
    // shape as getDayArchetypeWithSlots so the client can reuse the DaySlot type directly.
    if (session.day_archetype_id) {
      const slotsResult = await pool.request()
        .input('userId', userId)
        .input('archetypeId', session.day_archetype_id)
        .query(`
          SELECT s.id, s.day_archetype_id, s.order_index, s.role, s.target_muscle_group_id,
                 mg.name AS target_muscle_name, s.category_filter, s.rotation_cadence,
                 s.pinned_exercise_id, ex.name AS pinned_exercise_name, s.is_optional, s.is_warmup,
                 s.progression_model, s.rep_low, s.rep_high, s.time_low_seconds, s.time_high_seconds,
                 s.target_rpe, s.load_step_pct, s.round_to_step, s.set_target
          FROM day_slots s
          LEFT JOIN muscle_groups mg ON mg.id = s.target_muscle_group_id
          LEFT JOIN exercises ex ON ex.id = s.pinned_exercise_id
          WHERE s.day_archetype_id = @archetypeId AND s.user_id = @userId
          ORDER BY s.order_index
        `);
      session.day_archetype_slots = slotsResult.recordset;
    } else {
      session.day_archetype_slots = [];
    }

    return session;
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

  // Find lowest incomplete block (has a week with no sessions or at least one incomplete session)
  const blockResult = await transaction.request()
    .input('programId', programId)
    .query(`
      SELECT TOP 1 b.id FROM blocks b
      WHERE b.program_id = @programId
        AND EXISTS (
          SELECT 1 FROM weeks w
          WHERE w.block_id = b.id
            AND (
              NOT EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.week_id = w.id)
              OR EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.week_id = w.id AND ws.is_completed = 0)
            )
        )
      ORDER BY b.order_index ASC
    `);

  if (blockResult.recordset.length === 0) return;
  const blockId = blockResult.recordset[0].id;

  await transaction.request()
    .input('blockId', blockId)
    .query(`UPDATE blocks SET is_current = 1, modified_at = GETDATE() WHERE id = @blockId`);

  // Find lowest incomplete week in that block (no sessions or at least one incomplete session)
  const weekResult = await transaction.request()
    .input('blockId', blockId)
    .query(`
      SELECT TOP 1 w.id FROM weeks w
      WHERE w.block_id = @blockId
        AND (
          NOT EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.week_id = w.id)
          OR EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.week_id = w.id AND ws.is_completed = 0)
        )
      ORDER BY w.week_number ASC
    `);

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

// Resolve the user's active program inside an OPEN transaction. Same rule as getCurrentProgramId()
// in programFunctions, but reusing the caller's transaction rather than opening a second pool (which
// would deadlock against the uncommitted writes the caller is making).
async function getActiveProgramIdTx(transaction: any, userId: string): Promise<string | null> {
  const result = await transaction.request()
    .input('userId', userId)
    .query(`SELECT TOP 1 id FROM programs WHERE is_current = 1 AND is_archived = 0 AND user_id = @userId`);

  return result.recordset[0]?.id ?? null;
}

// A standalone (one-off) session BORROWS the single current-session pointer from the active program
// rather than evicting it. Only the program's session-level is_current is parked here — its program,
// block, and week flags stay set, so the program is still the current program the whole time the
// one-off workout is in progress, and restoreProgramSessionPointer() can hand the pointer back.
async function parkProgramSessionPointer(transaction: any, programId: string): Promise<void> {
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
}

// Give the current-session pointer back to the active program once a standalone session stops being
// current (completed, reset, or deleted). Without this, finishing a one-off workout leaves the account
// with zero current sessions and nothing to advance from. Lands on the lowest incomplete block → week →
// session, exactly as completing a program session does.
async function restoreProgramSessionPointer(transaction: any, userId: string): Promise<void> {
  const activeProgramId = await getActiveProgramIdTx(transaction, userId);
  if (!activeProgramId) return; // no program to fall back to — a standalone-only user stays pointer-less

  await advanceProgramCurrent(transaction, activeProgramId);
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
// 6. Standalone (one-off) session becoming current: borrows the pointer from the active program;
//    on stopping being current, hands it back to the program's next incomplete session.
async function updateStatus(
  transaction: any,
  userId: string,
  id: string,
  current: { week_id: string | null; order_index: number | null; is_current: boolean; is_completed: boolean },
  isCurrent: boolean,
  isCompleted: boolean,
): Promise<void> {

  // --- Standalone session: no week/block/program hierarchy to propagate through, but it still competes
  // for the single current-session pointer that getCurrentWorkoutSession reads. Borrow it on the way in
  // and hand it back on the way out, so finishing a one-off workout lands on the program's next session
  // instead of leaving the user with nothing current at all.
  if (!current.week_id) {
    if (isCurrent && !current.is_current) {
      const activeProgramId = await getActiveProgramIdTx(transaction, userId);
      if (activeProgramId) await parkProgramSessionPointer(transaction, activeProgramId);
    } else if (current.is_current && !isCurrent) {
      await restoreProgramSessionPointer(transaction, userId);
    }
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

  // --- Completing: check program completion, then recalculate current pointer ---
  if (isCompleted && !current.is_completed) {

    // Check if all sessions across the entire program are now complete (excluding the one being completed)
    // and no weeks exist without sessions (ungenerated weeks mean the program is not finished)
    const programIncompleteCount = await transaction.request()
      .input('programId', program_id)
      .input('excludeId', id)
      .query(`
        SELECT COUNT(*) as count FROM workout_sessions ws
        JOIN weeks w ON ws.week_id = w.id
        JOIN blocks b ON w.block_id = b.id
        WHERE b.program_id = @programId AND ws.id != @excludeId AND ws.is_completed = 0
      `);

    const emptyWeekCount = await transaction.request()
      .input('programId', program_id)
      .query(`
        SELECT COUNT(*) as count FROM weeks w
        JOIN blocks b ON w.block_id = b.id
        WHERE b.program_id = @programId
          AND NOT EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.week_id = w.id)
      `);

    if (programIncompleteCount.recordset[0].count === 0 && emptyWeekCount.recordset[0].count === 0) {

      // All sessions complete and no empty weeks — mark program as complete
      await transaction.request()
        .input('programId', program_id)
        .query(`UPDATE programs SET is_completed = 1, modified_at = GETDATE() WHERE id = @programId`);
    }

    // Recalculate the program-wide current pointer (exclude the completing session)
    await advanceProgramCurrent(transaction, program_id, id);
  }

  // --- Uncompleting (resuming): unmark program completion ---
  if (!isCompleted && current.is_completed) {

    // Program may no longer be complete since a session was resumed
    await transaction.request()
      .input('programId', program_id)
      .query(`UPDATE programs SET is_completed = 0, modified_at = GETDATE() WHERE id = @programId AND is_completed = 1`);
  }
}

export async function updateWorkoutSession(
  userId: string,
  id: string,
  name: string,
  description: string | null,
  review: string | null,
  analysis: string | null,
  startedAt: Date | null,
  resumedAt: Date | null,
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
        .input('userId', userId)
        .input('id', id)
        .query(`SELECT id, week_id, order_index, is_current, is_completed FROM workout_sessions WHERE id = @id AND user_id = @userId`);

      if (currentResult.recordset.length === 0) {
        throw new Error(`No workout session found for id: '${id}'`);
      }

      const current = currentResult.recordset[0];

      // Propagate status changes to siblings, parent week, and parent block
      await updateStatus(transaction, userId, id, current, isCurrent, isCompleted);

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

// Make a workout session the user's current/active session. Reuses the same "becoming current"
// propagation as updateWorkoutSession (clears is_current on every other session in the program and
// syncs the parent week/block pointers) without touching the session's name/timer/completion fields.
export async function setWorkoutSessionAsCurrent(userId: string, id: string): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Get current session state for status propagation diffing
      const currentResult = await transaction.request()
        .input('userId', userId)
        .input('id', id)
        .query(`SELECT id, week_id, order_index, is_current, is_completed FROM workout_sessions WHERE id = @id AND user_id = @userId`);

      if (currentResult.recordset.length === 0) {
        throw new Error(`No workout session found for id: '${id}'`);
      }

      const current = currentResult.recordset[0];

      // Already current — nothing to do
      if (current.is_current) {
        await transaction.commit();
        return;
      }

      // Resolve the target session's program (null for standalone sessions), so we can make this a
      // PROGRAM-AWARE switch. updateStatus only clears current flags WITHIN the target's own program;
      // it never deactivates a different program. Without the block below, selecting a session in
      // program B while program A is active leaves BOTH programs carrying current flags — two
      // is_current sessions — which getCurrentWorkoutSession then resolves nondeterministically.
      const targetProgramResult = await transaction.request()
        .input('id', id)
        .query(`
          SELECT b.program_id
          FROM workout_sessions ws
          LEFT JOIN weeks w ON ws.week_id = w.id
          LEFT JOIN blocks b ON w.block_id = b.id
          WHERE ws.id = @id
        `);
      const targetProgramId: string | null = targetProgramResult.recordset[0]?.program_id ?? null;

      // Deactivate any OTHER program that is still flagged current (clears its session/week/block/program
      // flags), then activate the target's program. This mirrors the program switch done by activateProgram.
      //
      // Only when the target actually belongs to a program. Picking a STANDALONE session is not a program
      // switch — it is a one-off workout slotted in alongside the plan — so the active program keeps every
      // flag and updateStatus below merely parks its session pointer. Clearing the program here instead
      // (targetProgramId being NULL, nothing re-activates it) is what used to strand the user with no
      // current program AND no current session once the one-off workout was completed.
      if (targetProgramId) {
        const otherCurrentPrograms = await transaction.request()
          .input('userId', userId)
          .input('targetProgramId', targetProgramId)
          .query(`
            SELECT id FROM programs
            WHERE is_current = 1 AND user_id = @userId AND id != @targetProgramId
          `);

        for (const program of otherCurrentPrograms.recordset) {
          await clearProgramCurrentFlags(transaction, userId, program.id);
        }
      }

      // Clear any lingering current flag on standalone sessions (no program) other than the target, so the
      // single-current-session invariant also holds when switching to/from one-off sessions.
      await transaction.request()
        .input('userId', userId)
        .input('id', id)
        .query(`
          UPDATE workout_sessions SET is_current = 0, modified_at = GETDATE()
          WHERE user_id = @userId AND id != @id AND is_current = 1 AND week_id IS NULL
        `);

      // Activate the target's program (no-op for standalone sessions)
      if (targetProgramId) {
        await transaction.request()
          .input('programId', targetProgramId)
          .query(`UPDATE programs SET is_current = 1, modified_at = GETDATE() WHERE id = @programId AND is_current = 0`);
      }

      // Propagate the become-current change up to the parent week and block (preserve completion state)
      await updateStatus(transaction, userId, id, current, true, !!current.is_completed);

      // Flag this session as current
      await transaction.request()
        .input('id', id)
        .query(`UPDATE workout_sessions SET is_current = 1, modified_at = GETDATE() WHERE id = @id`);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error setting workout session as current:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function deleteWorkoutSession(userId: string, id: string): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Look up the session's program ID before deleting (NULL for standalone sessions)
      const sessionLookup = await transaction.request()
        .input('userId', userId)
        .input('id', id)
        .query(`
          SELECT ws.id, ws.is_current, b.program_id
          FROM workout_sessions ws
          LEFT JOIN weeks w ON ws.week_id = w.id
          LEFT JOIN blocks b ON w.block_id = b.id
          WHERE ws.id = @id AND ws.user_id = @userId
        `);

      if (sessionLookup.recordset.length === 0) {
        throw new Error(`No workout session found for id: '${id}'`);
      }

      const programId: string | null = sessionLookup.recordset[0].program_id ?? null;
      const wasCurrent: boolean = !!sessionLookup.recordset[0].is_current;

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

      // Advance the current pointer to the next incomplete session
      if (programId) {
        await advanceProgramCurrent(transaction, programId);
      } else if (wasCurrent) {
        // Standalone session that held the pointer — give it back to the active program
        await restoreProgramSessionPointer(transaction, userId);
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
export async function resetWorkoutSession(userId: string, id: string): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Get current session state
      const currentResult = await transaction.request()
        .input('userId', userId)
        .input('id', id)
        .query(`SELECT id, week_id, order_index, is_current FROM workout_sessions WHERE id = @id AND user_id = @userId`);

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

      // Also clear the generated target segments (the filled day-archetype slots) so a reset returns the
      // session to its pre-generation state — not just its logged sets. Logged segments (which FK-reference
      // these targets via target_id) are already deleted above, so the targets can be removed directly.
      await transaction.request()
        .input('id', id)
        .query(`
          DELETE FROM target_session_segment_sets
          WHERE target_session_segment_id IN (
            SELECT id FROM target_session_segments WHERE session_id = @id
          )
        `);

      await transaction.request()
        .input('id', id)
        .query(`DELETE FROM target_session_segments WHERE session_id = @id`);

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

        // The reset just dropped is_current — hand the pointer back to the active program rather than
        // leaving the account with nothing current.
        if (current.is_current) {
          await restoreProgramSessionPointer(transaction, userId);
        }

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

export async function getWorkoutSessionCount(userId: string): Promise<number> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .query(`
        SELECT COUNT(*) as count FROM workout_sessions WHERE user_id = @userId
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

export async function getTemplateIdForSession(userId: string, sessionId: string): Promise<string | null> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('sessionId', sessionId)
      .query(`
        SELECT p.template_id
        FROM workout_sessions ws
        JOIN weeks w ON ws.week_id = w.id
        JOIN blocks b ON w.block_id = b.id
        JOIN programs p ON b.program_id = p.id
        WHERE ws.id = @sessionId AND ws.user_id = @userId
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
