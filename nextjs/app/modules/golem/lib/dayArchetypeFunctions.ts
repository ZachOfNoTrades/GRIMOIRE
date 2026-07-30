// CRUD for day archetypes + slots, and assigning an archetype to a session. Singleton-pool convention
// (closeGolemConnection is a no-op; kept in finally for consistency). Lib rules: single-record null → throw
// (API → 404); empty array → console.warn, pass back.
import { getGolemConnection, closeGolemConnection } from './db';
import type { DayArchetype, DaySlot, DayArchetypeWithSlots, DaySlotInput } from '../types/dayArchetype';

// List the user's day archetypes (most recent first).
export async function getDayArchetypes(userId: string): Promise<DayArchetype[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .query(`
        SELECT da.id, da.program_id, p.name AS program_name, da.name, da.description, da.created_at, da.modified_at,
               (SELECT COUNT(*) FROM day_slots s WHERE s.day_archetype_id = da.id) AS slot_count,
               (
                 SELECT STRING_AGG(CONCAT(s2.role, ':', CASE WHEN s2.is_warmup = 1 THEN 1 ELSE 0 END), ',') WITHIN GROUP (ORDER BY s2.order_index)
                 FROM day_slots s2 WHERE s2.day_archetype_id = da.id
               ) AS slot_sequence -- ordered "role:is_warmup" tokens, cheap enough to ship with the list (no per-row slot fetch) — powers the collapsed-row composition strip
        FROM day_archetypes da
        LEFT JOIN programs p ON p.id = da.program_id
        WHERE da.user_id = @userId ORDER BY da.created_at DESC
      `);
    if (result.recordset.length === 0) console.warn(`No day archetypes found for user id: '${userId}'`);
    return result.recordset;
  } catch (error) {
    console.error('Error fetching day archetypes:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Fetch one archetype with its ordered slots (joined to muscle group + pinned exercise names). Throws if missing.
export async function getDayArchetypeWithSlots(userId: string, id: string): Promise<DayArchetypeWithSlots> {
  let pool;
  try {
    pool = await getGolemConnection();
    const archetypeResult = await pool.request()
      .input('userId', userId)
      .input('id', id)
      .query(`SELECT id, program_id, name, description, created_at, modified_at FROM day_archetypes WHERE id = @id AND user_id = @userId`);
    if (archetypeResult.recordset.length === 0) {
      throw new Error(`No day archetype found for id: '${id}'`);
    }

    const slotsResult = await pool.request()
      .input('userId', userId)
      .input('id', id)
      .query(`
        SELECT s.id, s.day_archetype_id, s.order_index, s.role, s.target_muscle_group_id,
               mg.name AS target_muscle_name, s.category_filter, s.rotation_cadence,
               s.pinned_exercise_id, ex.name AS pinned_exercise_name, s.is_optional, s.is_warmup,
               s.progression_model, s.rep_low, s.rep_high, s.time_low_seconds, s.time_high_seconds,
               s.target_rpe, s.load_step_pct, s.round_to_step, s.set_target
        FROM day_slots s
        LEFT JOIN muscle_groups mg ON mg.id = s.target_muscle_group_id
        LEFT JOIN exercises ex ON ex.id = s.pinned_exercise_id
        WHERE s.day_archetype_id = @id AND s.user_id = @userId
        ORDER BY s.order_index
      `);

    return { ...archetypeResult.recordset[0], slots: slotsResult.recordset as DaySlot[] };
  } catch (error) {
    console.error('Error fetching day archetype with slots:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Create a day archetype; returns the new id. Optionally creates its slots in the SAME transaction so a
// full archetype (name + slots) is built atomically — a slot failure rolls back the archetype too, never
// leaving a half-built record. Omit `slots` (or pass []) to create a bare archetype as before.
export async function createDayArchetype(
  userId: string,
  input: { name: string; description: string | null; program_id: string | null; slots?: DaySlotInput[] },
): Promise<string> {
  let pool;
  const slots = input.slots ?? [];
  try {
    pool = await getGolemConnection();

    // No slots → single insert, no transaction needed (preserves the original bare-create behavior).
    if (slots.length === 0) {
      const result = await pool.request()
        .input('userId', userId)
        .input('name', input.name)
        .input('description', input.description)
        .input('programId', input.program_id)
        .query(`
          INSERT INTO day_archetypes (user_id, program_id, name, description)
          OUTPUT INSERTED.id
          VALUES (@userId, @programId, @name, @description)
        `);
      return result.recordset[0].id;
    }

    // Archetype + slots → one transaction.
    const transaction = pool.transaction();
    await transaction.begin();
    try {
      const result = await transaction.request()
        .input('userId', userId)
        .input('name', input.name)
        .input('description', input.description)
        .input('programId', input.program_id)
        .query(`
          INSERT INTO day_archetypes (user_id, program_id, name, description)
          OUTPUT INSERTED.id
          VALUES (@userId, @programId, @name, @description)
        `);
      const archetypeId = result.recordset[0].id;

      // Insert each slot, normalizing order_index to its position (1-based) so the engine reads them in order.
      let order = 1;
      for (const slot of slots) {
        await bindSlotInput(
          transaction.request().input('userId', userId).input('archetypeId', archetypeId),
          { ...slot, order_index: order++ },
        ).query(`
          INSERT INTO day_slots (user_id, day_archetype_id, order_index, role, target_muscle_group_id, category_filter,
            rotation_cadence, pinned_exercise_id, is_optional, is_warmup, progression_model, rep_low, rep_high, time_low_seconds,
            time_high_seconds, target_rpe, load_step_pct, round_to_step, set_target)
          VALUES (@userId, @archetypeId, @orderIndex, @role, @targetMuscleGroupId, @categoryFilter, @rotationCadence,
            @pinnedExerciseId, @isOptional, @isWarmup, @progressionModel, @repLow, @repHigh, @timeLowSeconds, @timeHighSeconds,
            @targetRpe, @loadStepPct, @roundToStep, @setTarget)
        `);
      }

      await transaction.commit();
      return archetypeId;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error creating day archetype:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Update an archetype's name/description.
export async function updateDayArchetype(
  userId: string,
  id: string,
  input: { name: string; description: string | null },
): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    await pool.request()
      .input('userId', userId)
      .input('id', id)
      .input('name', input.name)
      .input('description', input.description)
      .query(`
        UPDATE day_archetypes SET name = @name, description = @description, modified_at = GETDATE()
        WHERE id = @id AND user_id = @userId
      `);
  } catch (error) {
    console.error('Error updating day archetype:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Delete an archetype and its slots (slots first for FK). Also clears the link from any sessions.
export async function deleteDayArchetype(userId: string, id: string): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const request = pool.request().input('userId', userId).input('id', id);
    await request.query(`
      UPDATE workout_sessions SET day_archetype_id = NULL, modified_at = GETDATE() WHERE day_archetype_id = @id AND user_id = @userId;
      DELETE FROM day_slots WHERE day_archetype_id = @id AND user_id = @userId;
      DELETE FROM day_archetypes WHERE id = @id AND user_id = @userId;
    `);
  } catch (error) {
    console.error('Error deleting day archetype:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Bind the slot input columns onto a request (shared by create + update).
function bindSlotInput(request: any, input: DaySlotInput) {
  return request
    .input('orderIndex', input.order_index)
    .input('role', input.role)
    .input('targetMuscleGroupId', input.target_muscle_group_id)
    .input('categoryFilter', input.category_filter)
    .input('rotationCadence', input.rotation_cadence)
    // A pin is only honored on never/per_block (the engine ignores pins on per_session slots), so drop
    // a per_session pin at write time — prevents contradictory, inert-but-misleading config being stored.
    .input('pinnedExerciseId', input.rotation_cadence === 'per_session' ? null : input.pinned_exercise_id)
    .input('isOptional', input.is_optional ? 1 : 0)
    .input('isWarmup', input.is_warmup ? 1 : 0)
    .input('progressionModel', input.progression_model)
    .input('repLow', input.rep_low)
    .input('repHigh', input.rep_high)
    .input('timeLowSeconds', input.time_low_seconds)
    .input('timeHighSeconds', input.time_high_seconds)
    .input('targetRpe', input.target_rpe)
    .input('loadStepPct', input.load_step_pct)
    .input('roundToStep', input.round_to_step)
    .input('setTarget', input.set_target);
}

// Add a slot to an archetype; returns the new slot id.
export async function createDaySlot(userId: string, dayArchetypeId: string, input: DaySlotInput): Promise<string> {
  let pool;
  try {
    pool = await getGolemConnection();
    const request = bindSlotInput(pool.request().input('userId', userId).input('archetypeId', dayArchetypeId), input);
    const result = await request.query(`
      INSERT INTO day_slots (user_id, day_archetype_id, order_index, role, target_muscle_group_id, category_filter,
        rotation_cadence, pinned_exercise_id, is_optional, is_warmup, progression_model, rep_low, rep_high, time_low_seconds,
        time_high_seconds, target_rpe, load_step_pct, round_to_step, set_target)
      OUTPUT INSERTED.id
      VALUES (@userId, @archetypeId, @orderIndex, @role, @targetMuscleGroupId, @categoryFilter, @rotationCadence,
        @pinnedExerciseId, @isOptional, @isWarmup, @progressionModel, @repLow, @repHigh, @timeLowSeconds, @timeHighSeconds,
        @targetRpe, @loadStepPct, @roundToStep, @setTarget)
    `);
    return result.recordset[0].id;
  } catch (error) {
    console.error('Error creating day slot:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Update an existing slot.
export async function updateDaySlot(userId: string, slotId: string, input: DaySlotInput): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const request = bindSlotInput(pool.request().input('userId', userId).input('slotId', slotId), input);
    await request.query(`
      UPDATE day_slots SET order_index=@orderIndex, role=@role, target_muscle_group_id=@targetMuscleGroupId,
        category_filter=@categoryFilter, rotation_cadence=@rotationCadence, pinned_exercise_id=@pinnedExerciseId,
        is_optional=@isOptional, is_warmup=@isWarmup, progression_model=@progressionModel, rep_low=@repLow, rep_high=@repHigh,
        time_low_seconds=@timeLowSeconds, time_high_seconds=@timeHighSeconds,
        target_rpe=@targetRpe, load_step_pct=@loadStepPct, round_to_step=@roundToStep, set_target=@setTarget,
        modified_at=GETDATE()
      WHERE id=@slotId AND user_id=@userId
    `);
  } catch (error) {
    console.error('Error updating day slot:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Delete a slot.
export async function deleteDaySlot(userId: string, slotId: string): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    await pool.request().input('userId', userId).input('slotId', slotId)
      .query(`DELETE FROM day_slots WHERE id = @slotId AND user_id = @userId`);
  } catch (error) {
    console.error('Error deleting day slot:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// Assign (or clear, with null) a session's day archetype.
export async function setSessionDayArchetype(userId: string, sessionId: string, dayArchetypeId: string | null): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    await pool.request()
      .input('userId', userId)
      .input('sessionId', sessionId)
      .input('archetypeId', dayArchetypeId)
      .query(`UPDATE workout_sessions SET day_archetype_id = @archetypeId, modified_at = GETDATE() WHERE id = @sessionId AND user_id = @userId`);
  } catch (error) {
    console.error('Error assigning session day archetype:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}
