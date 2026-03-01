import { getWestConnection, closeWestConnection } from './db';
import { SessionExerciseWithSets, TargetSessionExercise } from '../types/sessionExercise';

export async function getSessionExercisesAndTargets(sessionId: string): Promise<{
  exercises: SessionExerciseWithSets[];
  targets: TargetSessionExercise[];
}> {
  let pool;
  try {
    pool = await getWestConnection();

    // Load session exercises and sets
    const exerciseResult = await pool.request()
      .input('sessionId', sessionId)
      .query(`
        SELECT
          se.id AS session_exercise_id,
          se.session_id,
          se.exercise_id,
          e.name AS exercise_name,
          se.target_id,
          se.order_index,
          se.notes AS exercise_notes,
          se.created_at AS exercise_created_at,
          se.modified_at AS exercise_modified_at,
          ses.id AS set_id,
          ses.set_number,
          ses.reps,
          ses.weight,
          ses.rpe,
          ses.is_warmup,
          ses.is_completed,
          ses.notes AS set_notes,
          ses.created_at AS set_created_at,
          ses.modified_at AS set_modified_at
        FROM session_exercises se
        INNER JOIN exercises e ON se.exercise_id = e.id
        LEFT JOIN session_exercise_sets ses ON se.id = ses.session_exercise_id
        WHERE se.session_id = @sessionId
        ORDER BY se.order_index, ses.is_warmup DESC, ses.set_number
      `);

    if (exerciseResult.recordset.length === 0) {
      console.warn(`No session exercises found for session id: '${sessionId}'`);
    }

    // Group flat rows into nested structure
    const exerciseMap = new Map<string, SessionExerciseWithSets>();

    for (const row of exerciseResult.recordset) {
      if (!exerciseMap.has(row.session_exercise_id)) {
        exerciseMap.set(row.session_exercise_id, {
          id: row.session_exercise_id,
          session_id: row.session_id,
          exercise_id: row.exercise_id,
          exercise_name: row.exercise_name,
          target_id: row.target_id,
          order_index: row.order_index,
          notes: row.exercise_notes,
          created_at: row.exercise_created_at,
          modified_at: row.exercise_modified_at,
          sets: [],
          target: null,
        });
      }

      // Add set if it exists (LEFT JOIN may produce null set data)
      if (row.set_id) {
        const exercise = exerciseMap.get(row.session_exercise_id)!;
        exercise.sets.push({
          id: row.set_id,
          session_exercise_id: row.session_exercise_id,
          set_number: row.set_number,
          is_warmup: row.is_warmup,
          reps: row.reps,
          weight: row.weight,
          rpe: row.rpe,
          notes: row.set_notes,
          is_completed: row.is_completed,
          created_at: row.set_created_at,
          modified_at: row.set_modified_at,
        });
      }
    }

    // Load targets for the session
    const targetResult = await pool.request()
      .input('sessionId', sessionId)
      .query(`
        SELECT
          tse.id AS target_exercise_id,
          tse.session_id,
          tse.exercise_id,
          e.name AS exercise_name,
          tse.order_index,
          tse.created_at AS target_exercise_created_at,
          tse.modified_at AS target_exercise_modified_at,
          tss.id AS target_set_id,
          tss.target_session_exercise_id,
          tss.set_number,
          tss.is_warmup,
          tss.reps,
          tss.weight,
          tss.rpe,
          tss.created_at AS target_set_created_at,
          tss.modified_at AS target_set_modified_at
        FROM target_session_exercises tse
        INNER JOIN exercises e ON tse.exercise_id = e.id
        LEFT JOIN target_session_exercise_sets tss ON tse.id = tss.target_session_exercise_id
        WHERE tse.session_id = @sessionId
        ORDER BY tse.order_index, tss.is_warmup DESC, tss.set_number
      `);

    if (targetResult.recordset.length === 0) {
      console.warn(`No target exercises found for session id: '${sessionId}'`);
    }

    // Group targets into TargetSessionExercise objects
    const targetMap = new Map<string, TargetSessionExercise>();

    for (const row of targetResult.recordset) {
      if (!targetMap.has(row.target_exercise_id)) {
        targetMap.set(row.target_exercise_id, {
          id: row.target_exercise_id,
          session_id: row.session_id,
          exercise_id: row.exercise_id,
          exercise_name: row.exercise_name,
          order_index: row.order_index,
          created_at: row.target_exercise_created_at,
          modified_at: row.target_exercise_modified_at,
          sets: [],
        });
      }

      // Add target set if it exists
      if (row.target_set_id) {
        const targetExercise = targetMap.get(row.target_exercise_id)!;
        targetExercise.sets.push({
          id: row.target_set_id,
          target_session_exercise_id: row.target_session_exercise_id,
          set_number: row.set_number,
          is_warmup: row.is_warmup,
          reps: row.reps,
          weight: row.weight,
          rpe: row.rpe,
          created_at: row.target_set_created_at,
          modified_at: row.target_set_modified_at,
        });
      }
    }

    // Attach targets to exercises
    for (const exercise of exerciseMap.values()) {
      if (exercise.target_id) {
        exercise.target = targetMap.get(exercise.target_id) ?? null;
      }
    }

    return {
      exercises: Array.from(exerciseMap.values()),
      targets: Array.from(targetMap.values()),
    };
  } catch (error) {
    console.error('Error fetching session exercises and targets:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}

export async function updateSessionExercises(sessionId: string, exercises: SessionExerciseWithSets[]): Promise<void> {
  let pool;
  try {
    pool = await getWestConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      const submittedExerciseIds = new Set(exercises.map(e => e.id));
      const submittedSetIds = new Set(exercises.flatMap(e => e.sets.map(s => s.id)));

      // Get existing exercise IDs for this session
      const existingExercisesResult = await transaction.request()
        .input('sessionId', sessionId)
        .query(`SELECT id FROM session_exercises WHERE session_id = @sessionId`);

      // Delete removed exercises (sets first due to FK, then exercises)
      for (const row of existingExercisesResult.recordset) {
        if (!submittedExerciseIds.has(row.id)) {
          await transaction.request()
            .input('sessionExerciseId', row.id)
            .query(`DELETE FROM session_exercise_sets WHERE session_exercise_id = @sessionExerciseId`);
          await transaction.request()
            .input('sessionExerciseId', row.id)
            .query(`DELETE FROM session_exercises WHERE id = @sessionExerciseId`);
        }
      }

      // Delete removed sets from remaining exercises
      for (const exercise of exercises) {
        const existingSetsResult = await transaction.request()
          .input('sessionExerciseId', exercise.id)
          .query(`SELECT id FROM session_exercise_sets WHERE session_exercise_id = @sessionExerciseId`);

        for (const row of existingSetsResult.recordset) {
          if (!submittedSetIds.has(row.id)) {
            await transaction.request()
              .input('setId', row.id)
              .query(`DELETE FROM session_exercise_sets WHERE id = @setId`);
          }
        }
      }

      // Upsert exercises and sets
      for (const exercise of exercises) {

        // Upsert session exercise
        await transaction.request()
          .input('sessionExerciseId', exercise.id)
          .input('sessionId', exercise.session_id)
          .input('exerciseId', exercise.exercise_id)
          .input('targetId', exercise.target_id)
          .input('orderIndex', exercise.order_index)
          .input('exerciseNotes', exercise.notes)
          .query(`
            MERGE INTO session_exercises AS dest
            USING (SELECT @sessionExerciseId AS id) AS source
            ON dest.id = source.id
            WHEN MATCHED THEN
              UPDATE SET
                exercise_id = @exerciseId,
                target_id = @targetId,
                order_index = @orderIndex,
                notes = @exerciseNotes,
                modified_at = GETDATE()
            WHEN NOT MATCHED THEN
              INSERT (id, session_id, exercise_id, target_id, order_index, notes)
              VALUES (@sessionExerciseId, @sessionId, @exerciseId, @targetId, @orderIndex, @exerciseNotes);
          `);

        // Upsert each set
        for (const set of exercise.sets) {
          await transaction.request()
            .input('setId', set.id)
            .input('sessionExerciseId', exercise.id)
            .input('setNumber', set.set_number)
            .input('isWarmup', set.is_warmup)
            .input('reps', set.reps)
            .input('weight', set.weight)
            .input('rpe', set.rpe)
            .input('setNotes', set.notes)
            .input('isCompleted', set.is_completed)
            .query(`
              MERGE INTO session_exercise_sets AS dest
              USING (SELECT @setId AS id) AS source
              ON dest.id = source.id
              WHEN MATCHED THEN
                UPDATE SET
                  set_number = @setNumber,
                  is_warmup = @isWarmup,
                  weight = @weight,
                  reps = @reps,
                  rpe = @rpe,
                  notes = @setNotes,
                  is_completed = @isCompleted,
                  modified_at = GETDATE()
              WHEN NOT MATCHED THEN
                INSERT (id, session_exercise_id, set_number, is_warmup, reps, weight, rpe, notes, is_completed)
                VALUES (@setId, @sessionExerciseId, @setNumber, @isWarmup, @reps, @weight, @rpe, @setNotes, @isCompleted);
            `);
        }
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error updating session exercises:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}
