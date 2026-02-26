import { getWestConnection, closeWestConnection } from './db';
import { Program, ProgramBlock, ProgramSummary, ProgramWeek, ProgramSession } from '../types/program';

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
          ws.id             AS session_id,
          ws.name           AS session_name,
          ws.session_date,
          ws.notes          AS session_notes,
          ws.order_index    AS session_order_index,
          ws.started_at     AS session_started_at,
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
        session_date: row.session_date,
        notes: row.session_notes,
        order_index: row.session_order_index,
        started_at: row.session_started_at,
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
