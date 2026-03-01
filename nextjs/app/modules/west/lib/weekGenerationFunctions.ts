import { getWestConnection, closeWestConnection } from './db';
import {
  ExerciseEstimate,
  NextWeekExerciseTargets,
  NextWeekInfo,
  NextWeekSessionTargets,
} from '../types/weekGeneration';
import {
  round5,
  calculateWeekParams,
  generateWarmupSets,
  generateWorkingSets,
  generateAccessorySets,
} from './powerliftingProgramGenerator';
import { BlockPhase, BLOCK_PHASES, CreateProgramTargetSet } from '../types/program';

// Generates and saves next-week targets (and next-block sessions if needed) based on
// the completed week's performance. Runs as a single transaction.
export async function generateNextWeek(programId: string, weekId: string): Promise<void> {
  let pool;
  try {
    pool = await getWestConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {

      // 1. Validate week exists, is completed, and belongs to the program
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

      // 2. Calculate e1RM estimates from the completed week's logged sets
      const estimates = await calculateEstimates(transaction, weekId);

      // 3. Determine if this is the last week in the block
      const laterWeeksResult = await transaction.request()
        .input('blockId', weekRow.block_id)
        .input('weekNumber', weekRow.week_number)
        .query(`SELECT COUNT(*) AS count FROM weeks WHERE block_id = @blockId AND week_number > @weekNumber`);

      const isLastWeekInBlock = laterWeeksResult.recordset[0].count === 0;

      // 4. Find the next week (same block or next block)
      const nextWeek = await findNextWeek(
        transaction, programId, weekRow.block_id, weekRow.block_order_index, weekRow.week_number, isLastWeekInBlock,
      );

      if (!nextWeek) return; // Program ending — nothing to generate

      // 5. Build session targets for the next week
      const sessionTargets = await buildSessionTargets(
        transaction,
        weekId,
        nextWeek,
        estimates,
      );

      // 6. Save: insert targets (and create sessions if crossing blocks)
      for (const session of sessionTargets) {
        if (session.sessionId) {

          // EXISTING SESSION: delete old targets, insert new ones
          await deleteExistingTargets(transaction, session.sessionId);
          await insertTargets(transaction, session.sessionId, session.exercises);

        } else {

          // NEW SESSION (next block): create session row
          const sessionResult = await transaction.request()
            .input('weekId', nextWeek.weekId)
            .input('orderIndex', session.orderIndex)
            .input('name', session.sessionName)
            .query(`
              INSERT INTO workout_sessions (week_id, order_index, name)
              OUTPUT INSERTED.id
              VALUES (@weekId, @orderIndex, @name)
            `);

          const newSessionId = sessionResult.recordset[0].id;
          await insertTargets(transaction, newSessionId, session.exercises);
        }
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error generating next week:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}

async function calculateEstimates(transaction: any, weekId: string): Promise<ExerciseEstimate[]> {
  const performanceResult = await transaction.request()
    .input('weekId', weekId)
    .query(`
      SELECT
        e.id AS exercise_id,
        e.name AS exercise_name,
        ses.reps,
        ses.weight
      FROM workout_sessions ws
      JOIN session_segments se ON se.session_id = ws.id
      JOIN exercises e ON se.exercise_id = e.id
      JOIN session_segment_sets ses ON ses.session_segment_id = se.id
      WHERE ws.week_id = @weekId AND ses.is_warmup = 0 AND ses.weight > 0 AND ses.reps > 0
      ORDER BY e.id
    `);

  const estimateMap = new Map<string, ExerciseEstimate>();

  for (const row of performanceResult.recordset) {
    const estimatedOneRepMax = row.weight * (1 + row.reps / 30); // Epley formula

    if (!estimateMap.has(row.exercise_id)) {
      estimateMap.set(row.exercise_id, {
        exerciseId: row.exercise_id,
        exerciseName: row.exercise_name,
        estimatedOneRepMax: Math.round(estimatedOneRepMax),
      });
    } else {
      const entry = estimateMap.get(row.exercise_id)!;
      entry.estimatedOneRepMax = Math.max(entry.estimatedOneRepMax, Math.round(estimatedOneRepMax));
    }
  }

  return Array.from(estimateMap.values());
}

async function findNextWeek(
  transaction: any,
  programId: string,
  sourceBlockId: string,
  sourceBlockOrderIndex: number,
  sourceWeekNumber: number,
  isLastWeekInBlock: boolean,
): Promise<NextWeekInfo | null> {

  let nextWeekId: string;
  let nextBlockTag: string | null;
  let nextBlockId: string;

  if (!isLastWeekInBlock) {

    // SAME BLOCK: next week
    const nextWeekResult = await transaction.request()
      .input('blockId', sourceBlockId)
      .input('weekNumber', sourceWeekNumber)
      .query(`
        SELECT TOP 1 w.id, w.week_number, b.tag AS block_tag, b.id AS block_id
        FROM weeks w
        JOIN blocks b ON w.block_id = b.id
        WHERE w.block_id = @blockId AND w.week_number > @weekNumber
        ORDER BY w.week_number ASC
      `);

    if (nextWeekResult.recordset.length === 0) return null;

    const nextRow = nextWeekResult.recordset[0];
    nextWeekId = nextRow.id;
    nextBlockTag = nextRow.block_tag;
    nextBlockId = nextRow.block_id;

  } else {

    // NEXT BLOCK: first week
    const nextBlockResult = await transaction.request()
      .input('programId', programId)
      .input('orderIndex', sourceBlockOrderIndex)
      .query(`
        SELECT TOP 1 b.id, b.tag
        FROM blocks b
        WHERE b.program_id = @programId AND b.order_index > @orderIndex
        ORDER BY b.order_index ASC
      `);

    if (nextBlockResult.recordset.length === 0) return null; // Program ending

    nextBlockId = nextBlockResult.recordset[0].id;
    nextBlockTag = nextBlockResult.recordset[0].tag;

    const firstWeekResult = await transaction.request()
      .input('blockId', nextBlockId)
      .query(`SELECT TOP 1 id FROM weeks WHERE block_id = @blockId ORDER BY week_number ASC`);

    if (firstWeekResult.recordset.length === 0) return null;

    nextWeekId = firstWeekResult.recordset[0].id;
  }

  // Get total weeks in the next week's block and its 0-indexed position
  const blockWeekCountResult = await transaction.request()
    .input('blockId', nextBlockId)
    .query(`SELECT COUNT(*) AS count FROM weeks WHERE block_id = @blockId`);

  const totalBlockWeeks = blockWeekCountResult.recordset[0].count;

  const weekPositionResult = await transaction.request()
    .input('nextWeekId', nextWeekId)
    .input('blockId', nextBlockId)
    .query(`SELECT COUNT(*) AS position FROM weeks WHERE block_id = @blockId AND id < @nextWeekId`);

  const weekIndexInBlock = weekPositionResult.recordset[0].position;

  // Check if next week already has sessions
  const existingSessionsResult = await transaction.request()
    .input('nextWeekId', nextWeekId)
    .query(`
      SELECT id, name, order_index
      FROM workout_sessions
      WHERE week_id = @nextWeekId
      ORDER BY order_index ASC
    `);

  return {
    weekId: nextWeekId,
    blockTag: nextBlockTag,
    weekIndexInBlock,
    totalBlockWeeks,
    hasExistingSessions: existingSessionsResult.recordset.length > 0,
    existingSessions: existingSessionsResult.recordset,
  };
}

async function buildSessionTargets(
  transaction: any,
  sourceWeekId: string,
  nextWeek: NextWeekInfo,
  estimates: ExerciseEstimate[],
): Promise<NextWeekSessionTargets[]> {

  const phase = nextWeek.blockTag ? BLOCK_PHASES[nextWeek.blockTag] : null;

  if (nextWeek.hasExistingSessions) {
    return await buildTargetsFromExistingSessions(
      transaction, sourceWeekId, nextWeek.existingSessions, phase, nextWeek.weekIndexInBlock, nextWeek.totalBlockWeeks, estimates,
    );
  } else {
    return await buildTargetsFromSourceWeek(
      transaction, sourceWeekId, phase, nextWeek.weekIndexInBlock, nextWeek.totalBlockWeeks, estimates,
    );
  }
}

async function buildTargetsFromExistingSessions(
  transaction: any,
  sourceWeekId: string,
  existingSessions: any[],
  phase: BlockPhase | null,
  weekIndexInBlock: number,
  totalBlockWeeks: number,
  estimates: ExerciseEstimate[],
): Promise<NextWeekSessionTargets[]> {

  const sessions: NextWeekSessionTargets[] = [];

  for (const session of existingSessions) {

    // Get target exercises for this session
    const targetExercisesResult = await transaction.request()
      .input('sessionId', session.id)
      .query(`
        SELECT tse.exercise_id, tse.order_index
        FROM target_session_segments tse
        WHERE tse.session_id = @sessionId
        ORDER BY tse.order_index ASC
      `);

    // If no targets exist, fall back to the source week's matching session
    let exerciseRows = targetExercisesResult.recordset;
    if (exerciseRows.length === 0) {
      const sourceSessionResult = await transaction.request()
        .input('weekId', sourceWeekId)
        .input('orderIndex', session.order_index)
        .query(`
          SELECT id FROM workout_sessions
          WHERE week_id = @weekId AND order_index = @orderIndex
        `);

      if (sourceSessionResult.recordset.length > 0) {
        const sourceSessionId = sourceSessionResult.recordset[0].id;

        // Try target exercises from the source session first
        const sourceTargetsResult = await transaction.request()
          .input('sessionId', sourceSessionId)
          .query(`
            SELECT tse.exercise_id, tse.order_index
            FROM target_session_segments tse
            WHERE tse.session_id = @sessionId
            ORDER BY tse.order_index ASC
          `);

        exerciseRows = sourceTargetsResult.recordset;

        // If still empty, fall back to actual logged exercises
        if (exerciseRows.length === 0) {
          const actualExercisesResult = await transaction.request()
            .input('sessionId', sourceSessionId)
            .query(`
              SELECT DISTINCT se.exercise_id, se.order_index
              FROM session_segments se
              WHERE se.session_id = @sessionId
              ORDER BY se.order_index ASC
            `);
          exerciseRows = actualExercisesResult.recordset;
        }
      }
    }

    const exercises: NextWeekExerciseTargets[] = [];

    for (const exerciseRow of exerciseRows) {
      const sets = phase
        ? generateSetsForExercise(phase, weekIndexInBlock, totalBlockWeeks, exerciseRow.exercise_id, estimates, exerciseRow.order_index)
        : [];

      exercises.push({
        exerciseId: exerciseRow.exercise_id,
        orderIndex: exerciseRow.order_index,
        sets,
      });
    }

    sessions.push({
      sessionId: session.id,
      sessionName: session.name,
      orderIndex: session.order_index,
      exercises,
    });
  }

  return sessions;
}

async function buildTargetsFromSourceWeek(
  transaction: any,
  sourceWeekId: string,
  phase: BlockPhase | null,
  weekIndexInBlock: number,
  totalBlockWeeks: number,
  estimates: ExerciseEstimate[],
): Promise<NextWeekSessionTargets[]> {

  // Get sessions from the source week to mirror their structure
  const sourceSessionsResult = await transaction.request()
    .input('weekId', sourceWeekId)
    .query(`
      SELECT id, name, order_index
      FROM workout_sessions
      WHERE week_id = @weekId
      ORDER BY order_index ASC
    `);

  const sessions: NextWeekSessionTargets[] = [];

  for (const sourceSession of sourceSessionsResult.recordset) {

    // Get target exercises from the source session
    const targetExercisesResult = await transaction.request()
      .input('sessionId', sourceSession.id)
      .query(`
        SELECT tse.exercise_id, tse.order_index
        FROM target_session_segments tse
        WHERE tse.session_id = @sessionId
        ORDER BY tse.order_index ASC
      `);

    // If no targets exist, fall back to actual logged exercises
    let exerciseRows = targetExercisesResult.recordset;
    if (exerciseRows.length === 0) {
      const actualExercisesResult = await transaction.request()
        .input('sessionId', sourceSession.id)
        .query(`
          SELECT DISTINCT se.exercise_id, se.order_index
          FROM session_segments se
          WHERE se.session_id = @sessionId
          ORDER BY se.order_index ASC
        `);
      exerciseRows = actualExercisesResult.recordset;
    }

    const exercises: NextWeekExerciseTargets[] = [];

    for (const exerciseRow of exerciseRows) {
      const sets = phase
        ? generateSetsForExercise(phase, weekIndexInBlock, totalBlockWeeks, exerciseRow.exercise_id, estimates, exerciseRow.order_index)
        : [];

      exercises.push({
        exerciseId: exerciseRow.exercise_id,
        orderIndex: exerciseRow.order_index,
        sets,
      });
    }

    sessions.push({
      sessionId: null, // New sessions need to be created
      sessionName: sourceSession.name,
      orderIndex: sourceSession.order_index,
      exercises,
    });
  }

  return sessions;
}

function generateSetsForExercise(
  phase: BlockPhase,
  weekIndexInBlock: number,
  totalBlockWeeks: number,
  exerciseId: string,
  estimates: ExerciseEstimate[],
  orderIndex: number,
): CreateProgramTargetSet[] {
  const weekParams = calculateWeekParams(phase, weekIndexInBlock, totalBlockWeeks);

  const estimate = estimates.find(e => e.exerciseId === exerciseId);
  const estimatedOneRepMax = estimate?.estimatedOneRepMax ?? 0;

  if (estimatedOneRepMax > 0 && orderIndex === 1) {
    // Primary lift: has e1RM data and is first exercise in session
    const workingWeight = round5(estimatedOneRepMax * weekParams.intensity);
    const warmupSets = generateWarmupSets(workingWeight);
    const workingSets = generateWorkingSets(weekParams.reps, workingWeight, weekParams.rpe, weekParams.workingSets);
    return [...warmupSets, ...workingSets];
  } else if (estimatedOneRepMax > 0) {
    // Non-primary lift with e1RM: generate working sets at intensity
    const workingWeight = round5(estimatedOneRepMax * weekParams.intensity);
    const workingSets = generateWorkingSets(weekParams.reps, workingWeight, weekParams.rpe, weekParams.workingSets);
    return workingSets;
  } else {
    // Accessory: no e1RM data, weight = 0
    return generateAccessorySets(phase.accessoryReps, weekParams.rpe, weekParams.accessorySets);
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

async function insertTargets(
  transaction: any,
  sessionId: string,
  exercises: NextWeekExerciseTargets[],
): Promise<void> {

  for (const exercise of exercises) {
    const targetSegmentResult = await transaction.request()
      .input('sessionId', sessionId)
      .input('exerciseId', exercise.exerciseId)
      .input('orderIndex', exercise.orderIndex)
      .query(`
        INSERT INTO target_session_segments (session_id, exercise_id, order_index)
        OUTPUT INSERTED.id
        VALUES (@sessionId, @exerciseId, @orderIndex)
      `);

    const targetSegmentId = targetSegmentResult.recordset[0].id;

    for (const set of exercise.sets) {
      await transaction.request()
        .input('targetSegmentId', targetSegmentId)
        .input('setNumber', set.set_number)
        .input('isWarmup', set.is_warmup ? 1 : 0)
        .input('reps', set.reps)
        .input('weight', set.weight)
        .input('rpe', set.rpe)
        .query(`
          INSERT INTO target_session_segment_sets (target_session_segment_id, set_number, is_warmup, reps, weight, rpe)
          VALUES (@targetSegmentId, @setNumber, @isWarmup, @reps, @weight, @rpe)
        `);
    }
  }
}

