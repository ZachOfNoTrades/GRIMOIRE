import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpContext } from '@/lib/mcp/context';
import { json, text } from '@/lib/mcp/format';

import { getUserProfile, updateUserProfile } from '@/app/modules/golem/lib/userProfileFunctions';
import {
  getCurrentProgramId,
  getProgramById,
  getAllPrograms,
  getTemplateIdForProgram,
  updateProgram,
  deleteProgram,
  archiveProgram,
  activateProgram,
  createProgram,
  appendWeekFromSource,
} from '@/app/modules/golem/lib/programFunctions';
import { createProgramFromSkeleton } from '@/app/modules/golem/lib/archetypeProgramSkeleton';
import type { ArchetypeSkeletonBlock } from '@/app/modules/golem/lib/archetypeProgramSkeleton';
import type { CreateProgramPayload } from '@/app/modules/golem/types/program';
import {
  getAllWorkoutSessions,
  getCurrentWorkoutSession,
  getWorkoutSessionById,
  createWorkoutSession,
  createProgramSession,
  deleteWorkoutSession,
  setWorkoutSessionAsCurrent,
  resetWorkoutSession,
} from '@/app/modules/golem/lib/workoutSessionFunctions';
import {
  getAllExercisesWithMuscleGroups,
  getExerciseHistory,
  enableExercise,
  disableExercise,
  setExerciseHold,
  clearExerciseHold,
  getExerciseHolds,
  createExercise,
  updateExercise,
  getExerciseById,
  getExerciseEquipment,
  setExerciseEquipment,
} from '@/app/modules/golem/lib/exerciseFunctions';
import {
  getAllMuscleGroups,
  getExerciseMuscleGroups,
  updateExerciseMuscleGroups,
} from '@/app/modules/golem/lib/muscleGroupFunctions';
import {
  getWeeklyVolumeByMuscleGroup,
  getCalculatedVolumeLandmarks,
} from '@/app/modules/golem/lib/volumeLandmarkFunctions';
import { getSegmentsAndTargets } from '@/app/modules/golem/lib/segmentFunctions';
import { applyExternalChange } from '@/app/modules/golem/lib/feedbackFunctions';
import {
  getDayArchetypes,
  getDayArchetypeWithSlots,
  createDayArchetype,
  updateDayArchetype,
  deleteDayArchetype,
  createDaySlot,
  updateDaySlot,
  deleteDaySlot,
  setSessionDayArchetype,
} from '@/app/modules/golem/lib/dayArchetypeFunctions';
import {
  getAllProgramTemplates,
  getProgramTemplateById,
  createProgramTemplate,
  updateProgramTemplate,
  deleteProgramTemplate,
} from '@/app/modules/golem/lib/programTemplateFunctions';
import {
  listLocations,
  createLocation,
  renameLocation,
  deleteLocation,
  setActiveLocation,
  setActiveWarmupLocation,
  setBodyweightOnly,
  resolveLocationId,
  listEquipment,
  listEquipmentOptions,
  createEquipment,
  updateEquipment,
} from '@/app/modules/golem/lib/locationFunctions';
import { generateSessionTargetsWithEngine } from '@/app/modules/golem/lib/engine/generationService';
import { createGeneratedTargets, deleteAllTargetsForSession } from '@/app/modules/golem/lib/segmentFunctions';
import { logGeneration } from '@/lib/generationLimit';

// A single primary/secondary muscle mapping on an exercise. muscleGroupId comes from
// golem_list_muscle_groups. Passing a muscleGroups array REPLACES the exercise's whole mapping set.
const MuscleGroupAssignment = z.object({
  muscleGroupId: z.string().describe('Muscle group UUID — look up with golem_list_muscle_groups'),
  isPrimary: z.boolean().describe('true = primary mover, false = secondary (assisting) mover'),
});

// Only 'short' / 'long' are valid distance modalities; anything else means no distance tracking.
// Mirrors the normalization in the /api/exercises/[id] PUT route.
function normalizeDistanceType(distanceType: string | null | undefined): string | null {
  return distanceType === 'short' || distanceType === 'long' ? distanceType : null;
}

// Re-fetch an exercise together with its muscle groups + equipment ids, the same bundled shape the
// exercise detail API returns — used as the MCP response after a create/update.
async function exerciseDetail(userId: string, exerciseId: string) {
  const [exercise, muscleGroups, equipment] = await Promise.all([
    getExerciseById(userId, exerciseId),
    getExerciseMuscleGroups(exerciseId),
    getExerciseEquipment(exerciseId),
  ]);
  return { ...exercise, muscleGroups, equipment };
}

const ProgramFieldUpdate = z.object({
  program_id: z.string().describe('Program UUID to update'),
  field: z.enum(['name', 'description']),
  value: z.string(),
});

const SessionFieldUpdate = z.object({
  session_id: z.string().describe('Workout session UUID to update'),
  field: z.enum(['name', 'description', 'day_archetype_id']),
  value: z
    .string()
    .describe(
      "New value. For day_archetype_id: a day archetype UUID (from golem_get_day_archetypes) to make the session generate from that archetype, or an empty string to clear the assignment. Only upcoming (not-completed) sessions are updated.",
    ),
});

// Full day-slot definition — what the deterministic engine generates one exercise against.
// role: primary|secondary|isolation|unilateral|core|carry|conditioning.
// progression_model: double_progression|linear|rpe_pct1rm|time_effort.
// rotation_cadence: never|per_block|per_session. category_filter: Strength|Cardio|Mobility.
// PRESCRIBE BY RPE: set target_rpe on every Strength slot (incl. timed holds) — RPE is the preferred
// intensity anchor. A slot with target_rpe lets the engine pair its computed load WITH an RPE; a slot
// left at target_rpe=null falls back to pure-RPE prescription (no weight shown), and a no-history timed
// hold with null RPE gets no target at all. Leave null ONLY for Cardio/conditioning (dosed by duration).
const DaySlotInputSchema = z.object({
  order_index: z.number().int().describe('Position within the day (engine generates slots in this order).'),
  role: z.string().describe('primary | secondary | isolation | unilateral | core | carry | conditioning'),
  target_muscle_group_id: z.string().nullable().describe('Muscle group UUID the engine selects a PRIMARY-mover exercise for (null = no muscle constraint).'),
  category_filter: z.string().describe('Strength | Cardio | Mobility'),
  rotation_cadence: z.string().describe('never (fixed exercise) | per_block | per_session (rotate every session). NOTE: a pin is only honored on never/per_block — pins on per_session slots are ignored by the engine and will be dropped on save.'),
  pinned_exercise_id: z.string().nullable().describe('Leave NULL by default — the engine selects the exercise from the slot\'s role/muscle/history; that is the point of an archetype. Pin ONLY for deliberate specificity (a lift that must be trained as-is), and only on a never/per_block slot. Do not pin every slot; a fully-pinned archetype defeats the engine and is the template flow, not this one.'),
  is_optional: z.boolean().describe('Optional slots may be dropped by the engine when constrained.'),
  is_warmup: z.boolean().default(false).describe('Warmup-exercise slot: the engine picks an exercise by this slot\'s category_filter (e.g. Mobility/Cardio) and optional target muscle, sourced from the user\'s active warmup location (else the working location), and emits it as an is_warmup segment ordered before the working slots. Warmup slots get a simple fixed dose (set_target × rep_low, or a timed dose when the exercise is timed) with no load progression — progression_model / target_rpe / load fields are ignored. Default false (a normal working slot).'),
  progression_model: z.string().describe('double_progression | linear | rpe_pct1rm | time_effort'),
  rep_low: z.number().int(),
  rep_high: z.number().int(),
  time_low_seconds: z.number().int().nullable().describe('Cardio (time_effort) dose lower bound; null for rep-based or strength holds.'),
  time_high_seconds: z.number().int().nullable(),
  target_rpe: z.number().nullable().describe('Target RPE (typically 6–10) for the working sets — the PREFERRED way to set intensity. Fill this in on EVERY Strength slot, including timed strength holds (planks, hangs): the engine anchors its computed load to this RPE and self-regulates from what the user logs, and on a hold with no logged history yet the RPE is the user\'s only intensity target. Leave null ONLY for Cardio/conditioning slots (effort dosed by duration). A null on a Strength slot makes it prescribe RPE-by-feel with no weight, and on a no-history timed hold leaves the set with no target at all.'),
  load_step_pct: z.number().describe('Fractional load increment (e.g. 0.05 = 5%). Default 0.05.'),
  round_to_step: z.number().describe('Round prescribed load to this increment (e.g. 5). Default 5.'),
  set_target: z.number().int(),
});

// A structural edit to a program's day-archetype slots — the lever for "more core"-style feedback.
// The engine generates straight from slots, so adding/growing a slot changes future sessions. Scoped
// to a program: a SHARED archetype (library, or used by another program) is cloned for this program
// before editing and the program's unstarted sessions are repointed to the clone (clone-on-write).
const ArchetypeSlotChange = z.object({
  program_id: z.string().describe('Program this edit is scoped to. If the archetype is shared, it is cloned for this program.'),
  day_archetype_id: z.string().describe('Day archetype to edit — get the id from golem_get_day_archetypes or the session day_archetype_id in golem_get_current_program.'),
  op: z.enum(['add_slot', 'update_slot', 'remove_slot']),
  slot_id: z.string().optional().describe('For update_slot/remove_slot: the existing slot id (from golem_get_day_archetypes). Refers to the slot in the original archetype; clone translation is automatic.'),
  slot: DaySlotInputSchema.optional().describe('For add_slot/update_slot: the full slot definition.'),
});

export function registerGolemTools(server: McpServer, ctx: McpContext) {
  const userId = ctx.user.id;

  // -----------------------------
  // Read tools — context for training advice
  // -----------------------------

  server.registerTool(
    'golem_get_user_profile',
    {
      description:
        'Returns the freeform golem user profile prompt — body history, goals, constraints, injuries — that the user has written about themselves. Read this first when answering programming questions.',
      inputSchema: {},
    },
    async () => {
      const profile = await getUserProfile(userId).catch(() => null);
      return json(profile);
    },
  );

  server.registerTool(
    'golem_update_user_profile',
    {
      description:
        "Replace the user's freeform golem profile prompt — the body history, goals, constraints, and injuries used as context for programming advice. This OVERWRITES the entire profile prompt; it is not an append, so include everything that should remain. Read the existing profile with golem_get_user_profile first, then submit the full revised text. Only do this when the user has explicitly asked to record or change their profile.",
      inputSchema: {
        profilePrompt: z
          .string()
          .describe(
            'The complete new profile prompt. Replaces the existing prompt in full. Pass an empty string to clear the profile.',
          ),
      },
    },
    async ({ profilePrompt }) => {
      const profile = await updateUserProfile(userId, { profilePrompt });
      return json(profile);
    },
  );

  server.registerTool(
    'golem_get_current_program',
    {
      description:
        'Returns the user\'s current active program with its full nested structure (blocks → weeks → sessions), including week and session IDs. Use the week IDs here to look up per-week volume with golem_get_weekly_volume_by_muscle.',
      inputSchema: {},
    },
    async () => {
      const programId = await getCurrentProgramId(userId);
      if (!programId) return json(null);
      const [program, templateId] = await Promise.all([
        getProgramById(userId, programId),
        getTemplateIdForProgram(userId, programId).catch(() => null),
      ]);
      return json({ ...program, template_id: templateId });
    },
  );

  server.registerTool(
    'golem_list_programs',
    {
      description: 'Paginated list of the user\'s training programs (current, completed, and optionally archived).',
      inputSchema: {
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        includeArchived: z.boolean().default(false),
      },
    },
    async ({ page, pageSize, includeArchived }) => {
      const data = await getAllPrograms(userId, page, pageSize, includeArchived);
      return json(data);
    },
  );

  server.registerTool(
    'golem_get_program',
    {
      description: 'Returns a single program by id with full block/week/session structure.',
      inputSchema: {
        programId: z.string().describe('Program UUID'),
      },
    },
    async ({ programId }) => json(await getProgramById(userId, programId)),
  );

  server.registerTool(
    'golem_list_sessions',
    {
      description: 'Paginated list of the user\'s workout sessions across all programs.',
      inputSchema: {
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      },
    },
    async ({ page, pageSize }) => json(await getAllWorkoutSessions(userId, page, pageSize)),
  );

  server.registerTool(
    'golem_get_session',
    {
      description: 'Full detail for one workout session: planned segments, sets logged (reps, weight, RPE), completion state.',
      inputSchema: { sessionId: z.string().describe('Workout session UUID') },
    },
    async ({ sessionId }) => {
      // getWorkoutSessionById returns the session row + the day-archetype SLOT TEMPLATE only
      // (built for the app's empty-session plan preview). The app loads the actual LOGGED
      // exercises/sets from a separate endpoint (getSegmentsAndTargets), so over MCP the logged
      // data was silently missing. Merge it in here so the tool's contract ("sets logged") holds.
      const session = await getWorkoutSessionById(userId, sessionId);
      const { exercises } = await getSegmentsAndTargets(userId, sessionId);
      return json({ ...session, logged_exercises: exercises });
    },
  );

  server.registerTool(
    'golem_get_current_session',
    {
      description: 'The currently in-progress workout session, if any, or null.',
      inputSchema: {},
    },
    async () => json(await getCurrentWorkoutSession(userId)),
  );

  server.registerTool(
    'golem_set_current_session',
    {
      description:
        "Make a workout session the user's current/active session. Clears the current flag on every other session in the program and syncs the parent week/block pointers; does not change the session's name, timer, or completion state. Find ids with golem_list_sessions / golem_get_program. No-op if the session is already current.",
      inputSchema: { sessionId: z.string().describe('Workout session UUID') },
    },
    async ({ sessionId }) => {
      await setWorkoutSessionAsCurrent(userId, sessionId);
      return json({ success: true, sessionId });
    },
  );

  server.registerTool(
    'golem_list_exercises',
    {
      description:
        'All exercises available to the user, with primary/secondary muscle group mappings and the user\'s best logged set per exercise. Use when reasoning about exercise selection or substitutions.',
      inputSchema: {},
    },
    async () => json(await getAllExercisesWithMuscleGroups(userId)),
  );

  server.registerTool(
    'golem_list_muscle_groups',
    {
      description:
        'The muscle-group taxonomy (id + name). Use these ids to set the primary/secondary movers on an exercise via golem_create_exercise / golem_update_exercise (muscleGroups).',
      inputSchema: {},
    },
    async () => json(await getAllMuscleGroups()),
  );

  server.registerTool(
    'golem_get_exercise_history',
    {
      description:
        'Per-exercise set history (weight, reps, RPE, date) across completed sessions. Essential for diagnosing imbalances, plateaus, or undertraining of specific lifts.',
      inputSchema: {
        exerciseId: z.string().describe('Exercise UUID — look up with golem_list_exercises'),
        startDate: z.string().optional().describe('YYYY-MM-DD inclusive'),
        endDate: z.string().optional().describe('YYYY-MM-DD inclusive'),
      },
    },
    async ({ exerciseId, startDate, endDate }) =>
      json(await getExerciseHistory(userId, exerciseId, { startDate, endDate })),
  );

  server.registerTool(
    'golem_get_weekly_volume_by_muscle',
    {
      description:
        'Per-muscle-group working set volume for a specific training week. Find the week id from golem_get_current_program (program.blocks[].weeks[].id). Compares to MEV/MRV landmarks.',
      inputSchema: {
        weekId: z.string().describe('Week UUID from golem_get_current_program'),
      },
    },
    async ({ weekId }) => json(await getWeeklyVolumeByMuscleGroup(userId, weekId)),
  );

  server.registerTool(
    'golem_get_volume_landmarks',
    {
      description:
        'MEV/MRV volume landmarks per muscle group, computed from the user\'s recent training history. Use as the reference point when judging whether a muscle group is under- or over-trained.',
      inputSchema: {},
    },
    async () => json(await getCalculatedVolumeLandmarks(userId)),
  );

  server.registerTool(
    'golem_get_day_archetypes',
    {
      description:
        "The user's day archetypes with their ordered slots. A day archetype is the engine's blueprint for a training day — an ordered list of slots (role + target muscle + rep/RPE/set prescription + progression model) that the deterministic engine fills with concrete exercises. program_id is null for library archetypes (shared across programs). Read this to see current slot structure before proposing archetype_slot_changes (e.g. adding a 'core' slot). Correlate with golem_get_current_program's per-session day_archetype_id to know which archetypes a program uses.",
      inputSchema: {},
    },
    async () => {
      const list = await getDayArchetypes(userId).catch(() => []);
      const withSlots = await Promise.all(list.map((a) => getDayArchetypeWithSlots(userId, a.id)));
      return json(withSlots);
    },
  );

  // -----------------------------
  // Day archetype + slot CRUD (direct, in-place edits — NOT clone-on-write). Use these to build/manage
  // archetypes (incl. library archetypes with no program). For program-scoped "more core"-style feedback
  // that should fork a shared archetype, use golem_apply_plan_change's archetype_slot_changes instead.
  // -----------------------------

  server.registerTool(
    'golem_create_day_archetype',
    {
      description:
        "Create a new day archetype (a training-day blueprint the engine generates against). Returns the new archetype id; add slots with golem_create_day_slot. program_id is optional — omit/null for a library archetype shared across programs.",
      inputSchema: {
        name: z.string().min(1).describe('Display name, e.g. "Leg Day", "Upper Push".'),
        description: z.string().nullable().default(null).describe('Optional notes about the day.'),
        program_id: z.string().nullable().default(null).describe('Scope to a program (null = shared library archetype).'),
      },
    },
    async ({ name, description, program_id }) => {
      const id = await createDayArchetype(userId, { name: name.trim(), description, program_id });
      return json({ success: true, id });
    },
  );

  server.registerTool(
    'golem_update_day_archetype',
    {
      description: "Rename a day archetype or change its description. Find ids with golem_get_day_archetypes.",
      inputSchema: {
        dayArchetypeId: z.string().describe('Day archetype UUID'),
        name: z.string().min(1).describe('New name'),
        description: z.string().nullable().default(null).describe('New description (null to clear).'),
      },
    },
    async ({ dayArchetypeId, name, description }) => {
      await updateDayArchetype(userId, dayArchetypeId, { name: name.trim(), description });
      return json({ success: true, dayArchetypeId });
    },
  );

  server.registerTool(
    'golem_delete_day_archetype',
    {
      description:
        "Delete a day archetype and all its slots. Any sessions linked to it have their day_archetype_id cleared (their logged data is untouched). Find ids with golem_get_day_archetypes.",
      inputSchema: { dayArchetypeId: z.string().describe('Day archetype UUID') },
    },
    async ({ dayArchetypeId }) => {
      await deleteDayArchetype(userId, dayArchetypeId);
      return json({ success: true, dayArchetypeId });
    },
  );

  server.registerTool(
    'golem_create_day_slot',
    {
      description:
        "Add a slot to a day archetype (one exercise the engine fills). Edits the archetype in place. Returns the new slot id. See DaySlotInput fields for role/progression/rep prescription.",
      inputSchema: {
        dayArchetypeId: z.string().describe('Day archetype UUID to add the slot to'),
        slot: DaySlotInputSchema.describe('Full slot definition.'),
      },
    },
    async ({ dayArchetypeId, slot }) => {
      const id = await createDaySlot(userId, dayArchetypeId, slot);
      return json({ success: true, id });
    },
  );

  server.registerTool(
    'golem_update_day_slot',
    {
      description: "Update an existing day slot in place (full replacement of its fields). Find slot ids in golem_get_day_archetypes.",
      inputSchema: {
        slotId: z.string().describe('Day slot UUID'),
        slot: DaySlotInputSchema.describe('Full slot definition (all fields replaced).'),
      },
    },
    async ({ slotId, slot }) => {
      await updateDaySlot(userId, slotId, slot);
      return json({ success: true, slotId });
    },
  );

  server.registerTool(
    'golem_delete_day_slot',
    {
      description: "Delete a day slot. Find slot ids in golem_get_day_archetypes.",
      inputSchema: { slotId: z.string().describe('Day slot UUID') },
    },
    async ({ slotId }) => {
      await deleteDaySlot(userId, slotId);
      return json({ success: true, slotId });
    },
  );

  // -----------------------------
  // Workout session CRUD (create standalone sessions + delete). Read = golem_get_session /
  // golem_list_sessions / golem_get_current_session. Update (name/description/day_archetype_id) =
  // golem_apply_plan_change session_updates.
  // -----------------------------

  server.registerTool(
    'golem_create_session',
    {
      description:
        "Create a new workout session. Pass weekId to add it INSIDE a program (attached to that program week — find the id in golem_get_program / golem_get_current_program at program.blocks[].weeks[].id); omit weekId for a STANDALONE one-off session. Optionally assign a day archetype so the engine can generate exercises into it. Returns the new session id. Edit afterward with golem_apply_plan_change (name/description/day_archetype_id); remove with golem_delete_session.",
      inputSchema: {
        name: z.string().min(1).describe('Session name, e.g. "Lower (low-axial)", "Conditioning".'),
        description: z.string().nullable().default(null).describe('Optional notes.'),
        weekId: z
          .string()
          .nullable()
          .default(null)
          .describe('Program week UUID (program.blocks[].weeks[].id) to attach the session to. Omit/null for a standalone session.'),
        dayArchetypeId: z
          .string()
          .nullable()
          .default(null)
          .describe('Optional day archetype UUID (from golem_get_day_archetypes) to generate this session from.'),
        orderIndex: z
          .number()
          .int()
          .min(0)
          .nullable()
          .default(null)
          .describe('Only used with weekId: 0-based position within the week. Omit to append at the end; an explicit value shifts later sessions down.'),
      },
    },
    async ({ name, description, weekId, dayArchetypeId, orderIndex }) => {
      if (weekId) {
        const id = await createProgramSession(userId, weekId, {
          name: name.trim(),
          description,
          dayArchetypeId: dayArchetypeId ?? null,
          orderIndex: orderIndex ?? null,
        });
        return json({ success: true, id, weekId });
      }
      const id = await createWorkoutSession(userId, name.trim(), description, dayArchetypeId ?? null);
      return json({ success: true, id });
    },
  );

  // -----------------------------
  // GENERATE A SESSION'S EXERCISES (deterministic engine — no LLM)
  // Wraps the same engine path as the in-app /sessions/[id]/generate-engine route: the selection scorer
  // + loading engine fill the session's assigned day archetype with concrete exercises/sets, REPLACING
  // any existing targets. Synchronous (runs in well under a second). Requires the session to have a day
  // archetype assigned (golem_create_session dayArchetypeId, or golem_apply_plan_change day_archetype_id).
  // -----------------------------

  server.registerTool(
    'golem_generate_session_with_engine',
    {
      description:
        "Generate a workout session's concrete exercises and sets from its assigned day archetype using the DETERMINISTIC engine (selection scorer + loading engine — no LLM, runs instantly). REPLACES any existing targets for the session. The session must already have a day archetype assigned (set it via golem_create_session's dayArchetypeId or golem_apply_plan_change session_updates day_archetype_id). Returns the generated plan (one row per slot: role, exercise, sets, reps/weight/time, rationale, baseline flag). Use golem_get_session afterward to see the persisted segments.",
      inputSchema: { sessionId: z.string().describe('Workout session UUID to generate exercises into (from golem_list_sessions / golem_get_current_session).') },
    },
    async ({ sessionId }) => {
      // Verify the session exists / belongs to the user (throws → surfaced as an error).
      await getWorkoutSessionById(userId, sessionId);

      // Run the deterministic engine.
      const { segments, plan } = await generateSessionTargetsWithEngine(userId, sessionId);
      if (segments.length === 0) {
        return json({ success: false, error: 'Engine produced no targets — check the day archetype slots assigned to this session.' });
      }

      // Replace existing targets with the freshly generated ones.
      await deleteAllTargetsForSession(userId, sessionId);
      await createGeneratedTargets(userId, sessionId, segments);
      await logGeneration(userId, '/api/mcp/golem_generate_session_with_engine');

      return json({
        success: true,
        sessionId,
        generated: plan.map((s) => ({
          role: s.slotRole,
          exercise: s.exerciseName,
          sets: s.working.length,
          reps: s.working[0]?.reps ?? null,
          weight: s.working[0]?.weight ?? null,
          timeSeconds: s.working[0]?.timeSeconds ?? null,
          rationale: s.rationale,
          baseline: s.isBaseline,
        })),
      });
    },
  );

  server.registerTool(
    'golem_delete_session',
    {
      description:
        "Permanently delete a workout session and ALL its segments and logged sets. This is destructive and includes completed sessions (logged history is lost) — confirm intent before calling. For program sessions the current pointer advances to the next incomplete session. Find ids with golem_list_sessions.",
      inputSchema: { sessionId: z.string().describe('Workout session UUID') },
    },
    async ({ sessionId }) => {
      await deleteWorkoutSession(userId, sessionId);
      return json({ success: true, sessionId });
    },
  );

  server.registerTool(
    'golem_reset_session',
    {
      description:
        "Reset a workout session so it can be redone: deletes ALL its logged segments and sets and clears its timing/completion/review/analysis (the session row itself, its name, and its day-archetype assignment are kept). For a program session the program's current pointer is recalculated. Use to wipe a session's logged data; regenerate its plan afterward with golem_generate_session_with_engine. Find ids with golem_list_sessions. This is destructive — confirm intent before calling.",
      inputSchema: { sessionId: z.string().describe('Workout session UUID') },
    },
    async ({ sessionId }) => {
      await resetWorkoutSession(userId, sessionId);
      return json({ success: true, sessionId });
    },
  );

  // -----------------------------
  // Program lifecycle (create / delete / archive / activate / rename). Read = golem_list_programs /
  // golem_get_program. Name+description edits also available via golem_apply_plan_change. golem_create_program
  // scaffolds an empty program shell directly (an alternative to the in-app LLM generation flow).
  // -----------------------------

  server.registerTool(
    'golem_create_program',
    {
      description:
        "Create a new, empty training program shell and make it the current active program. Scaffolds a single block containing `weeks` empty weeks (no sessions). Add sessions afterward with golem_create_session (pass the week ids from golem_get_program), assign day archetypes, etc. This is the direct-CRUD alternative to the in-app LLM generation flow. Optionally link a program template id (from golem_list_program_templates) for provenance.",
      inputSchema: {
        name: z.string().min(1).describe('Program name, e.g. "Hypertrophy Block 1".'),
        description: z.string().nullable().default(null).describe('Optional program description.'),
        weeks: z.number().int().min(1).max(52).default(4).describe('Number of empty weeks to scaffold inside the program (default 4).'),
        templateId: z.string().nullable().default(null).describe('Optional program template UUID to associate (provenance only; does not generate content).'),
      },
    },
    async ({ name, description, weeks, templateId }) => {
      const payload: CreateProgramPayload = {
        name: name.trim(),
        description,
        blocks: [
          {
            name: 'Block 1',
            order_index: 0,
            description: null,
            tag: null,
            color: null,
            weeks: Array.from({ length: weeks }, (_, i) => ({
              week_number: i + 1,
              name: null,
              description: null,
              sessions: [],
            })),
          },
        ],
      };
      const programId = await createProgram(userId, payload, templateId);
      return json({ success: true, programId });
    },
  );

  // -----------------------------
  // CREATE A FULL PROGRAM FROM DAY ARCHETYPES (deterministic — no LLM)
  // The structural counterpart to golem_generate_session_with_engine: build a complete multi-block program
  // (blocks → weeks → archetype-assigned sessions) in ONE call, vs. golem_create_program (single block of
  // EMPTY weeks) + N golem_create_session calls. Sessions carry their day archetype but no exercises — run
  // golem_generate_session_with_engine on each to fill them. Same builder as the in-app manual wizard.
  // -----------------------------

  server.registerTool(
    'golem_create_program_from_archetypes',
    {
      description:
        "Deterministically build a COMPLETE multi-block program from your day archetypes — no LLM. Each block has a week count and a day→archetype assignment that repeats every week in the block; sessions are created carrying their archetype but NO exercises (run golem_generate_session_with_engine per session to fill them, or start the workout in-app). Prefer this over golem_create_program (which only scaffolds one block of empty weeks) when you know the structure. Get archetype ids from golem_get_day_archetypes. Returns the new program id.",
      inputSchema: {
        name: z.string().min(1).describe('Program name, e.g. "Hypertrophy Block 1".'),
        description: z.string().nullable().default(null).describe('Optional program description.'),
        blocks: z
          .array(
            z.object({
              name: z.string().min(1).describe('Block name, e.g. "Hypertrophy".'),
              weeks: z.number().int().min(1).max(52).describe('Number of weeks in this block; each repeats the day assignment below.'),
              days: z
                .array(z.string())
                .min(1)
                .max(7)
                .describe('Ordered day archetype UUIDs — one per training day (day 1, day 2, …). All blocks should have the same length.'),
            }),
          )
          .min(1)
          .describe('Ordered list of training blocks.'),
        activate: z.boolean().default(true).describe('Make this the current active program after creating it (default true).'),
      },
    },
    async ({ name, description, blocks, activate }) => {
      // Resolve + validate every referenced archetype against the user's library (also gives session names).
      const archetypes = await getDayArchetypes(userId);
      const archetypeNameById = new Map(archetypes.map((a) => [a.id, a.name]));

      const skeletonBlocks: ArchetypeSkeletonBlock[] = blocks.map((block, blockIndex) => ({
        name: block.name.trim(),
        order_index: blockIndex + 1,
        tag: null,
        color: null,
        weekCount: block.weeks,
        days: block.days.map((archetypeId, dayIndex) => {
          const archetypeName = archetypeNameById.get(archetypeId);
          if (!archetypeName) throw new Error(`No day archetype found for id: '${archetypeId}'`);
          return { dayIndex: dayIndex + 1, archetypeId, archetypeName };
        }),
      }));

      const programId = await createProgramFromSkeleton(userId, { name: name.trim(), description, blocks: skeletonBlocks });
      if (activate) await activateProgram(userId, programId);

      return json({ success: true, programId, activated: activate });
    },
  );

  // -----------------------------
  // EXTEND A PROGRAM — append a week by cloning a week's structure (deterministic — no LLM)
  // LLM-free counterpart to the in-app template "generate next week". Copies a source week's session
  // names + day-archetype assignments into a new week at the end of that week's block (no exercises).
  // -----------------------------

  server.registerTool(
    'golem_add_program_week',
    {
      description:
        "Append a new week to a program by cloning an existing week's structure — its session names + day-archetype assignments, with NO exercises (deterministic, no LLM). The new week is added at the end of the source week's block. Run golem_generate_session_with_engine on the returned sessions to fill them. Find week ids in golem_get_program / golem_get_current_program (program.blocks[].weeks[].id). Returns the new week id and its sessions.",
      inputSchema: {
        sourceWeekId: z.string().describe('UUID of the week to clone the session structure from (program.blocks[].weeks[].id).'),
      },
    },
    async ({ sourceWeekId }) => {
      const result = await appendWeekFromSource(userId, sourceWeekId);
      return json({ success: true, weekId: result.weekId, sessions: result.sessions });
    },
  );

  server.registerTool(
    'golem_update_program',
    {
      description: "Rename a program or change its description. Find ids with golem_list_programs.",
      inputSchema: {
        programId: z.string().describe('Program UUID'),
        name: z.string().min(1).describe('New name'),
        description: z.string().nullable().default(null).describe('New description (null to clear).'),
      },
    },
    async ({ programId, name, description }) => {
      await updateProgram(userId, programId, name.trim(), description);
      return json({ success: true, programId });
    },
  );

  server.registerTool(
    'golem_archive_program',
    {
      description: "Archive or unarchive a program (hides it from the default program list without deleting it).",
      inputSchema: {
        programId: z.string().describe('Program UUID'),
        isArchived: z.boolean().describe('true = archive, false = unarchive'),
      },
    },
    async ({ programId, isArchived }) => {
      await archiveProgram(userId, programId, isArchived);
      return json({ success: true, programId, isArchived });
    },
  );

  server.registerTool(
    'golem_activate_program',
    {
      description: "Make a program the user's current active program (clears the current flag on any other program).",
      inputSchema: { programId: z.string().describe('Program UUID') },
    },
    async ({ programId }) => {
      await activateProgram(userId, programId);
      return json({ success: true, programId });
    },
  );

  server.registerTool(
    'golem_delete_program',
    {
      description:
        "Permanently delete a program and its entire structure (blocks, weeks, sessions, segments, sets) plus any program-specific cloned day archetypes. Blocked if any session in the program has been completed (to protect logged history). Find ids with golem_list_programs.",
      inputSchema: { programId: z.string().describe('Program UUID') },
    },
    async ({ programId }) => {
      await deleteProgram(userId, programId);
      return json({ success: true, programId });
    },
  );

  // -----------------------------
  // Program template CRUD. Templates hold the per-stage LLM prompts (program/week/session/analysis)
  // and days_per_week that drive program generation.
  // -----------------------------

  server.registerTool(
    'golem_list_program_templates',
    {
      description: "The user's program templates (the prompt blueprints that drive LLM program generation).",
      inputSchema: {},
    },
    async () => json(await getAllProgramTemplates(userId).catch(() => [])),
  );

  server.registerTool(
    'golem_get_program_template',
    {
      description: "Full detail for one program template, including all four stage prompts.",
      inputSchema: { templateId: z.string().describe('Program template UUID') },
    },
    async ({ templateId }) => json(await getProgramTemplateById(userId, templateId)),
  );

  server.registerTool(
    'golem_create_program_template',
    {
      description:
        "Create a program template. The four prompts are the LLM instructions for each generation stage; pass null for any you want to leave default. Returns the created template.",
      inputSchema: {
        name: z.string().min(1).describe('Template name'),
        description: z.string().nullable().default(null),
        daysPerWeek: z.number().int().min(1).max(7).describe('Training days per week this template generates.'),
        programPrompt: z.string().nullable().default(null).describe('Program-level generation prompt.'),
        weekPrompt: z.string().nullable().default(null).describe('Per-week generation prompt.'),
        sessionPrompt: z.string().nullable().default(null).describe('Per-session target-generation prompt.'),
        analysisPrompt: z.string().nullable().default(null).describe('Post-session analysis prompt.'),
      },
    },
    async ({ name, description, daysPerWeek, programPrompt, weekPrompt, sessionPrompt, analysisPrompt }) =>
      json(await createProgramTemplate(userId, name.trim(), description, programPrompt, weekPrompt, sessionPrompt, analysisPrompt, daysPerWeek)),
  );

  server.registerTool(
    'golem_update_program_template',
    {
      description: "Update a program template (full replacement of name, description, the four prompts, and days_per_week). Read the current values with golem_get_program_template first.",
      inputSchema: {
        templateId: z.string().describe('Program template UUID'),
        name: z.string().min(1),
        description: z.string().nullable().default(null),
        daysPerWeek: z.number().int().min(1).max(7),
        programPrompt: z.string().nullable().default(null),
        weekPrompt: z.string().nullable().default(null),
        sessionPrompt: z.string().nullable().default(null),
        analysisPrompt: z.string().nullable().default(null),
      },
    },
    async ({ templateId, name, description, daysPerWeek, programPrompt, weekPrompt, sessionPrompt, analysisPrompt }) =>
      json(await updateProgramTemplate(userId, templateId, name.trim(), description, programPrompt, weekPrompt, sessionPrompt, analysisPrompt, daysPerWeek)),
  );

  server.registerTool(
    'golem_delete_program_template',
    {
      description: "Delete a program template. Programs already generated from it are unaffected.",
      inputSchema: { templateId: z.string().describe('Program template UUID') },
    },
    async ({ templateId }) => {
      await deleteProgramTemplate(userId, templateId);
      return json({ success: true, templateId });
    },
  );

  // -----------------------------
  // Write tool — apply a plan change directly (records an audit trail)
  // -----------------------------

  server.registerTool(
    'golem_apply_plan_change',
    {
      description:
        "Apply a change to the user's training plan. Editable: program/session name+description, AND structural day-archetype slot edits (archetype_slot_changes — e.g. adding a 'core' slot). The change is applied immediately and recorded with an 'applied' marker for a persistent audit trail. Read enough context (profile, current program incl. per-session day_archetype_id, golem_get_day_archetypes, weekly volume) to justify it first; slot changes alter what the engine generates, so be sure the edit matches the user's intent before calling.",
      inputSchema: {
        originalQuestion: z
          .string()
          .min(1)
          .describe("The user's request that motivated this change (for the audit trail)."),
        summary: z
          .string()
          .min(1)
          .describe('Plain-English summary of WHAT changed and WHY. Shown verbatim in the feedback chat.'),
        program_updates: z
          .array(ProgramFieldUpdate)
          .default([])
          .describe('Field-level edits to program rows (name or description only).'),
        session_updates: z
          .array(SessionFieldUpdate)
          .default([])
          .describe('Field-level edits to upcoming workout_session rows: name, description, or day_archetype_id (assign/clear the archetype the session generates from). Completed sessions are skipped.'),
        archetype_slot_changes: z
          .array(ArchetypeSlotChange)
          .default([])
          .describe('Structural slot edits to a program\'s day archetypes (add/update/remove slots). Shared archetypes are cloned for the program (clone-on-write).'),
        conversationId: z
          .string()
          .optional()
          .describe('Optional existing feedback conversation_id to append to. Omit to start a new conversation.'),
      },
    },
    async ({ originalQuestion, summary, program_updates, session_updates, archetype_slot_changes, conversationId }) => {
      if (program_updates.length === 0 && session_updates.length === 0 && archetype_slot_changes.length === 0) {
        return text('Refusing to apply empty change — include at least one program_updates, session_updates, or archetype_slot_changes entry.');
      }
      const result = await applyExternalChange(userId, {
        originalQuestion,
        summary,
        proposal: { summary, program_updates, session_updates, archetype_slot_changes },
        conversationId: conversationId ?? null,
      });
      return json({
        ...result,
        note: `Applied directly: ${result.applied.programs} program(s), ${result.applied.sessions} session(s), ${result.applied.slots_changed} slot(s) changed${result.applied.archetypes_cloned ? `, ${result.applied.archetypes_cloned} archetype(s) cloned` : ''}.`,
      });
    },
  );

  server.registerTool(
    'golem_list_locations',
    {
      description:
        "The user's training locations (gyms/setups). Each has its own enabled-exercise list and a bodyweight-only flag. is_active marks the one currently used for generation; is_default is the permanent fallback. Use these ids with the other location/exercise write tools.",
      inputSchema: {},
    },
    async () => json(await listLocations(userId)),
  );

  server.registerTool(
    'golem_create_location',
    {
      description:
        "Create a new training location. The user's first location becomes active + default automatically. Returns the created location (including its id).",
      inputSchema: {
        name: z.string().min(1).describe('Display name, e.g. "Home gym", "Hotel", "Travel".'),
      },
    },
    async ({ name }) => json(await createLocation(userId, name.trim())),
  );

  server.registerTool(
    'golem_activate_location',
    {
      description:
        'Make a location the active WORKING location. Session generation and the enabled-exercise list use it for working (non-warmup) exercises. Find ids with golem_list_locations.',
      inputSchema: {
        locationId: z.string().describe('Location UUID to activate'),
      },
    },
    async ({ locationId }) => {
      await setActiveLocation(userId, locationId);
      return json({ success: true, activatedLocationId: locationId });
    },
  );

  server.registerTool(
    'golem_set_warmup_location',
    {
      description:
        "Set or clear the active WARMUP location, so warmups can be sourced from a different place than working sets (e.g. warm up at home, train at the gym). Generation uses this location's equipment + enabled-exercise list for warmup exercises only. Pass locationId: null to clear, which makes warmups use the working/active location again.",
      inputSchema: {
        locationId: z
          .string()
          .nullable()
          .describe('Location UUID for warmups, or null to clear (warmups then use the working location).'),
      },
    },
    async ({ locationId }) => {
      await setActiveWarmupLocation(userId, locationId ?? null);
      return json({ success: true, warmupLocationId: locationId ?? null });
    },
  );

  server.registerTool(
    'golem_set_location_bodyweight_only',
    {
      description:
        'Toggle bodyweight-only mode for a location. When on, session generation prescribes only bodyweight movements and the location\'s selected equipment is ignored.',
      inputSchema: {
        locationId: z.string().describe('Location UUID — find with golem_list_locations'),
        bodyweightOnly: z.boolean().describe('true = bodyweight only, false = use selected equipment'),
      },
    },
    async ({ locationId, bodyweightOnly }) => {
      await setBodyweightOnly(userId, locationId, bodyweightOnly);
      return json({ success: true, locationId, bodyweightOnly });
    },
  );

  server.registerTool(
    'golem_rename_location',
    {
      description: "Rename a training location. Find ids with golem_list_locations.",
      inputSchema: {
        locationId: z.string().describe('Location UUID'),
        name: z.string().min(1).describe('New display name'),
      },
    },
    async ({ locationId, name }) => {
      await renameLocation(userId, locationId, name.trim());
      return json({ success: true, locationId });
    },
  );

  server.registerTool(
    'golem_delete_location',
    {
      description:
        "Delete a training location and its equipment/enabled-exercise associations. The default location cannot be deleted; deleting the active location falls generation back to the default. Find ids with golem_list_locations.",
      inputSchema: { locationId: z.string().describe('Location UUID') },
    },
    async ({ locationId }) => {
      await deleteLocation(userId, locationId);
      return json({ success: true, locationId });
    },
  );

  // -----------------------------
  // Equipment taxonomy — CRU, NO delete. Equipment is global (not user-scoped) library metadata:
  // exercises require it (golem_update_exercise equipment) and locations stock it. Items are never
  // hard-deleted through the MCP; there is deliberately no golem_delete_equipment tool.
  // -----------------------------

  server.registerTool(
    'golem_list_equipment',
    {
      description:
        'The global equipment taxonomy (id, name, category, has_options, sort_order, has_image) plus every equipment option (loadable increments). Read this to find equipment ids for golem_update_exercise (equipment) or to see what already exists before creating a new item.',
      inputSchema: {},
    },
    async () => {
      const [equipment, options] = await Promise.all([listEquipment(), listEquipmentOptions()]);
      return json({ equipment, options });
    },
  );

  server.registerTool(
    'golem_create_equipment',
    {
      description:
        "Create a new equipment item in the global taxonomy. category is one of the fixed equipment categories. hasOptions marks equipment with discrete loadable increments (e.g. a dumbbell rack). sortOrder controls list ordering. Photos are uploaded separately (not via MCP). Returns the created equipment (with id).",
      inputSchema: {
        name: z.string().min(1).describe('Display name, e.g. "Adjustable dumbbells".'),
        category: z
          .enum([
            'small_weights',
            'bars_and_plates',
            'benches_and_racks',
            'cable_machines',
            'strength_machines',
            'resistance_bands',
            'cardio_machines',
            'bodyweight',
            'other',
          ])
          .describe('Equipment category.'),
        hasOptions: z.boolean().default(false).describe('true if this equipment has discrete loadable options/increments.'),
        sortOrder: z.number().int().default(0).describe('List sort order (lower sorts first).'),
      },
    },
    async ({ name, category, hasOptions, sortOrder }) =>
      json(await createEquipment(name.trim(), category, hasOptions, sortOrder)),
  );

  server.registerTool(
    'golem_update_equipment',
    {
      description:
        'Update an equipment item\'s name, category, has_options flag, or sort order. Find ids with golem_list_equipment. There is no delete counterpart.',
      inputSchema: {
        equipmentId: z.string().describe('Equipment UUID — find with golem_list_equipment'),
        name: z.string().min(1).describe('Display name'),
        category: z
          .enum([
            'small_weights',
            'bars_and_plates',
            'benches_and_racks',
            'cable_machines',
            'strength_machines',
            'resistance_bands',
            'cardio_machines',
            'bodyweight',
            'other',
          ])
          .describe('Equipment category.'),
        hasOptions: z.boolean().describe('true if this equipment has discrete loadable options/increments.'),
        sortOrder: z.number().int().describe('List sort order (lower sorts first).'),
      },
    },
    async ({ equipmentId, name, category, hasOptions, sortOrder }) =>
      json(await updateEquipment(equipmentId, name.trim(), category, hasOptions, sortOrder)),
  );

  // -----------------------------
  // Exercise CRUD. Read = golem_list_exercises / golem_get_exercise_history. There is no hard delete —
  // "removing" an exercise from generation is done per-location via golem_set_exercise_enabled (enabled:false).
  // -----------------------------

  server.registerTool(
    'golem_create_exercise',
    {
      description:
        "Create a custom exercise in the user's library, setting ALL of its metadata in one call. category: Strength | Cardio | Mobility. isTimed marks duration-based movements (holds, cardio). distanceType: 'short' (feet/yards/meters) | 'long' (km/mi) | null (no distance tracking). muscleGroups sets the primary/secondary movers; equipment sets the required equipment ids. Returns the created exercise with its muscleGroups + equipment. Per-location enabled-state is set separately via golem_set_exercise_enabled.",
      inputSchema: {
        name: z.string().min(1).describe('Exercise name'),
        description: z.string().nullable().default(null),
        category: z.enum(['Strength', 'Cardio', 'Mobility']).default('Strength'),
        isTimed: z.boolean().default(false).describe('true = duration-based (time, not reps).'),
        distanceType: z
          .enum(['short', 'long'])
          .nullable()
          .default(null)
          .describe("Distance modality: 'short' = feet/yards/meters, 'long' = km/mi, null = no distance tracking."),
        muscleGroups: z
          .array(MuscleGroupAssignment)
          .optional()
          .describe('Primary/secondary muscle mappings. Omit to create with no muscle mappings.'),
        equipment: z
          .array(z.string())
          .optional()
          .describe('Equipment UUIDs this exercise requires (from golem_list_equipment). Omit for none.'),
      },
    },
    async ({ name, description, category, isTimed, distanceType, muscleGroups, equipment }) => {
      const created = await createExercise(userId, name.trim(), description, category, isTimed, normalizeDistanceType(distanceType));
      if (muscleGroups !== undefined) {
        await updateExerciseMuscleGroups(created.id, muscleGroups);
      }
      if (equipment !== undefined) {
        await setExerciseEquipment(created.id, equipment);
      }
      return json(await exerciseDetail(userId, created.id));
    },
  );

  server.registerTool(
    'golem_update_exercise',
    {
      description:
        "Update an exercise's full metadata — name, description, category, timed flag, distance modality, muscle mappings, and required equipment. name/description/category/isTimed/distanceType are always written. muscleGroups and equipment are each OPTIONAL: pass an array to REPLACE that whole set, or omit to leave it unchanged (pass [] to clear it). Works on system exercises too. Find ids with golem_list_exercises; muscle ids with golem_list_muscle_groups; equipment ids with golem_list_equipment.",
      inputSchema: {
        exerciseId: z.string().describe('Exercise UUID'),
        name: z.string().min(1),
        description: z.string().nullable().default(null),
        category: z.enum(['Strength', 'Cardio', 'Mobility']),
        isTimed: z.boolean().default(false),
        distanceType: z
          .enum(['short', 'long'])
          .nullable()
          .default(null)
          .describe("Distance modality: 'short' = feet/yards/meters, 'long' = km/mi, null = no distance tracking."),
        muscleGroups: z
          .array(MuscleGroupAssignment)
          .optional()
          .describe('Replaces the exercise\'s whole muscle-mapping set. Omit to leave unchanged; [] to clear.'),
        equipment: z
          .array(z.string())
          .optional()
          .describe('Replaces the exercise\'s whole equipment set (UUIDs from golem_list_equipment). Omit to leave unchanged; [] to clear.'),
      },
    },
    async ({ exerciseId, name, description, category, isTimed, distanceType, muscleGroups, equipment }) => {
      await updateExercise(userId, exerciseId, name.trim(), description, category, isTimed, normalizeDistanceType(distanceType));
      if (muscleGroups !== undefined) {
        await updateExerciseMuscleGroups(exerciseId, muscleGroups);
      }
      if (equipment !== undefined) {
        await setExerciseEquipment(exerciseId, equipment);
      }
      return json(await exerciseDetail(userId, exerciseId));
    },
  );

  server.registerTool(
    'golem_set_exercise_enabled',
    {
      description:
        "Enable or disable an exercise AT A LOCATION. Enabled state is per-location — disabling an exercise here only affects that location's generated sessions. Omit locationId to target the active location (falling back to the default). Find exercise ids with golem_list_exercises and location ids with golem_list_locations.",
      inputSchema: {
        exerciseId: z.string().describe('Exercise UUID — look up with golem_list_exercises'),
        enabled: z.boolean().describe('true = enable at this location, false = disable'),
        locationId: z
          .string()
          .optional()
          .describe('Location UUID. Omit to use the active/default location.'),
      },
    },
    async ({ exerciseId, enabled, locationId }) => {
      const resolvedLocationId = await resolveLocationId(userId, locationId ?? null);
      if (enabled) {
        await enableExercise(userId, exerciseId, resolvedLocationId);
      } else {
        await disableExercise(userId, exerciseId, resolvedLocationId);
      }
      return json({ success: true, exerciseId, enabled, locationId: resolvedLocationId });
    },
  );

  server.registerTool(
    'golem_hold_exercise',
    {
      description:
        "Place or lift a PER-USER hold on an exercise — a temporary (or permanent) contraindication that removes it from generated sessions at EVERY location (unlike golem_set_exercise_enabled, which is per-location equipment gating). Use for injuries/rehab, e.g. hold power cleans during a disc flare. Set clear:true to lift the hold. Otherwise the hold is set: pass `until` (ISO date, e.g. '2026-09-01') OR `durationDays` for a temporary hold that auto-expires, or neither for a permanent hold. Optional `reason` is stored as a note. List active holds with golem_list_exercise_holds.",
      inputSchema: {
        exerciseId: z.string().describe('Exercise UUID — look up with golem_list_exercises'),
        clear: z.boolean().optional().describe('true = lift the hold (re-enable the exercise everywhere)'),
        until: z
          .string()
          .optional()
          .describe("ISO date/instant to hold until (e.g. '2026-09-01'). Exclusive with durationDays; omit both for a permanent hold."),
        durationDays: z
          .number()
          .optional()
          .describe('Hold for this many days from now. Exclusive with until; omit both for a permanent hold.'),
        reason: z.string().optional().describe('Optional note stored with the hold (e.g. "L5-S1 deload").'),
      },
    },
    async ({ exerciseId, clear, until, durationDays, reason }) => {
      if (clear) {
        await clearExerciseHold(userId, exerciseId);
        return json({ success: true, exerciseId, held: false });
      }
      let disabledUntil: Date | null = null;
      if (until !== undefined) {
        const parsed = new Date(until);
        if (Number.isNaN(parsed.getTime())) {
          throw new Error(`Invalid 'until' date: '${until}'`);
        }
        disabledUntil = parsed;
      } else if (durationDays !== undefined) {
        disabledUntil = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
      }
      await setExerciseHold(userId, exerciseId, disabledUntil, reason ?? null);
      return json({ success: true, exerciseId, held: true, disabledUntil: disabledUntil?.toISOString() ?? null });
    },
  );

  server.registerTool(
    'golem_list_exercise_holds',
    {
      description:
        "List this user's exercise holds (per-user contraindications that exclude an exercise from generation at all locations). Each row: exercise, disabled_until (null = permanent), reason, and is_active (false = already expired). By default only currently-active holds are returned; pass includeExpired:true to see lapsed ones too.",
      inputSchema: {
        includeExpired: z
          .boolean()
          .optional()
          .describe('Include holds whose disabled_until has already passed. Default false.'),
      },
    },
    async ({ includeExpired }) => {
      return json(await getExerciseHolds(userId, !includeExpired));
    },
  );
}
