import { getWestConnection, closeWestConnection } from './db';
import { SessionExerciseWithSets } from '../types/sessionExercise';

export async function getSessionExercisesBySessionId(sessionId: string): Promise<SessionExerciseWithSets[]> {
  let pool;
  try {
    pool = await getWestConnection();
    const result = await pool.request()
      .input('sessionId', sessionId)
      .query(`
        SELECT
          se.id AS session_exercise_id,
          se.session_id,
          se.exercise_id,
          e.name AS exercise_name,
          se.order_index,
          se.notes AS exercise_notes,
          se.created_at AS exercise_created_at,
          se.modified_at AS exercise_modified_at,
          ses.id AS set_id,
          ses.set_number,
          ses.reps,
          ses.weight,
          ses.rpe,
          ses.notes AS set_notes,
          ses.created_at AS set_created_at,
          ses.modified_at AS set_modified_at
        FROM session_exercises se
        INNER JOIN exercises e ON se.exercise_id = e.id
        LEFT JOIN session_exercise_sets ses ON se.id = ses.session_exercise_id
        WHERE se.session_id = @sessionId
        ORDER BY se.order_index, ses.set_number
      `);

    if (result.recordset.length === 0) {
      console.warn(`No session exercises found for session id: '${sessionId}'`);
    }

    // Group flat rows into nested structure
    const exerciseMap = new Map<string, SessionExerciseWithSets>();

    for (const row of result.recordset) {
      if (!exerciseMap.has(row.session_exercise_id)) {
        exerciseMap.set(row.session_exercise_id, {
          id: row.session_exercise_id,
          session_id: row.session_id,
          exercise_id: row.exercise_id,
          exercise_name: row.exercise_name,
          order_index: row.order_index,
          notes: row.exercise_notes,
          created_at: row.exercise_created_at,
          modified_at: row.exercise_modified_at,
          sets: [],
        });
      }

      // Add set if it exists (LEFT JOIN may produce null set data)
      if (row.set_id) {
        const exercise = exerciseMap.get(row.session_exercise_id)!;
        exercise.sets.push({
          id: row.set_id,
          session_exercise_id: row.session_exercise_id,
          set_number: row.set_number,
          reps: row.reps,
          weight: row.weight,
          rpe: row.rpe,
          notes: row.set_notes,
          created_at: row.set_created_at,
          modified_at: row.set_modified_at,
        });
      }
    }

    return Array.from(exerciseMap.values());
  } catch (error) {
    console.error('Error fetching session exercises:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}

export async function updateSessionExercises(exercises: SessionExerciseWithSets[]): Promise<void> {
  let pool;
  try {
    pool = await getWestConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      for (const exercise of exercises) {

        // Update exercise notes
        await transaction.request()
          .input('exerciseId', exercise.id)
          .input('exerciseNotes', exercise.notes)
          .query(`
            UPDATE session_exercises
            SET notes = @exerciseNotes,
                modified_at = GETDATE()
            WHERE id = @exerciseId
          `);

        // Update each set
        for (const set of exercise.sets) {
          await transaction.request()
            .input('setId', set.id)
            .input('weight', set.weight)
            .input('reps', set.reps)
            .input('rpe', set.rpe)
            .input('setNotes', set.notes)
            .query(`
              UPDATE session_exercise_sets
              SET weight = @weight,
                  reps = @reps,
                  rpe = @rpe,
                  notes = @setNotes,
                  modified_at = GETDATE()
              WHERE id = @setId
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
