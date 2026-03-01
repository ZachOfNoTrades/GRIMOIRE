import { getWestConnection, closeWestConnection } from './db';
import { SegmentWithSets, TargetSegment } from '../types/sessionExercise';

export async function getSegmentsAndTargets(sessionId: string): Promise<{
  exercises: SegmentWithSets[];
  targets: TargetSegment[];
}> {
  let pool;
  try {
    pool = await getWestConnection();

    // Load session segments and sets
    const segmentResult = await pool.request()
      .input('sessionId', sessionId)
      .query(`
        SELECT
          se.id AS session_segment_id,
          se.session_id,
          se.exercise_id,
          e.name AS exercise_name,
          se.target_id,
          se.order_index,
          se.notes AS segment_notes,
          se.created_at AS segment_created_at,
          se.modified_at AS segment_modified_at,
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
        FROM session_segments se
        INNER JOIN exercises e ON se.exercise_id = e.id
        LEFT JOIN session_segment_sets ses ON se.id = ses.session_segment_id
        WHERE se.session_id = @sessionId
        ORDER BY se.order_index, ses.is_warmup DESC, ses.set_number
      `);

    if (segmentResult.recordset.length === 0) {
      console.warn(`No session segments found for session id: '${sessionId}'`);
    }

    // Group flat rows into nested structure
    const segmentMap = new Map<string, SegmentWithSets>();

    for (const row of segmentResult.recordset) {
      if (!segmentMap.has(row.session_segment_id)) {
        segmentMap.set(row.session_segment_id, {
          id: row.session_segment_id,
          session_id: row.session_id,
          exercise_id: row.exercise_id,
          exercise_name: row.exercise_name,
          target_id: row.target_id,
          order_index: row.order_index,
          notes: row.segment_notes,
          created_at: row.segment_created_at,
          modified_at: row.segment_modified_at,
          sets: [],
          target: null,
        });
      }

      // Add set if it exists (LEFT JOIN may produce null set data)
      if (row.set_id) {
        const segment = segmentMap.get(row.session_segment_id)!;
        segment.sets.push({
          id: row.set_id,
          session_segment_id: row.session_segment_id,
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
          tse.id AS target_segment_id,
          tse.session_id,
          tse.exercise_id,
          e.name AS exercise_name,
          tse.order_index,
          tse.created_at AS target_segment_created_at,
          tse.modified_at AS target_segment_modified_at,
          tss.id AS target_set_id,
          tss.target_session_segment_id,
          tss.set_number,
          tss.is_warmup,
          tss.reps,
          tss.weight,
          tss.rpe,
          tss.created_at AS target_set_created_at,
          tss.modified_at AS target_set_modified_at
        FROM target_session_segments tse
        INNER JOIN exercises e ON tse.exercise_id = e.id
        LEFT JOIN target_session_segment_sets tss ON tse.id = tss.target_session_segment_id
        WHERE tse.session_id = @sessionId
        ORDER BY tse.order_index, tss.is_warmup DESC, tss.set_number
      `);

    if (targetResult.recordset.length === 0) {
      console.warn(`No target segments found for session id: '${sessionId}'`);
    }

    // Group targets into TargetSegment objects
    const targetMap = new Map<string, TargetSegment>();

    for (const row of targetResult.recordset) {
      if (!targetMap.has(row.target_segment_id)) {
        targetMap.set(row.target_segment_id, {
          id: row.target_segment_id,
          session_id: row.session_id,
          exercise_id: row.exercise_id,
          exercise_name: row.exercise_name,
          order_index: row.order_index,
          created_at: row.target_segment_created_at,
          modified_at: row.target_segment_modified_at,
          sets: [],
        });
      }

      // Add target set if it exists
      if (row.target_set_id) {
        const targetSegment = targetMap.get(row.target_segment_id)!;
        targetSegment.sets.push({
          id: row.target_set_id,
          target_session_segment_id: row.target_session_segment_id,
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

    // Attach targets to segments
    for (const segment of segmentMap.values()) {
      if (segment.target_id) {
        segment.target = targetMap.get(segment.target_id) ?? null;
      }
    }

    return {
      exercises: Array.from(segmentMap.values()),
      targets: Array.from(targetMap.values()),
    };
  } catch (error) {
    console.error('Error fetching session segments and targets:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}

export async function updateSegments(sessionId: string, segments: SegmentWithSets[]): Promise<void> {
  let pool;
  try {
    pool = await getWestConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      const submittedSegmentIds = new Set(segments.map(e => e.id));
      const submittedSetIds = new Set(segments.flatMap(e => e.sets.map(s => s.id)));

      // Get existing segment IDs for this session
      const existingSegmentsResult = await transaction.request()
        .input('sessionId', sessionId)
        .query(`SELECT id FROM session_segments WHERE session_id = @sessionId`);

      // Delete removed segments (sets first due to FK, then segments)
      for (const row of existingSegmentsResult.recordset) {
        if (!submittedSegmentIds.has(row.id)) {
          await transaction.request()
            .input('sessionSegmentId', row.id)
            .query(`DELETE FROM session_segment_sets WHERE session_segment_id = @sessionSegmentId`);
          await transaction.request()
            .input('sessionSegmentId', row.id)
            .query(`DELETE FROM session_segments WHERE id = @sessionSegmentId`);
        }
      }

      // Delete removed sets from remaining segments
      for (const segment of segments) {
        const existingSetsResult = await transaction.request()
          .input('sessionSegmentId', segment.id)
          .query(`SELECT id FROM session_segment_sets WHERE session_segment_id = @sessionSegmentId`);

        for (const row of existingSetsResult.recordset) {
          if (!submittedSetIds.has(row.id)) {
            await transaction.request()
              .input('setId', row.id)
              .query(`DELETE FROM session_segment_sets WHERE id = @setId`);
          }
        }
      }

      // Upsert segments and sets
      for (const segment of segments) {

        // Upsert session segment
        await transaction.request()
          .input('sessionSegmentId', segment.id)
          .input('sessionId', segment.session_id)
          .input('exerciseId', segment.exercise_id)
          .input('targetId', segment.target_id)
          .input('orderIndex', segment.order_index)
          .input('segmentNotes', segment.notes)
          .query(`
            MERGE INTO session_segments AS dest
            USING (SELECT @sessionSegmentId AS id) AS source
            ON dest.id = source.id
            WHEN MATCHED THEN
              UPDATE SET
                exercise_id = @exerciseId,
                target_id = @targetId,
                order_index = @orderIndex,
                notes = @segmentNotes,
                modified_at = GETDATE()
            WHEN NOT MATCHED THEN
              INSERT (id, session_id, exercise_id, target_id, order_index, notes)
              VALUES (@sessionSegmentId, @sessionId, @exerciseId, @targetId, @orderIndex, @segmentNotes);
          `);

        // Upsert each set
        for (const set of segment.sets) {
          await transaction.request()
            .input('setId', set.id)
            .input('sessionSegmentId', segment.id)
            .input('setNumber', set.set_number)
            .input('isWarmup', set.is_warmup)
            .input('reps', set.reps)
            .input('weight', set.weight)
            .input('rpe', set.rpe)
            .input('setNotes', set.notes)
            .input('isCompleted', set.is_completed)
            .query(`
              MERGE INTO session_segment_sets AS dest
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
                INSERT (id, session_segment_id, set_number, is_warmup, reps, weight, rpe, notes, is_completed)
                VALUES (@setId, @sessionSegmentId, @setNumber, @isWarmup, @reps, @weight, @rpe, @setNotes, @isCompleted);
            `);
        }
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error updating session segments:', error);
    throw error;
  } finally {
    if (pool) {
      await closeWestConnection(pool);
    }
  }
}
