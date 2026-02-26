import { getWestConnection, closeWestConnection } from './db';
import { SessionExerciseWithSets, SessionExerciseSet } from '../types/sessionExercise';

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
