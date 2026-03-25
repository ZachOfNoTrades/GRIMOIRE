import { getGolemConnection, closeGolemConnection } from './db';
import { CreateProgramSession } from '../types/program';
import { getTemplateIdForProgram } from './programFunctions';
import { getProgramTemplateById } from './programTemplateFunctions';
import { getUserProfile } from './userProfileFunctions';
import { generateNextWeekPlanWithLlm } from './llmWeekGenerationFunctions';

// Sets the first session (by order_index) in a week as is_current
export async function setFirstSessionAsCurrent(weekId: string): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    await pool.request()
      .input('weekId', weekId)
      .query(`
        UPDATE workout_sessions
        SET is_current = 1, modified_at = GETDATE()
        WHERE id = (
          SELECT TOP 1 id FROM workout_sessions
          WHERE week_id = @weekId
          ORDER BY order_index ASC
        )
      `);
  } catch (error) {
    console.error('Error setting first session as current:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Inserts session plans (names + descriptions, no exercises) into a week
export async function insertSessionsIntoWeek(
  userId: string,
  weekId: string,
  sessions: CreateProgramSession[],
): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    for (const session of sessions) {
      await pool.request()
        .input('userId', userId)
        .input('weekId', weekId)
        .input('orderIndex', session.order_index)
        .input('name', session.name)
        .input('description', session.description ?? null)
        .query(`
          INSERT INTO workout_sessions (user_id, week_id, order_index, name, description)
          VALUES (@userId, @weekId, @orderIndex, @name, @description)
        `);
    }
  } catch (error) {
    console.error('Error inserting sessions into week:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Generates and saves next-week sessions based on the program's template.
// Uses LLM to generate session plans (names + descriptions only, no exercises).
export async function generateNextWeek(userId: string, programId: string, weekId: string): Promise<void> {

  // Load template context (separate connections, closed immediately)
  const templateId = await getTemplateIdForProgram(userId, programId);
  if (!templateId) {
    console.warn(`[GenerateNextWeek] No template found for program: '${programId}' — skipping generation`);
    return;
  }

  const template = await getProgramTemplateById(userId, templateId);

  // Load user profile for LLM context
  const userProfile = await getUserProfile(userId);
  const profileContext = userProfile.profile_prompt;

  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {

      // 1. Validate week exists and belongs to the program
      const weekResult = await transaction.request()
        .input('weekId', weekId)
        .input('programId', programId)
        .query(`
          SELECT w.id, w.block_id, w.week_number,
                 b.order_index AS block_order_index
          FROM weeks w
          JOIN blocks b ON w.block_id = b.id
          WHERE w.id = @weekId AND b.program_id = @programId
        `);

      if (weekResult.recordset.length === 0) {
        throw new Error(`No week found for id: '${weekId}' in program: '${programId}'`);
      }

      const weekRow = weekResult.recordset[0];

      // 2. Determine if this is the last week in the block
      const laterWeeksResult = await transaction.request()
        .input('blockId', weekRow.block_id)
        .input('weekNumber', weekRow.week_number)
        .query(`SELECT COUNT(*) AS count FROM weeks WHERE block_id = @blockId AND week_number > @weekNumber`);

      const isLastWeekInBlock = laterWeeksResult.recordset[0].count === 0;

      // 3. Find the next week (same block or next block)
      const nextWeekId = await findNextWeekId(
        transaction, programId, weekRow.block_id, weekRow.block_order_index, weekRow.week_number, isLastWeekInBlock,
      );

      if (!nextWeekId) {
        await transaction.commit();
        return; // Program ending — nothing to generate
      }

      // 4. Delete existing sessions in the next week (they'll be replaced with LLM-generated plans)
      const existingSessionsResult = await transaction.request()
        .input('nextWeekId', nextWeekId)
        .query(`SELECT id FROM workout_sessions WHERE week_id = @nextWeekId`);

      for (const session of existingSessionsResult.recordset) {
        await deleteExistingTargets(transaction, session.id);
      }

      if (existingSessionsResult.recordset.length > 0) {
        await transaction.request()
          .input('nextWeekId', nextWeekId)
          .query(`DELETE FROM workout_sessions WHERE week_id = @nextWeekId`);
      }

      // Commit structural changes before the LLM call (avoids holding a DB connection open)
      await transaction.commit();

      // 5. Generate session plans via LLM (outside transaction)
      const sessionPlans = await generateNextWeekPlanWithLlm(userId, template.week_prompt, nextWeekId, template.days_per_week, profileContext);

      // 6. Insert new sessions with names + descriptions (no target exercises)
      await insertSessionsIntoWeek(userId, nextWeekId, sessionPlans);

      console.log(`[GenerateNextWeek] Generated ${sessionPlans.length} session plans`);

    } catch (error) {
      // Only rollback if transaction hasn't been committed yet
      try { await transaction.rollback(); } catch { /* already committed */ }
      throw error;
    }
  } catch (error) {
    console.error('Error generating next week:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

async function findNextWeekId(
  transaction: any,
  programId: string,
  sourceBlockId: string,
  sourceBlockOrderIndex: number,
  sourceWeekNumber: number,
  isLastWeekInBlock: boolean,
): Promise<string | null> {

  if (!isLastWeekInBlock) {

    // SAME BLOCK: next week
    const nextWeekResult = await transaction.request()
      .input('blockId', sourceBlockId)
      .input('weekNumber', sourceWeekNumber)
      .query(`
        SELECT TOP 1 w.id
        FROM weeks w
        WHERE w.block_id = @blockId AND w.week_number > @weekNumber
        ORDER BY w.week_number ASC
      `);

    if (nextWeekResult.recordset.length === 0) return null;
    return nextWeekResult.recordset[0].id;

  } else {

    // NEXT BLOCK: first week
    const nextBlockResult = await transaction.request()
      .input('programId', programId)
      .input('orderIndex', sourceBlockOrderIndex)
      .query(`
        SELECT TOP 1 b.id
        FROM blocks b
        WHERE b.program_id = @programId AND b.order_index > @orderIndex
        ORDER BY b.order_index ASC
      `);

    if (nextBlockResult.recordset.length === 0) return null; // Program ending

    const nextBlockId = nextBlockResult.recordset[0].id;

    const firstWeekResult = await transaction.request()
      .input('blockId', nextBlockId)
      .query(`SELECT TOP 1 id FROM weeks WHERE block_id = @blockId ORDER BY week_number ASC`);

    if (firstWeekResult.recordset.length === 0) return null;
    return firstWeekResult.recordset[0].id;
  }
}

async function deleteExistingTargets(transaction: any, sessionId: string): Promise<void> {

  // Clear target_id references on actual exercises that link to these targets (prevents FK violation)
  await transaction.request()
    .input('sessionId', sessionId)
    .query(`
      UPDATE session_segments
      SET target_id = NULL, modified_at = GETDATE()
      WHERE target_id IN (
        SELECT id FROM target_session_segments WHERE session_id = @sessionId
      )
    `);

  // Delete target sets (child records)
  await transaction.request()
    .input('sessionId', sessionId)
    .query(`
      DELETE FROM target_session_segment_sets
      WHERE target_session_segment_id IN (
        SELECT id FROM target_session_segments WHERE session_id = @sessionId
      )
    `);

  // Delete target segments
  await transaction.request()
    .input('sessionId', sessionId)
    .query(`DELETE FROM target_session_segments WHERE session_id = @sessionId`);
}
