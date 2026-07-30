import { randomUUID } from 'crypto';
import { getGolemConnection, closeGolemConnection } from './db';
import type { DaySlotInput } from '../types/dayArchetype';

// Manifest shape — what an external client (Claude.ai via MCP) may propose. Each entry is
// full-text replacement scoped per row. Template-level prompts are intentionally NOT in scope —
// base system prompts must not be editable through the plan-change tools.
type ProgramField = 'name' | 'description';
// day_archetype_id assigns/clears the day archetype a session generates from (value = archetype UUID, or '' to clear).
type SessionField = 'name' | 'description' | 'day_archetype_id';

// A structural edit to a day archetype's slots — the lever for "more core"-style feedback (the
// deterministic engine generates straight from slots). Scoped to a program: if the target archetype
// is shared (library / belongs to another program) it is CLONED for this program before editing, and
// the program's unstarted sessions are repointed to the clone (clone-on-write). slot_id (for
// update/remove) refers to a slot in the ORIGINAL archetype; clone translation is handled on apply.
export type SlotOp = 'add_slot' | 'update_slot' | 'remove_slot';
export interface ArchetypeSlotChange {
  program_id: string;
  day_archetype_id: string;
  op: SlotOp;
  slot_id?: string;        // update_slot / remove_slot
  slot?: DaySlotInput;     // add_slot / update_slot
}

export interface FeedbackManifest {
  summary: string;
  program_updates?: { program_id: string; field: ProgramField; value: string }[];
  session_updates?: { session_id: string; field: SessionField; value: string }[];
  archetype_slot_changes?: ArchetypeSlotChange[];
}

export interface ApplyResult {
  programs: number;
  sessions: number;
  archetypes_cloned: number; // shared archetypes forked for a program by a slot change (clone-on-write)
  slots_changed: number;     // slots added/updated/removed across archetype_slot_changes
}

const ALLOWED_PROGRAM_FIELDS: ProgramField[] = ['name', 'description'];
const ALLOWED_SESSION_FIELDS: SessionField[] = ['name', 'description', 'day_archetype_id'];

// Column list shared by the day_slots INSERT/SELECT in clone + add operations (matches createDaySlot).
const SLOT_COLUMNS = `order_index, role, target_muscle_group_id, category_filter, rotation_cadence,
  pinned_exercise_id, is_optional, is_warmup, progression_model, rep_low, rep_high, time_low_seconds,
  time_high_seconds, target_rpe, load_step_pct, round_to_step, set_target`;
const SLOT_VALUES = `@orderIndex, @role, @targetMuscleGroupId, @categoryFilter, @rotationCadence,
  @pinnedExerciseId, @isOptional, @isWarmup, @progressionModel, @repLow, @repHigh, @timeLowSeconds,
  @timeHighSeconds, @targetRpe, @loadStepPct, @roundToStep, @setTarget`;

// Bind a DaySlotInput onto a request (mirrors bindSlotInput in dayArchetypeFunctions; duplicated here
// so slot writes can run inside the feedback transaction rather than via the standalone CRUD pools).
function bindSlot(request: any, input: DaySlotInput) {
  return request
    .input('orderIndex', input.order_index)
    .input('role', input.role)
    .input('targetMuscleGroupId', input.target_muscle_group_id)
    .input('categoryFilter', input.category_filter)
    .input('rotationCadence', input.rotation_cadence)
    // A pin is only honored on never/per_block (the engine ignores per_session pins), so drop a
    // per_session pin at write time — keeps clones + slot edits from storing inert, misleading config.
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

// Map a day_slots row (snake_case) back into a DaySlotInput, for copying slots onto a clone.
function rowToSlotInput(row: any): DaySlotInput {
  return {
    order_index: row.order_index, role: row.role, target_muscle_group_id: row.target_muscle_group_id,
    category_filter: row.category_filter, rotation_cadence: row.rotation_cadence,
    pinned_exercise_id: row.pinned_exercise_id, is_optional: !!row.is_optional, is_warmup: !!row.is_warmup,
    progression_model: row.progression_model, rep_low: row.rep_low, rep_high: row.rep_high,
    time_low_seconds: row.time_low_seconds, time_high_seconds: row.time_high_seconds,
    target_rpe: row.target_rpe, load_step_pct: row.load_step_pct, round_to_step: row.round_to_step,
    set_target: row.set_target,
  };
}

// ============================
// Persistence
// ============================

async function insertMessage(
  userId: string,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  proposal: FeedbackManifest | null,
): Promise<string> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('conversationId', conversationId)
      .input('role', role)
      .input('content', content)
      .input('proposalJson', proposal ? JSON.stringify(proposal) : null)
      .query(`
        INSERT INTO feedback_messages (user_id, conversation_id, role, content, proposal_json)
        OUTPUT INSERTED.id
        VALUES (@userId, @conversationId, @role, @content, @proposalJson)
      `);
    return result.recordset[0].id;
  } catch (error) {
    console.error('Error inserting feedback message:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}

// ============================
// External (MCP) change application
// ============================

// Records an external (e.g. MCP) change AND applies it immediately. Writes the user + assistant
// turns (with applied_at stamped) so there is a persistent audit trail of what was changed and why.
// Returns the applied counts alongside the conversation/message ids.
export async function applyExternalChange(
  userId: string,
  args: {
    originalQuestion: string;
    summary: string;
    proposal: FeedbackManifest;
    conversationId?: string | null;
    sourceLabel?: string;
  },
): Promise<{ conversationId: string; userMessageId: string; assistantMessageId: string; applied: ApplyResult }> {
  const convId = args.conversationId ?? randomUUID();
  const label = args.sourceLabel?.trim() || 'Claude.ai (via MCP)';
  const userText = `[${label}] ${args.originalQuestion.trim()}`.slice(0, 4000);
  const assistantText = args.summary.trim() || args.proposal.summary;

  const userMessageId = await insertMessage(userId, convId, 'user', userText, null);
  const assistantMessageId = await insertMessage(userId, convId, 'assistant', assistantText, args.proposal);

  // Apply now, then stamp applied_at so the audit trail reflects that it was already applied.
  const applied = await applyFeedbackManifest(userId, args.proposal);

  let pool;
  try {
    pool = await getGolemConnection();
    await pool.request()
      .input('id', assistantMessageId)
      .query(`UPDATE feedback_messages SET applied_at = GETDATE() WHERE id = @id`);
  } catch (error) {
    console.error('Error stamping applied_at on external change:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }

  return { conversationId: convId, userMessageId, assistantMessageId, applied };
}

async function applyFeedbackManifest(userId: string, manifest: FeedbackManifest): Promise<ApplyResult> {
  // template_updates is intentionally NOT processed — base system prompts are out of scope.
  // If an external client emits them anyway, log and drop so we have a paper trail without applying anything.
  const droppedTemplateUpdates = (manifest as any).template_updates;
  if (Array.isArray(droppedTemplateUpdates) && droppedTemplateUpdates.length > 0) {
    console.warn(`[Feedback] Dropped ${droppedTemplateUpdates.length} template_updates entries — template edits are out of scope`);
  }

  const programUpdates = (manifest.program_updates ?? []).filter(u =>
    typeof u.program_id === 'string'
    && typeof u.value === 'string'
    && ALLOWED_PROGRAM_FIELDS.includes(u.field)
  );
  const sessionUpdates = (manifest.session_updates ?? []).filter(u =>
    typeof u.session_id === 'string'
    && typeof u.value === 'string'
    && ALLOWED_SESSION_FIELDS.includes(u.field)
  );
  const slotChanges = (manifest.archetype_slot_changes ?? []).filter(c =>
    typeof c.program_id === 'string'
    && typeof c.day_archetype_id === 'string'
    && (c.op === 'add_slot' || c.op === 'update_slot' || c.op === 'remove_slot')
  );

  if (programUpdates.length + sessionUpdates.length + slotChanges.length === 0) {
    return { programs: 0, sessions: 0, archetypes_cloned: 0, slots_changed: 0 };
  }

  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    let appliedPrograms = 0;
    let appliedSessions = 0;
    let appliedClones = 0;
    let appliedSlots = 0;

    try {
      for (const update of programUpdates) {
        const result = await transaction.request()
          .input('userId', userId)
          .input('id', update.program_id)
          .input('value', update.value)
          .query(`
            UPDATE programs
            SET ${update.field} = @value, modified_at = GETDATE()
            WHERE id = @id AND user_id = @userId
          `);
        appliedPrograms += result.rowsAffected[0] ?? 0;
      }

      for (const update of sessionUpdates) {
        // day_archetype_id is a nullable FK — an empty string clears the assignment (bind null).
        const value = update.field === 'day_archetype_id' && update.value.trim() === '' ? null : update.value;
        const result = await transaction.request()
          .input('userId', userId)
          .input('id', update.session_id)
          .input('value', value)
          .query(`
            UPDATE workout_sessions
            SET ${update.field} = @value, modified_at = GETDATE()
            WHERE id = @id AND user_id = @userId AND is_completed = 0
          `);
        appliedSessions += result.rowsAffected[0] ?? 0;
      }

      // Archetype slot changes — the structural lever for program feedback ("more core"). For each
      // change, resolve the archetype to edit: if it's already private to this program, edit in place;
      // otherwise CLONE it (copy archetype + slots, repoint this program's unstarted sessions) and edit
      // the clone. Cloning + repointing happens once per (program, source archetype); the slot-id map
      // lets update/remove ops (which reference original slot ids) target the cloned copies.
      const resolvedArchetypes = new Map<string, { effectiveId: string; slotMap: Map<string, string> | null }>();

      for (const change of slotChanges) {
        const cacheKey = `${change.program_id}::${change.day_archetype_id}`;
        let resolved = resolvedArchetypes.get(cacheKey);

        if (!resolved) {
          const archResult = await transaction.request()
            .input('userId', userId)
            .input('id', change.day_archetype_id)
            .query(`SELECT id, program_id, name, description FROM day_archetypes WHERE id = @id AND user_id = @userId`);
          if (archResult.recordset.length === 0) continue; // unknown archetype — skip silently
          const arch = archResult.recordset[0];

          if (arch.program_id === change.program_id) {
            // Already this program's private archetype — edit in place, slot ids are valid as-is.
            resolved = { effectiveId: change.day_archetype_id, slotMap: null };
          } else {
            // Shared (library / another program's) — clone for this program before editing.
            const cloneResult = await transaction.request()
              .input('userId', userId)
              .input('programId', change.program_id)
              .input('name', arch.name)
              .input('description', arch.description)
              .query(`
                INSERT INTO day_archetypes (user_id, program_id, name, description)
                OUTPUT INSERTED.id
                VALUES (@userId, @programId, @name, @description)
              `);
            const newArchetypeId = cloneResult.recordset[0].id;

            // Copy every slot, capturing original-id → clone-id so later ops can be translated.
            const slotMap = new Map<string, string>();
            const srcSlots = await transaction.request()
              .input('userId', userId)
              .input('src', change.day_archetype_id)
              .query(`SELECT id, ${SLOT_COLUMNS} FROM day_slots WHERE day_archetype_id = @src AND user_id = @userId ORDER BY order_index`);
            for (const srcSlot of srcSlots.recordset) {
              const inserted = await bindSlot(
                transaction.request().input('userId', userId).input('archetypeId', newArchetypeId),
                rowToSlotInput(srcSlot),
              ).query(`
                INSERT INTO day_slots (user_id, day_archetype_id, ${SLOT_COLUMNS})
                OUTPUT INSERTED.id
                VALUES (@userId, @archetypeId, ${SLOT_VALUES})
              `);
              slotMap.set(srcSlot.id, inserted.recordset[0].id);
            }

            // Repoint this program's UNSTARTED sessions from the source archetype to the clone.
            // Started/completed sessions keep the original so logged history/lineage is untouched.
            await transaction.request()
              .input('userId', userId)
              .input('programId', change.program_id)
              .input('src', change.day_archetype_id)
              .input('newId', newArchetypeId)
              .query(`
                UPDATE ws SET ws.day_archetype_id = @newId, ws.modified_at = GETDATE()
                FROM workout_sessions ws
                JOIN weeks w ON ws.week_id = w.id
                JOIN blocks b ON w.block_id = b.id
                WHERE b.program_id = @programId AND ws.day_archetype_id = @src AND ws.user_id = @userId
                  AND ws.is_completed = 0 AND ws.started_at IS NULL
              `);

            resolved = { effectiveId: newArchetypeId, slotMap };
            appliedClones += 1;
          }
          resolvedArchetypes.set(cacheKey, resolved);
        }

        const effectiveId = resolved.effectiveId;
        // Translate a referenced slot id through the clone map (identity when editing in place).
        const targetSlotId = (id: string | undefined): string | null =>
          !id ? null : resolved!.slotMap ? (resolved!.slotMap.get(id) ?? null) : id;

        if (change.op === 'add_slot' && change.slot) {
          await bindSlot(
            transaction.request().input('userId', userId).input('archetypeId', effectiveId),
            change.slot,
          ).query(`
            INSERT INTO day_slots (user_id, day_archetype_id, ${SLOT_COLUMNS})
            VALUES (@userId, @archetypeId, ${SLOT_VALUES})
          `);
          appliedSlots += 1;
        } else if (change.op === 'update_slot' && change.slot) {
          const slotId = targetSlotId(change.slot_id);
          if (slotId) {
            const updRes = await bindSlot(
              transaction.request().input('userId', userId).input('slotId', slotId).input('archetypeId', effectiveId),
              change.slot,
            ).query(`
              UPDATE day_slots SET order_index=@orderIndex, role=@role, target_muscle_group_id=@targetMuscleGroupId,
                category_filter=@categoryFilter, rotation_cadence=@rotationCadence, pinned_exercise_id=@pinnedExerciseId,
                is_optional=@isOptional, is_warmup=@isWarmup, progression_model=@progressionModel, rep_low=@repLow, rep_high=@repHigh,
                time_low_seconds=@timeLowSeconds, time_high_seconds=@timeHighSeconds, target_rpe=@targetRpe,
                load_step_pct=@loadStepPct, round_to_step=@roundToStep, set_target=@setTarget, modified_at=GETDATE()
              WHERE id=@slotId AND day_archetype_id=@archetypeId AND user_id=@userId
            `);
            appliedSlots += updRes.rowsAffected[0] ?? 0;
          }
        } else if (change.op === 'remove_slot') {
          const slotId = targetSlotId(change.slot_id);
          if (slotId) {
            const delRes = await transaction.request()
              .input('userId', userId)
              .input('slotId', slotId)
              .input('archetypeId', effectiveId)
              .query(`DELETE FROM day_slots WHERE id=@slotId AND day_archetype_id=@archetypeId AND user_id=@userId`);
            appliedSlots += delRes.rowsAffected[0] ?? 0;
          }
        }
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return { programs: appliedPrograms, sessions: appliedSessions, archetypes_cloned: appliedClones, slots_changed: appliedSlots };
  } catch (error) {
    console.error('Error applying feedback manifest:', error);
    throw error;
  } finally {
    if (pool) await closeGolemConnection(pool);
  }
}
