import { getWestConnection, closeWestConnection } from './db';
import { Program, ProgramBlock, ProgramSummary, ProgramWeek, ProgramSession, CreateProgramPayload } from '../types/program';

export async function getAllPrograms(): Promise<ProgramSummary[]> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request().query(`
      SELECT id, name, description, is_current, is_completed, created_at, modified_at
      FROM programs
      ORDER BY created_at DESC
    `);

    if (result.recordset.length === 0) {
      console.warn('No programs found');
    }

    return result.recordset;
  } catch (error) {
    console.error('Error fetching programs:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}

export async function getCurrentProgramId(): Promise<string | null> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request().query(`
      SELECT id FROM programs WHERE is_current = 1
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
      await closeWestConnection(pool);
    }
  }
}

export async function getProgramById(programId: string): Promise<Program> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request()
      .input('programId', programId)
      .query(`
        SELECT
          p.id              AS program_id,
          p.name            AS program_name,
          p.description     AS program_description,
          p.is_current      AS program_is_current,
          p.is_completed    AS program_is_completed,
          p.created_at      AS program_created_at,
          p.modified_at     AS program_modified_at,
          b.id              AS block_id,
          b.name            AS block_name,
          b.order_index     AS block_order_index,
          b.description     AS block_description,
          b.tag             AS block_tag,
          b.color           AS block_color,
          b.is_current      AS block_is_current,
          b.is_completed    AS block_is_completed,
          w.id              AS week_id,
          w.week_number,
          w.name            AS week_name,
          w.description     AS week_description,
          w.is_current      AS week_is_current,
          w.is_completed    AS week_is_completed,
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
          ws.notes          AS session_notes,
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
        WHERE p.id = @programId
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
      is_current: firstRow.program_is_current,
      is_completed: firstRow.program_is_completed,
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
        notes: row.session_notes,
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
      await closeWestConnection(pool);
    }
  }
}

// Clears is_current on a program and all of its blocks, weeks, and sessions.
async function clearProgramCurrentFlags(transaction: any, programId: string): Promise<void> {

  // TODO: Handle in-progress sessions (started_at/resumed_at set) — they
  // should be paused or completed before switching, otherwise they retain an active timer state.

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
async function setProgramAsCurrent(transaction: any, programId: string): Promise<void> {

  // DEACTIVATE CURRENT PROGRAM

  const currentResult = await transaction.request()
    .input('programId', programId)
    .query(`SELECT id FROM programs WHERE is_current = 1 AND id != @programId`);

  if (currentResult.recordset.length > 0) {
    await clearProgramCurrentFlags(transaction, currentResult.recordset[0].id);
  }

  // Set the new program as current
  await transaction.request()
    .input('programId', programId)
    .query(`UPDATE programs SET is_current = 1, modified_at = GETDATE() WHERE id = @programId`);

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
export async function createProgram(payload: CreateProgramPayload): Promise<string> {
  let pool;
  try {
    pool = await getWestConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Create program (is_current flag is handled later by setProgramAsCurrent())
      const programResult = await transaction.request()
        .input('name', payload.name)
        .input('description', payload.description)
        .query(`
          INSERT INTO programs (name, description)
          OUTPUT INSERTED.id
          VALUES (@name, @description)
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
              .input('weekId', weekId)
              .input('orderIndex', session.order_index)
              .input('name', session.name)
              .input('notes', session.notes ?? null)
              .query(`
                INSERT INTO workout_sessions (week_id, order_index, name, notes)
                OUTPUT INSERTED.id
                VALUES (@weekId, @orderIndex, @name, @notes)
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
      await setProgramAsCurrent(transaction, programId);

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
      await closeWestConnection(pool);
    }
  }
}

export async function updateProgram(
  programId: string,
  name: string,
  description: string | null,
): Promise<void> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request()
      .input('programId', programId)
      .input('name', name)
      .input('description', description)
      .query(`
        UPDATE programs
        SET name = @name, description = @description, modified_at = GETDATE()
        WHERE id = @programId
      `);

    if (result.rowsAffected[0] === 0) {
      throw new Error(`No program found for id: '${programId}'`);
    }
  } catch (error) {
    console.error('Error updating program:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}

