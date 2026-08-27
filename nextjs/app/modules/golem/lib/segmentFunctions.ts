import { getGolemConnection, closeGolemConnection } from './db';
import { SegmentWithSets, SegmentSet, TargetSegment, GeneratedSegment } from '../types/segment';

export async function getSegmentsAndTargets(userId: string, sessionId: string): Promise<{
  exercises: SegmentWithSets[];
  targets: TargetSegment[];
}> {
  let pool;
  try {
    pool = await getGolemConnection();

    // Load session segments and sets
    const segmentResult = await pool.request()
      .input('userId', userId)
      .input('sessionId', sessionId)
      .query(`
        SELECT
          se.id AS session_segment_id,
          se.session_id,
          se.exercise_id,
          e.name AS exercise_name,
          se.target_id,
          se.modifier_id,
          em.name AS modifier_name,
          se.order_index,
          se.is_warmup AS segment_is_warmup,
          e.category AS exercise_category,
          e.is_timed AS exercise_is_timed,
          e.distance_type AS exercise_distance_type,
          se.notes AS segment_notes,
          se.created_at AS segment_created_at,
          se.modified_at AS segment_modified_at,
          ses.id AS set_id,
          ses.set_number,
          ses.reps,
          ses.weight,
          ses.rpe,
          ses.time_seconds,
          ses.distance,
          ses.is_warmup,
          ses.is_completed,
          ses.notes AS set_notes,
          ses.created_at AS set_created_at,
          ses.modified_at AS set_modified_at
        FROM session_segments se
        INNER JOIN exercises e ON se.exercise_id = e.id
        LEFT JOIN exercise_modifiers em ON se.modifier_id = em.id
        LEFT JOIN session_segment_sets ses ON se.id = ses.session_segment_id
        WHERE se.session_id = @sessionId
          AND EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.id = se.session_id AND ws.user_id = @userId)
        ORDER BY se.is_warmup DESC, se.order_index, ses.is_warmup DESC, ses.set_number
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
          exercise_category: row.exercise_category,
          exercise_is_timed: row.exercise_is_timed,
          exercise_distance_type: row.exercise_distance_type ?? null,
          target_id: row.target_id,
          modifier_id: row.modifier_id,
          modifier_name: row.modifier_name,
          order_index: row.order_index,
          is_warmup: row.segment_is_warmup,
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
          time_seconds: row.time_seconds,
          distance: row.distance ?? null,
          notes: row.set_notes,
          is_completed: row.is_completed,
          created_at: row.set_created_at,
          modified_at: row.set_modified_at,
        });
      }
    }

    // Load targets for the session
    const targetResult = await pool.request()
      .input('userId', userId)
      .input('sessionId', sessionId)
      .query(`
        SELECT
          tse.id AS target_segment_id,
          tse.session_id,
          tse.exercise_id,
          e.name AS exercise_name,
          e.category AS exercise_category,
          e.is_timed AS exercise_is_timed,
          e.distance_type AS exercise_distance_type,
          tse.modifier_id AS target_modifier_id,
          em.name AS target_modifier_name,
          tse.order_index,
          tse.is_warmup AS target_segment_is_warmup,
          tse.slot_role AS target_slot_role,
          tse.progression_model AS target_progression_model,
          tse.day_archetype_id AS target_day_archetype_id,
          tse.created_at AS target_segment_created_at,
          tse.modified_at AS target_segment_modified_at,
          tss.id AS target_set_id,
          tss.target_session_segment_id,
          tss.set_number,
          tss.is_warmup,
          tss.reps,
          tss.weight,
          tss.rpe,
          tss.time_seconds,
          tss.distance,
          tss.created_at AS target_set_created_at,
          tss.modified_at AS target_set_modified_at
        FROM target_session_segments tse
        INNER JOIN exercises e ON tse.exercise_id = e.id
        LEFT JOIN exercise_modifiers em ON tse.modifier_id = em.id
        LEFT JOIN target_session_segment_sets tss ON tse.id = tss.target_session_segment_id
        WHERE tse.session_id = @sessionId
          AND EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.id = tse.session_id AND ws.user_id = @userId)
        ORDER BY tse.is_warmup DESC, tse.order_index, tss.is_warmup DESC, tss.set_number
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
          exercise_category: row.exercise_category,
          exercise_is_timed: row.exercise_is_timed,
          exercise_distance_type: row.exercise_distance_type ?? null,
          modifier_id: row.target_modifier_id,
          modifier_name: row.target_modifier_name,
          order_index: row.order_index,
          is_warmup: row.target_segment_is_warmup,
          slot_role: row.target_slot_role ?? null,
          progression_model: row.target_progression_model ?? null,
          day_archetype_id: row.target_day_archetype_id ?? null,
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
          time_seconds: row.time_seconds,
          distance: row.distance ?? null,
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
      await closeGolemConnection(pool);
    }
  }
}

export async function updateSegments(userId: string, sessionId: string, segments: SegmentWithSets[]): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Verify session ownership
      const ownershipCheck = await transaction.request()
        .input('userId', userId)
        .input('sessionId', sessionId)
        .query(`SELECT id FROM workout_sessions WHERE id = @sessionId AND user_id = @userId`);
      if (ownershipCheck.recordset.length === 0) {
        throw new Error(`No workout session found for id: '${sessionId}'`);
      }

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
          .input('userId', userId)
          .input('sessionSegmentId', segment.id)
          .input('sessionId', segment.session_id)
          .input('exerciseId', segment.exercise_id)
          .input('targetId', segment.target_id)
          .input('modifierId', segment.modifier_id)
          .input('orderIndex', segment.order_index)
          .input('isWarmup', segment.is_warmup)
          .input('segmentNotes', segment.notes)
          .query(`
            MERGE INTO session_segments AS dest
            USING (SELECT @sessionSegmentId AS id) AS source
            ON dest.id = source.id
            WHEN MATCHED THEN
              UPDATE SET
                exercise_id = @exerciseId,
                target_id = @targetId,
                modifier_id = @modifierId,
                order_index = @orderIndex,
                is_warmup = @isWarmup,
                notes = @segmentNotes,
                modified_at = GETDATE()
            WHEN NOT MATCHED THEN
              INSERT (id, user_id, session_id, exercise_id, target_id, modifier_id, order_index, is_warmup, notes)
              VALUES (@sessionSegmentId, @userId, @sessionId, @exerciseId, @targetId, @modifierId, @orderIndex, @isWarmup, @segmentNotes);
          `);

        // Upsert each set
        for (const set of segment.sets) {
          await transaction.request()
            .input('userId', userId)
            .input('setId', set.id)
            .input('sessionSegmentId', segment.id)
            .input('setNumber', set.set_number)
            .input('isWarmup', set.is_warmup)
            .input('reps', set.reps)
            .input('weight', set.weight)
            .input('rpe', set.rpe)
            .input('timeSeconds', set.time_seconds)
            .input('distance', set.distance ?? null)
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
                  time_seconds = @timeSeconds,
                  distance = @distance,
                  notes = @setNotes,
                  is_completed = @isCompleted,
                  modified_at = GETDATE()
              WHEN NOT MATCHED THEN
                INSERT (id, user_id, session_segment_id, set_number, is_warmup, reps, weight, rpe, time_seconds, distance, notes, is_completed)
                VALUES (@setId, @userId, @sessionSegmentId, @setNumber, @isWarmup, @reps, @weight, @rpe, @timeSeconds, @distance, @setNotes, @isCompleted);
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
      await closeGolemConnection(pool);
    }
  }
}

export async function deleteSegment(userId: string, sessionId: string, segmentId: string | null, targetId: string | null): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Verify session ownership
      const ownershipCheck = await transaction.request()
        .input('userId', userId)
        .input('sessionId', sessionId)
        .query(`SELECT id FROM workout_sessions WHERE id = @sessionId AND user_id = @userId`);
      if (ownershipCheck.recordset.length === 0) {
        throw new Error(`No workout session found for id: '${sessionId}'`);
      }

      // Delete logged segment and its sets (if it exists in DB)
      if (segmentId) {
        await transaction.request()
          .input('segmentId', segmentId)
          .query(`DELETE FROM session_segment_sets WHERE session_segment_id = @segmentId`);
        await transaction.request()
          .input('segmentId', segmentId)
          .query(`DELETE FROM session_segments WHERE id = @segmentId`);
      }

      // Delete target segment and its sets
      if (targetId) {
        await transaction.request()
          .input('targetId', targetId)
          .query(`DELETE FROM target_session_segment_sets WHERE target_session_segment_id = @targetId`);
        await transaction.request()
          .input('targetId', targetId)
          .query(`DELETE FROM target_session_segments WHERE id = @targetId`);
      }

      // Reorder remaining segments
      await transaction.request()
        .input('sessionId', sessionId)
        .query(`
          WITH ordered AS (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY is_warmup ORDER BY order_index) AS new_order
            FROM session_segments
            WHERE session_id = @sessionId
          )
          UPDATE session_segments
          SET order_index = ordered.new_order, modified_at = GETDATE()
          FROM session_segments
          INNER JOIN ordered ON session_segments.id = ordered.id
        `);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error deleting segment:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function deleteAllTargetsForSession(userId: string, sessionId: string): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Verify session ownership
      const ownershipCheck = await transaction.request()
        .input('userId', userId)
        .input('sessionId', sessionId)
        .query(`SELECT id FROM workout_sessions WHERE id = @sessionId AND user_id = @userId`);
      if (ownershipCheck.recordset.length === 0) {
        throw new Error(`No workout session found for id: '${sessionId}'`);
      }

      // Clear target_id references from logged segments
      await transaction.request()
        .input('sessionId', sessionId)
        .query(`UPDATE session_segments SET target_id = NULL WHERE session_id = @sessionId`);

      // Delete all target sets for this session's target segments
      await transaction.request()
        .input('sessionId', sessionId)
        .query(`
          DELETE FROM target_session_segment_sets
          WHERE target_session_segment_id IN (
            SELECT id FROM target_session_segments WHERE session_id = @sessionId
          )
        `);

      // Delete all target segments for this session
      await transaction.request()
        .input('sessionId', sessionId)
        .query(`DELETE FROM target_session_segments WHERE session_id = @sessionId`);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error deleting all targets for session:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function createGeneratedTargets(
  userId: string,
  sessionId: string,
  generatedExercises: GeneratedSegment[],
): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Verify session ownership
      const ownershipCheck = await transaction.request()
        .input('userId', userId)
        .input('sessionId', sessionId)
        .query(`SELECT id FROM workout_sessions WHERE id = @sessionId AND user_id = @userId`);
      if (ownershipCheck.recordset.length === 0) {
        throw new Error(`No workout session found for id: '${sessionId}'`);
      }

      for (const exercise of generatedExercises) {

        // Insert target segment
        const targetSegmentResult = await transaction.request()
          .input('sessionId', sessionId)
          .input('exerciseId', exercise.exercise_id)
          .input('modifierId', exercise.modifier_id)
          .input('orderIndex', exercise.order_index)
          .input('isWarmup', exercise.is_warmup ? 1 : 0)
          .input('slotRole', exercise.slot_role ?? null)
          .input('progressionModel', exercise.progression_model ?? null)
          .input('dayArchetypeId', exercise.day_archetype_id ?? null)
          .input('userId', userId)
          .query(`
            INSERT INTO target_session_segments (user_id, session_id, exercise_id, modifier_id, order_index, is_warmup, slot_role, progression_model, day_archetype_id)
            OUTPUT INSERTED.id
            VALUES (@userId, @sessionId, @exerciseId, @modifierId, @orderIndex, @isWarmup, @slotRole, @progressionModel, @dayArchetypeId)
          `);
        const targetSegmentId = targetSegmentResult.recordset[0].id;

        // Insert target sets
        for (const set of exercise.sets) {
          await transaction.request()
            .input('targetSegmentId', targetSegmentId)
            .input('setNumber', set.set_number)
            .input('isWarmup', set.is_warmup ? 1 : 0)
            .input('reps', set.reps)
            .input('weight', set.weight)
            .input('rpe', set.rpe)
            .input('timeSeconds', set.time_seconds)
            .input('userId', userId)
            .query(`
              INSERT INTO target_session_segment_sets (user_id, target_session_segment_id, set_number, is_warmup, reps, weight, rpe, time_seconds)
              VALUES (@userId, @targetSegmentId, @setNumber, @isWarmup, @reps, @weight, @rpe, @timeSeconds)
            `);
        }
      }

      // Re-adopt logged segments orphaned by a prior deleteAllTargetsForSession (regenerating an
      // IN-PROGRESS session): relink each logged segment with no target to the freshly-created target for
      // the same exercise. Without this, a regenerated session shows already-logged exercises twice
      // (orphaned logged segment + new target). No-op for fresh sessions (no logged segments to adopt);
      // a logged ad-hoc exercise with no matching target correctly stays unlinked.
      await transaction.request()
        .input('sessionId', sessionId)
        .query(`
          UPDATE seg SET seg.target_id = ts.id, seg.modified_at = GETDATE()
          FROM session_segments seg
          JOIN target_session_segments ts
            ON ts.session_id = seg.session_id
           AND ts.exercise_id = seg.exercise_id
           AND ts.is_warmup = seg.is_warmup
          WHERE seg.session_id = @sessionId AND seg.target_id IS NULL
        `);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error creating generated targets:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// -----------------------------------------------------------------------------
// TARGETED SINGLE-ROW SETTERS
//
// updateSegments() above is a wholesale reconcile: it takes the session's ENTIRE segment array and
// deletes anything absent from it. That is right for the app's session editor (which always holds
// the full array) but unusable for a caller that only wants to annotate one row — omitting the rest
// would delete them. These setters address one segment / one set by id, leaving every sibling row
// untouched, and are what the MCP note-writing tools are built on.
// -----------------------------------------------------------------------------

// Free-text note columns are nullable, and "empty" must have exactly ONE representation or readers
// have to test for both. Trim, then collapse a blank result to null, so clearing a note through any
// caller (empty string, spaces, explicit null) always lands as NULL.
function normalizeNote(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Fields on a single logged set that a targeted update may change. Every key is optional and only
// the keys actually PRESENT are written, so clearing `notes` never disturbs `rpe`. Distinguishing
// "absent" from "explicit null" is the whole point — null means clear, undefined means leave alone.
export interface SetFieldUpdate {
  notes?: string | null;
  reps?: number | null;
  weight?: number;
  rpe?: number | null;
  time_seconds?: number | null;
  distance?: number | null;
  is_completed?: boolean;
}

// Set (or clear, with null) the notes on ONE logged session segment. Ownership is enforced through
// the parent workout_sessions row, the same way getSegmentsAndTargets scopes its read. Returns the
// updated row; throws when no segment matches for this user.
export async function updateSegmentNotes(
  userId: string,
  segmentId: string,
  notes: string | null,
): Promise<{ id: string; session_id: string; exercise_name: string; notes: string | null; modified_at: Date }> {
  let pool;
  try {
    pool = await getGolemConnection();

    const result = await pool.request()
      .input('userId', userId)
      .input('segmentId', segmentId)
      .input('notes', normalizeNote(notes))
      .query(`
        UPDATE se
        SET notes = @notes, modified_at = GETDATE()
        OUTPUT inserted.id, inserted.session_id, inserted.notes, inserted.modified_at
        FROM session_segments se
        WHERE se.id = @segmentId
          AND EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.id = se.session_id AND ws.user_id = @userId)
      `);

    if (result.recordset.length === 0) {
      throw new Error(`No session segment found for id: '${segmentId}'`);
    }

    // Fetch the exercise name separately — OUTPUT cannot reference a joined table.
    const nameResult = await pool.request()
      .input('segmentId', segmentId)
      .query(`
        SELECT e.name AS exercise_name
        FROM session_segments se
        INNER JOIN exercises e ON e.id = se.exercise_id
        WHERE se.id = @segmentId
      `);

    return { ...result.recordset[0], exercise_name: nameResult.recordset[0]?.exercise_name ?? null };
  } catch (error) {
    console.error('Error updating session segment notes:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Update selected fields on ONE logged set. Ownership walks set -> segment -> session. Returns the
// updated row; throws when no set matches for this user or when `updates` names no known field.
export async function updateSessionSet(
  userId: string,
  setId: string,
  updates: SetFieldUpdate,
): Promise<SegmentSet> {
  // Whitelist of updatable columns -> the mssql input name carrying the value. Anything not listed
  // here (id, session_segment_id, set_number, is_warmup, timestamps) is deliberately not settable.
  const COLUMN_INPUTS: { column: string; key: keyof SetFieldUpdate; input: string }[] = [
    { column: 'notes', key: 'notes', input: 'notes' },
    { column: 'reps', key: 'reps', input: 'reps' },
    { column: 'weight', key: 'weight', input: 'weight' },
    { column: 'rpe', key: 'rpe', input: 'rpe' },
    { column: 'time_seconds', key: 'time_seconds', input: 'timeSeconds' },
    { column: 'distance', key: 'distance', input: 'distance' },
    { column: 'is_completed', key: 'is_completed', input: 'isCompleted' },
  ];

  const present = COLUMN_INPUTS.filter(({ key }) => updates[key] !== undefined);
  if (present.length === 0) {
    throw new Error('No updatable fields supplied for set update');
  }

  let pool;
  try {
    pool = await getGolemConnection();

    const request = pool.request()
      .input('userId', userId)
      .input('setId', setId);

    for (const { key, input } of present) {
      const value = updates[key];
      // weight is NOT NULL in the schema; a null there would fail the constraint, so coerce to 0
      // the same way the app's own upsert path relies on a concrete number.
      if (key === 'weight') {
        request.input(input, value ?? 0);
      } else if (key === 'notes') {
        request.input(input, normalizeNote(value as string | null));
      } else {
        request.input(input, value);
      }
    }

    const setClause = present.map(({ column, input }) => `${column} = @${input}`).join(', ');

    const result = await request.query(`
      UPDATE ses
      SET ${setClause}, modified_at = GETDATE()
      OUTPUT inserted.id, inserted.session_segment_id, inserted.set_number, inserted.is_warmup,
             inserted.reps, inserted.weight, inserted.rpe, inserted.time_seconds, inserted.distance,
             inserted.notes, inserted.is_completed, inserted.created_at, inserted.modified_at
      FROM session_segment_sets ses
      INNER JOIN session_segments se ON se.id = ses.session_segment_id
      WHERE ses.id = @setId
        AND EXISTS (SELECT 1 FROM workout_sessions ws WHERE ws.id = se.session_id AND ws.user_id = @userId)
    `);

    if (result.recordset.length === 0) {
      throw new Error(`No session set found for id: '${setId}'`);
    }

    return result.recordset[0];
  } catch (error) {
    console.error('Error updating session set:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}
