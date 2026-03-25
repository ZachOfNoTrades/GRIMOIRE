import { getGolemConnection, closeGolemConnection } from './db';
import { ImportPayload, ImportResult } from '../types/import';

export async function importWorkoutHistory(userId: string, payload: ImportPayload): Promise<ImportResult> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      let exercisesCreated = 0;
      let segmentsCreated = 0;
      let setsCreated = 0;

      // Build exercise name → id map from existing exercises (system + user's custom)
      const existingResult = await transaction.request()
        .input('userId', userId)
        .query(`
          SELECT id, name FROM exercises WHERE (user_id IS NULL OR user_id = @userId)
        `);
      const exerciseNameToId = new Map<string, string>();
      for (const row of existingResult.recordset) {
        exerciseNameToId.set(row.name.toLowerCase(), row.id);
      }

      // Create missing exercises
      for (const exercise of payload.new_exercises) {
        if (!exerciseNameToId.has(exercise.name.toLowerCase())) {
          const result = await transaction.request()
            .input('userId', userId)
            .input('name', exercise.name)
            .input('description', exercise.description)
            .input('category', exercise.category)
            .query(`
              INSERT INTO exercises (user_id, name, description, category)
              OUTPUT INSERTED.id
              VALUES (@userId, @name, @description, @category)
            `);
          exerciseNameToId.set(exercise.name.toLowerCase(), result.recordset[0].id);
          exercisesCreated++;
        }
      }

      // Create sessions, segments, and sets
      for (const session of payload.sessions) {
        const sessionResult = await transaction.request()
          .input('userId', userId)
          .input('name', session.name)
          .input('startedAt', session.started_at)
          .query(`
            INSERT INTO workout_sessions (user_id, name, started_at, is_completed)
            OUTPUT INSERTED.id
            VALUES (@userId, @name, @startedAt, 1)
          `);
        const sessionId = sessionResult.recordset[0].id;

        for (const segment of session.segments) {
          const exerciseId = exerciseNameToId.get(segment.exercise_name.toLowerCase());
          if (!exerciseId) {
            throw new Error(`Exercise not found: '${segment.exercise_name}'`);
          }

          const segmentResult = await transaction.request()
            .input('sessionId', sessionId)
            .input('exerciseId', exerciseId)
            .input('orderIndex', segment.order_index)
            .input('isWarmup', segment.is_warmup ? 1 : 0)
            .input('userId', userId)
            .query(`
              INSERT INTO session_segments (user_id, session_id, exercise_id, order_index, is_warmup)
              OUTPUT INSERTED.id
              VALUES (@userId, @sessionId, @exerciseId, @orderIndex, @isWarmup)
            `);
          const segmentId = segmentResult.recordset[0].id;
          segmentsCreated++;

          for (const set of segment.sets) {
            await transaction.request()
              .input('segmentId', segmentId)
              .input('setNumber', set.set_number)
              .input('isWarmup', set.is_warmup ? 1 : 0)
              .input('reps', set.reps)
              .input('weight', set.weight)
              .input('rpe', set.rpe)
              .input('timeSeconds', set.time_seconds ?? null)
              .input('userId', userId)
              .query(`
                INSERT INTO session_segment_sets (user_id, session_segment_id, set_number, is_warmup, reps, weight, rpe, time_seconds, is_completed)
                VALUES (@userId, @segmentId, @setNumber, @isWarmup, @reps, @weight, @rpe, @timeSeconds, 1)
              `);
            setsCreated++;
          }
        }
      }

      await transaction.commit();

      return {
        sessions_created: payload.sessions.length,
        segments_created: segmentsCreated,
        sets_created: setsCreated,
        exercises_created: exercisesCreated,
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error importing workout history:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}
