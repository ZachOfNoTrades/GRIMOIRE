import { getGolemConnection, closeGolemConnection } from './db';
import { Program, ProgramBlock, ProgramSummary, ProgramWeek, ProgramSession, CreateProgramPayload } from '../types/program';

export async function getAllPrograms(userId: string, page?: number, pageSize?: number, includeArchived: boolean = false): Promise<{ programs: ProgramSummary[]; totalCount: number }> {
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

    const archiveFilter = includeArchived ? 'WHERE user_id = @userId' : 'WHERE user_id = @userId AND is_archived = 0';

    const query = `
      SELECT *, COUNT(*) OVER() AS _total_count
      FROM (
        SELECT id, name, description, template_id, is_current, is_completed, is_archived, created_at, modified_at
        FROM programs
        ${archiveFilter}
      ) p
      ORDER BY created_at DESC
      ${paginationClause}
    `;

    const result = await request.query(query);

    if (result.recordset.length === 0) {
      console.warn('No programs found');
      return { programs: [], totalCount: 0 };
    }

    const totalCount = result.recordset[0]._total_count;

    // Strip the _total_count column from each row
    const programs = result.recordset.map(({ _total_count, ...program }) => program as ProgramSummary);

    return { programs, totalCount };
  } catch (error) {
    console.error('Error fetching programs:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function getCurrentProgramId(userId: string): Promise<string | null> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .query(`
        SELECT id FROM programs WHERE is_current = 1 AND is_archived = 0 AND user_id = @userId
      `);

    if (result.recordset.length === 0) {
      return null;
    }

    return result.recordset[0].id;
  } catch (error) {
    console.error('Error fetching current program id:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function getProgramById(userId: string, programId: string): Promise<Program> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('programId', programId)
      .query(`
        SELECT
          p.id              AS program_id,
          p.name            AS program_name,
          p.description     AS program_description,
          p.template_id     AS program_template_id,
          p.is_current      AS program_is_current,
          p.is_completed    AS program_is_completed,
          p.is_archived     AS program_is_archived,
          p.created_at      AS program_created_at,
          p.modified_at     AS program_modified_at,
          b.id              AS block_id,
          b.name            AS block_name,
          b.order_index     AS block_order_index,
          b.description     AS block_description,
          b.tag             AS block_tag,
          b.color           AS block_color,
          b.is_current      AS block_is_current,
          CAST(CASE WHEN EXISTS (
            SELECT 1 FROM weeks w_chk
            JOIN workout_sessions ws_chk ON ws_chk.week_id = w_chk.id
            WHERE w_chk.block_id = b.id
          ) AND NOT EXISTS (
            SELECT 1 FROM weeks w_chk2
            JOIN workout_sessions ws_chk2 ON ws_chk2.week_id = w_chk2.id
            WHERE w_chk2.block_id = b.id AND ws_chk2.is_completed = 0
          ) AND NOT EXISTS (
            SELECT 1 FROM weeks w_chk3
            WHERE w_chk3.block_id = b.id
              AND NOT EXISTS (SELECT 1 FROM workout_sessions ws_chk3 WHERE ws_chk3.week_id = w_chk3.id)
          ) THEN 1 ELSE 0 END AS BIT) AS block_is_completed,
          w.id              AS week_id,
          w.week_number,
          w.name            AS week_name,
          w.description     AS week_description,
          w.is_current      AS week_is_current,
          CAST(CASE WHEN EXISTS (
            SELECT 1 FROM workout_sessions ws_wchk
            WHERE ws_wchk.week_id = w.id
          ) AND NOT EXISTS (
            SELECT 1 FROM workout_sessions ws_wchk2
            WHERE ws_wchk2.week_id = w.id AND ws_wchk2.is_completed = 0
          ) THEN 1 ELSE 0 END AS BIT) AS week_is_completed,
          COALESCE((
            SELECT SUM(ses.reps * ses.weight)
            FROM session_segment_sets ses
            JOIN session_segments se ON ses.session_segment_id = se.id
            JOIN workout_sessions ws2 ON se.session_id = ws2.id
            WHERE ws2.week_id = w.id AND ses.is_warmup = 0
          ), 0)             AS week_volume,
          CAST(CASE WHEN EXISTS (
            SELECT 1
            FROM target_session_segments tse
            JOIN workout_sessions ws3 ON tse.session_id = ws3.id
            WHERE ws3.week_id = w.id
          ) THEN 1 ELSE 0 END AS BIT) AS week_has_targets,
          ws.id             AS session_id,
          ws.name           AS session_name,
          ws.description    AS session_description,
          ws.order_index    AS session_order_index,
          ws.started_at     AS session_started_at,
          ws.resumed_at     AS session_resumed_at,
          ws.duration        AS session_duration,
          ws.is_current     AS session_is_current,
          ws.is_completed   AS session_is_completed
        FROM programs p
        LEFT JOIN blocks b ON b.program_id = p.id
        LEFT JOIN weeks w ON w.block_id = b.id
        LEFT JOIN workout_sessions ws ON ws.week_id = w.id
        WHERE p.id = @programId AND p.user_id = @userId
        ORDER BY b.order_index, w.week_number, ws.order_index
      `);

    if (result.recordset.length === 0) {
      throw new Error(`No program found for id: '${programId}'`);
    }

    // Build nested Program > Blocks > Weeks > Sessions from flat rows
    const firstRow = result.recordset[0];
    const program: Program = {
      id: firstRow.program_id,
      name: firstRow.program_name,
      description: firstRow.program_description,
      template_id: firstRow.program_template_id,
      is_current: firstRow.program_is_current,
      is_completed: firstRow.program_is_completed,
      is_archived: firstRow.program_is_archived,
      created_at: firstRow.program_created_at,
      modified_at: firstRow.program_modified_at,
      blocks: [],
    };

    const blockMap = new Map<string, ProgramBlock>();
    const weekMap = new Map<string, ProgramWeek>();

    for (const row of result.recordset) {
      if (!row.block_id) continue;

      if (!blockMap.has(row.block_id)) {
        const block: ProgramBlock = {
          id: row.block_id,
          name: row.block_name,
          order_index: row.block_order_index,
          description: row.block_description,
          tag: row.block_tag,
          color: row.block_color,
          is_current: row.block_is_current,
          is_completed: row.block_is_completed,
          weeks: [],
        };
        blockMap.set(row.block_id, block);
        program.blocks.push(block);
      }

      if (!row.week_id) continue;

      const block = blockMap.get(row.block_id)!;
      if (!weekMap.has(row.week_id)) {
        const week: ProgramWeek = {
          id: row.week_id,
          week_number: row.week_number,
          name: row.week_name,
          description: row.week_description,
          is_current: row.week_is_current,
          is_completed: row.week_is_completed,
          volume: row.week_volume,
          has_targets: row.week_has_targets,
          sessions: [],
        };
        weekMap.set(row.week_id, week);
        block.weeks.push(week);
      }

      if (!row.session_id) continue;

      const week = weekMap.get(row.week_id)!;
      const session: ProgramSession = {
        id: row.session_id,
        name: row.session_name,
        description: row.session_description,
        order_index: row.session_order_index,
        started_at: row.session_started_at,
        resumed_at: row.session_resumed_at,
        duration: row.session_duration,
        is_current: row.session_is_current,
        is_completed: row.session_is_completed,
      };
      week.sessions.push(session);
    }

    return program;
  } catch (error) {
    console.error('Error fetching program:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Clears is_current on a program and all of its blocks, weeks, and sessions.
async function clearProgramCurrentFlags(transaction: any, userId: string, programId: string): Promise<void> {
  // Clear current flags on sessions within the program
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

  // Clear current flags on weeks within the program
  await transaction.request()
    .input('programId', programId)
    .query(`
      UPDATE w
      SET w.is_current = 0, w.modified_at = GETDATE()
      FROM weeks w
      JOIN blocks b ON w.block_id = b.id
      WHERE b.program_id = @programId AND w.is_current = 1
    `);

  // Clear current flags on blocks within the program
  await transaction.request()
    .input('programId', programId)
    .query(`UPDATE blocks SET is_current = 0, modified_at = GETDATE() WHERE program_id = @programId AND is_current = 1`);

  // Clear current flag on the program itself
  await transaction.request()
    .input('programId', programId)
    .query(`UPDATE programs SET is_current = 0, modified_at = GETDATE() WHERE id = @programId`);
}

// Set is_current as true for given program and its lowest incomplete session
async function setProgramAsCurrent(transaction: any, userId: string, programId: string): Promise<void> {

  // DEACTIVATE CURRENT PROGRAM

  const currentResult = await transaction.request()
    .input('userId', userId)
    .input('programId', programId)
    .query(`SELECT id FROM programs WHERE is_current = 1 AND id != @programId AND user_id = @userId`);

  if (currentResult.recordset.length > 0) {
    await clearProgramCurrentFlags(transaction, userId, currentResult.recordset[0].id);
  }

  // Set the new program as current
  await transaction.request()
    .input('programId', programId)
    .query(`UPDATE programs SET is_current = 1, modified_at = GETDATE() WHERE id = @programId`);

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

  // Find lowest incomplete session in that week
  const sessionResult = await transaction.request()
    .input('weekId', weekId)
    .query(`SELECT TOP 1 id FROM workout_sessions WHERE week_id = @weekId AND is_completed = 0 ORDER BY order_index ASC`);

  if (sessionResult.recordset.length === 0) return;

  // Set is_current to true for session
  await transaction.request()
    .input('sessionId', sessionResult.recordset[0].id)
    .query(`UPDATE workout_sessions SET is_current = 1, modified_at = GETDATE() WHERE id = @sessionId`);
}

// Create full program with all children records, returns GUID assigned from database
export async function createProgram(userId: string, payload: CreateProgramPayload, templateId?: string | null): Promise<string> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Create program (is_current flag is handled later by setProgramAsCurrent())
      const programResult = await transaction.request()
        .input('userId', userId)
        .input('name', payload.name)
        .input('description', payload.description)
        .input('templateId', templateId ?? null)
        .query(`
          INSERT INTO programs (user_id, name, description, template_id)
          OUTPUT INSERTED.id
          VALUES (@userId, @name, @description, @templateId)
        `);

      const programId = programResult.recordset[0].id;

      // CREATE CHILD RECORDS (blocks → weeks → sessions → target exercises → target sets)

      for (const block of payload.blocks) {
        const blockResult = await transaction.request()
          .input('programId', programId)
          .input('name', block.name)
          .input('orderIndex', block.order_index)
          .input('description', block.description)
          .input('tag', block.tag)
          .input('color', block.color)
          .query(`
            INSERT INTO blocks (program_id, name, order_index, description, tag, color)
            OUTPUT INSERTED.id
            VALUES (@programId, @name, @orderIndex, @description, @tag, @color)
          `);

        const blockId = blockResult.recordset[0].id;

        for (const week of block.weeks) {
          const weekResult = await transaction.request()
            .input('blockId', blockId)
            .input('weekNumber', week.week_number)
            .input('name', week.name)
            .input('description', week.description)
            .query(`
              INSERT INTO weeks (block_id, week_number, name, description)
              OUTPUT INSERTED.id
              VALUES (@blockId, @weekNumber, @name, @description)
            `);

          const weekId = weekResult.recordset[0].id;

          for (const session of week.sessions) {
            const sessionResult = await transaction.request()
              .input('userId', userId)
              .input('weekId', weekId)
              .input('orderIndex', session.order_index)
              .input('name', session.name)
              .input('description', session.description ?? null)
              .query(`
                INSERT INTO workout_sessions (user_id, week_id, order_index, name, description)
                OUTPUT INSERTED.id
                VALUES (@userId, @weekId, @orderIndex, @name, @description)
              `);

            const sessionId = sessionResult.recordset[0].id;

            for (const targetExercise of session.target_exercises) {
              const targetExerciseResult = await transaction.request()
                .input('sessionId', sessionId)
                .input('exerciseId', targetExercise.exercise_id)
                .input('orderIndex', targetExercise.order_index)
                .query(`
                  INSERT INTO target_session_segments (session_id, exercise_id, order_index)
                  OUTPUT INSERTED.id
                  VALUES (@sessionId, @exerciseId, @orderIndex)
                `);

              const targetExerciseId = targetExerciseResult.recordset[0].id;

              for (const targetSet of targetExercise.sets) {
                await transaction.request()
                  .input('targetSessionSegmentId', targetExerciseId)
                  .input('setNumber', targetSet.set_number)
                  .input('isWarmup', targetSet.is_warmup ? 1 : 0)
                  .input('reps', targetSet.reps)
                  .input('weight', targetSet.weight)
                  .input('rpe', targetSet.rpe)
                  .query(`
                    INSERT INTO target_session_segment_sets (target_session_segment_id, set_number, is_warmup, reps, weight, rpe)
                    VALUES (@targetSessionSegmentId, @setNumber, @isWarmup, @reps, @weight, @rpe)
                  `);
              }
            }
          }
        }
      }

      // Activate the new program
      await setProgramAsCurrent(transaction, userId, programId);

      await transaction.commit();
      return programId;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error creating program:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function getTemplateIdForProgram(userId: string, programId: string): Promise<string | null> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('programId', programId)
      .query(`SELECT template_id FROM programs WHERE id = @programId AND user_id = @userId`);

    if (result.recordset.length === 0) {
      throw new Error(`No program found for id: '${programId}'`);
    }

    return result.recordset[0].template_id;
  } catch (error) {
    console.error('Error fetching template id for program:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Returns the first week's ID and block tag for a program (first block, first week by order)
export async function getFirstWeekId(userId: string, programId: string): Promise<{ weekId: string; blockTag: string | null } | null> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('programId', programId)
      .query(`
        SELECT TOP 1 w.id AS week_id, b.tag AS block_tag
        FROM weeks w
        JOIN blocks b ON w.block_id = b.id
        JOIN programs p ON b.program_id = p.id
        WHERE b.program_id = @programId AND p.user_id = @userId
        ORDER BY b.order_index ASC, w.week_number ASC
      `);

    if (result.recordset.length === 0) {
      return null;
    }

    return {
      weekId: result.recordset[0].week_id,
      blockTag: result.recordset[0].block_tag,
    };
  } catch (error) {
    console.error('Error fetching first week id for program:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function archiveProgram(userId: string, programId: string, isArchived: boolean): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // If archiving, clear is_current flags on the program and all descendants
      if (isArchived) {
        await clearProgramCurrentFlags(transaction, userId, programId);
      }

      const result = await transaction.request()
        .input('userId', userId)
        .input('programId', programId)
        .input('isArchived', isArchived ? 1 : 0)
        .query(`
          UPDATE programs
          SET is_archived = @isArchived, modified_at = GETDATE()
          WHERE id = @programId AND user_id = @userId
        `);

      if (result.rowsAffected[0] === 0) {
        throw new Error(`No program found for id: '${programId}'`);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error archiving program:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function activateProgram(userId: string, programId: string): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      await setProgramAsCurrent(transaction, userId, programId);
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error activating program:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function deleteProgram(userId: string, programId: string): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();

    // Guard: prevent deletion if any session has been completed
    const completedCheck = await pool.request()
      .input('userId', userId)
      .input('programId', programId)
      .query(`
        SELECT COUNT(*) as count FROM workout_sessions ws
        JOIN weeks w ON ws.week_id = w.id
        JOIN blocks b ON w.block_id = b.id
        JOIN programs p ON b.program_id = p.id
        WHERE b.program_id = @programId AND p.user_id = @userId AND ws.is_completed = 1
      `);

    if (completedCheck.recordset[0].count > 0) {
      throw new Error('Cannot delete a program with completed sessions');
    }

    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Clear current flags before deleting
      await clearProgramCurrentFlags(transaction, userId, programId);

      // Delete in dependency order: sets → segments → targets → sessions → weeks → blocks → program
      await transaction.request().input('programId', programId).query(`
        DELETE tss FROM target_session_segment_sets tss
        JOIN target_session_segments ts ON tss.target_session_segment_id = ts.id
        JOIN workout_sessions ws ON ts.session_id = ws.id
        JOIN weeks w ON ws.week_id = w.id
        JOIN blocks b ON w.block_id = b.id
        WHERE b.program_id = @programId
      `);
      await transaction.request().input('programId', programId).query(`
        DELETE ts FROM target_session_segments ts
        JOIN workout_sessions ws ON ts.session_id = ws.id
        JOIN weeks w ON ws.week_id = w.id
        JOIN blocks b ON w.block_id = b.id
        WHERE b.program_id = @programId
      `);
      await transaction.request().input('programId', programId).query(`
        DELETE ss FROM session_segment_sets ss
        JOIN session_segments se ON ss.session_segment_id = se.id
        JOIN workout_sessions ws ON se.session_id = ws.id
        JOIN weeks w ON ws.week_id = w.id
        JOIN blocks b ON w.block_id = b.id
        WHERE b.program_id = @programId
      `);
      await transaction.request().input('programId', programId).query(`
        DELETE se FROM session_segments se
        JOIN workout_sessions ws ON se.session_id = ws.id
        JOIN weeks w ON ws.week_id = w.id
        JOIN blocks b ON w.block_id = b.id
        WHERE b.program_id = @programId
      `);
      await transaction.request().input('programId', programId).query(`
        DELETE ws FROM workout_sessions ws
        JOIN weeks w ON ws.week_id = w.id
        JOIN blocks b ON w.block_id = b.id
        WHERE b.program_id = @programId
      `);
      await transaction.request().input('programId', programId).query(`
        DELETE w FROM weeks w
        JOIN blocks b ON w.block_id = b.id
        WHERE b.program_id = @programId
      `);
      await transaction.request().input('programId', programId).query(`
        DELETE FROM blocks WHERE program_id = @programId
      `);
      const result = await transaction.request().input('userId', userId).input('programId', programId).query(`
        DELETE FROM programs WHERE id = @programId AND user_id = @userId
      `);

      if (result.rowsAffected[0] === 0) {
        throw new Error(`No program found for id: '${programId}'`);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error deleting program:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function updateProgram(
  userId: string,
  programId: string,
  name: string,
  description: string | null,
  templateId?: string | null,
): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('programId', programId)
      .input('name', name)
      .input('description', description)
      .input('templateId', templateId ?? null)
      .query(`
        UPDATE programs
        SET name = @name, description = @description, template_id = @templateId, modified_at = GETDATE()
        WHERE id = @programId AND user_id = @userId
      `);

    if (result.rowsAffected[0] === 0) {
      throw new Error(`No program found for id: '${programId}'`);
    }
  } catch (error) {
    console.error('Error updating program:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

