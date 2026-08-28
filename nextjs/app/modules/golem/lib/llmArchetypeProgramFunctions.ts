// Archetype-based program generation. Unlike the template flow (which has the LLM author every exercise),
// here the LLM only designs the program *structure* and attaches a day archetype to each training day.
// Exercises are produced lazily, per session, by the deterministic engine (generate-engine route).
//
// One LLM call returns: program name/length (via block week_counts), blocks (length + purpose), and a
// per-block day→archetype assignment (reusing existing archetypes or declaring new ones with slots).
// Days-per-week is deterministic input — every week in a block repeats that block's day assignment.
import { unlinkSync } from 'fs';
import { callLLM, readLLMOutput, parseLLMResponse } from './llmFunctions';
import { loadPromptFile } from './promptLoader';
import { getProfileContext, getUserProfile } from './userProfileFunctions';
import { getAllMuscleGroups } from './muscleGroupFunctions';
import { getDayArchetypes, createDayArchetype, createDaySlot } from './dayArchetypeFunctions';
import { createProgramFromSkeleton } from './archetypeProgramSkeleton';
import type { ArchetypeSkeletonBlock } from './archetypeProgramSkeleton';
import type { DaySlotInput } from '../types/dayArchetype';

// Allowed enum values (mirror DaySlotModal.tsx / engine expectations).
const ROLES = ['primary', 'secondary', 'isolation', 'unilateral', 'core', 'carry', 'conditioning'];
const MODELS = ['double_progression', 'linear', 'rpe_pct1rm', 'time_effort'];
const CADENCES = ['per_session', 'per_block', 'never'];
const CATEGORIES = ['Strength', 'Cardio', 'Mobility'];

export interface ArchetypeProgramPrompts {
  programPrompt: string;
  blockPrompt: string;
  weekPrompt: string;
}

// ---- LLM output shape (loose; validated/coerced below) -------------------------------------------

interface LlmArchetypeSlot {
  role?: string;
  target_muscle?: string;
  category?: string;
  progression_model?: string;
  rep_low?: number; rep_high?: number;
  time_low_seconds?: number; time_high_seconds?: number;
  target_rpe?: number | null;
  set_target?: number;
  rotation_cadence?: string;
  is_optional?: boolean;
  is_warmup?: boolean;
}
interface LlmNewArchetype { key?: string; name?: string; slots?: LlmArchetypeSlot[]; }
interface LlmDayAssignment { day_index?: number; archetype_key?: string; archetype_existing_id?: string; }
interface LlmBlockPlan { order_index?: number; name?: string; tag?: string; color?: string | null; week_count?: number; days?: LlmDayAssignment[]; }
interface LlmArchetypeProgramOutput {
  program?: { name?: string; description?: string | null };
  new_archetypes?: LlmNewArchetype[];
  blocks?: LlmBlockPlan[];
}

// Coerce one raw LLM slot into a full DaySlotInput, recording any problems into `errors`.
// Muscle names must map (case-insensitive) to a real muscle group; the cardio-only time-range rule
// from the engine is enforced here (strength holds get no range, cardio time_effort requires one).
function buildSlotInput(
  raw: LlmArchetypeSlot,
  muscleMap: Map<string, string>,
  orderIndex: number,
  label: string,
  errors: string[],
): DaySlotInput {
  const category = CATEGORIES.includes(raw.category ?? '') ? raw.category! : 'Strength';
  const model = MODELS.includes(raw.progression_model ?? '') ? raw.progression_model! : 'double_progression';
  const isTimeEffort = model === 'time_effort';
  const isCardioTimed = isTimeEffort && category === 'Cardio';

  // TARGET MUSCLE — required, must map to a known group
  let muscleId: string | null = null;
  const rawMuscle = raw.target_muscle?.trim();
  if (!rawMuscle) {
    errors.push(`${label}: target_muscle is required`);
  } else {
    const found = muscleMap.get(rawMuscle.toLowerCase());
    if (!found) errors.push(`${label}: unknown target_muscle '${rawMuscle}'`);
    else muscleId = found;
  }

  if (isCardioTimed && (!raw.time_low_seconds || !raw.time_high_seconds)) {
    errors.push(`${label}: Cardio time_effort slot needs time_low_seconds and time_high_seconds`);
  }

  return {
    order_index: orderIndex,
    role: ROLES.includes(raw.role ?? '') ? raw.role! : 'secondary',
    target_muscle_group_id: muscleId,
    category_filter: category,
    rotation_cadence: CADENCES.includes(raw.rotation_cadence ?? '') ? raw.rotation_cadence! : 'per_session',
    pinned_exercise_id: null,                 // engine selects the exercise; archetype generation never pins
    is_optional: !!raw.is_optional,
    is_warmup: !!raw.is_warmup,
    progression_model: model,
    rep_low: Number(raw.rep_low) || 8,
    rep_high: Number(raw.rep_high) || 12,
    time_low_seconds: isCardioTimed ? (Number(raw.time_low_seconds) || null) : null,
    time_high_seconds: isCardioTimed ? (Number(raw.time_high_seconds) || null) : null,
    target_rpe: raw.target_rpe === null || raw.target_rpe === undefined ? null : Number(raw.target_rpe),
    load_step_pct: 0.05,
    round_to_step: 5,
    set_target: Number(raw.set_target) || 3,
  };
}

// Validate the whole LLM payload up front (before any DB writes) so a bad slot/reference can't leave
// partially-created archetypes behind. Returns the list of problems (empty == valid).
function validateOutput(
  out: LlmArchetypeProgramOutput,
  daysPerWeek: number,
  existingIds: Set<string>,
  muscleMap: Map<string, string>,
): string[] {
  const errors: string[] = [];

  if (!out.program?.name || typeof out.program.name !== 'string') errors.push('program.name is required');

  const keySet = new Set<string>();
  if (!Array.isArray(out.new_archetypes)) {
    out.new_archetypes = [];
  }
  for (const arch of out.new_archetypes) {
    if (!arch.key) { errors.push('new_archetypes: an archetype is missing its key'); continue; }
    if (keySet.has(arch.key)) errors.push(`new_archetypes: duplicate key '${arch.key}'`);
    keySet.add(arch.key);
    if (!arch.name) errors.push(`archetype '${arch.key}': name is required`);
    if (!Array.isArray(arch.slots) || arch.slots.length === 0) {
      errors.push(`archetype '${arch.key}': must have at least one slot`);
    } else {
      arch.slots.forEach((slot, i) => buildSlotInput(slot, muscleMap, i + 1, `archetype '${arch.key}' slot ${i + 1}`, errors));
    }
  }

  if (!Array.isArray(out.blocks) || out.blocks.length === 0) {
    errors.push('blocks: at least one block is required');
    return errors;
  }

  for (const block of out.blocks) {
    const label = `block ${block.order_index ?? '?'} (${block.name ?? 'unnamed'})`;
    if (!block.name) errors.push(`${label}: name is required`);
    if (!block.week_count || block.week_count < 1) errors.push(`${label}: week_count must be >= 1`);
    if (!Array.isArray(block.days) || block.days.length !== daysPerWeek) {
      errors.push(`${label}: must have exactly ${daysPerWeek} day assignments (got ${block.days?.length ?? 0})`);
      continue;
    }
    const seenDays = new Set<number>();
    for (const day of block.days) {
      const dayLabel = `${label} day ${day.day_index ?? '?'}`;
      if (!day.day_index || day.day_index < 1 || day.day_index > daysPerWeek) errors.push(`${dayLabel}: day_index out of range`);
      if (seenDays.has(day.day_index!)) errors.push(`${dayLabel}: duplicate day_index`);
      seenDays.add(day.day_index!);
      const hasKey = !!day.archetype_key;
      const hasExisting = !!day.archetype_existing_id;
      if (hasKey === hasExisting) {
        errors.push(`${dayLabel}: set exactly one of archetype_key or archetype_existing_id`);
      } else if (hasKey && !keySet.has(day.archetype_key!)) {
        errors.push(`${dayLabel}: archetype_key '${day.archetype_key}' is not declared in new_archetypes`);
      } else if (hasExisting && !existingIds.has(day.archetype_existing_id!)) {
        errors.push(`${dayLabel}: archetype_existing_id '${day.archetype_existing_id}' is not an existing archetype`);
      }
    }
  }

  return errors;
}

// Build the task prompt for the single archetype-program LLM call.
function buildPrompt(
  prompts: ArchetypeProgramPrompts,
  daysPerWeek: number,
  muscleNames: string[],
  existing: { id: string; name: string; description: string | null }[],
  profileContext: string | null,
): string {
  const muscleList = muscleNames.map((n) => `- ${n}`).join('\n');
  const existingList = existing.length === 0
    ? '(none)'
    : existing.map((a) => `- ${a.id} — ${a.name}${a.description ? `: ${a.description}` : ''}`).join('\n');

  return loadPromptFile('generateArchetypeProgram.md')
    .split('{{DAYS_PER_WEEK}}').join(String(daysPerWeek))
    .replace('{{MUSCLE_GROUPS}}', muscleList)
    .replace('{{EXISTING_ARCHETYPES}}', existingList)
    .replace('{{PROGRAM_PROMPT}}', prompts.programPrompt?.trim() || '(no specific guidance — use your judgment)')
    .replace('{{BLOCK_PROMPT}}', prompts.blockPrompt?.trim() || '(no specific guidance — use your judgment)')
    .replace('{{WEEK_PROMPT}}', prompts.weekPrompt?.trim() || '(no specific guidance — use your judgment)')
    .replace('{{PROFILE_CONTEXT}}', profileContext?.trim() || '');
}

// Generate an archetype-driven program from free-text prompts. Returns the created program id.
export async function generateArchetypeProgram(
  userId: string,
  prompts: ArchetypeProgramPrompts,
  daysPerWeek: number,
): Promise<string> {
  const startTime = Date.now();
  const heartbeat = setInterval(() => {
    console.log(`Archetype program generating... [${Math.round((Date.now() - startTime) / 1000)}s elapsed]`);
  }, 15000);

  try {
    // CONTEXT — profile, muscle vocabulary, and the user's existing archetype library
    const profileContext = await getProfileContext(userId);
    const muscleGroups = await getAllMuscleGroups();
    const existing = await getDayArchetypes(userId); // warns (not errors) when the library is empty
    const muscleNames = muscleGroups.map((m) => m.name);
    const muscleMap = new Map(muscleGroups.map((m) => [m.name.toLowerCase(), m.id]));
    const existingIds = new Set(existing.map((a) => a.id));

    // LLM CALL — single structured response (structure + archetype assignment)
    console.log('[GenerateArchetypeProgram] Calling LLM for program structure + archetype assignment...');
    const prompt = buildPrompt(prompts, daysPerWeek, muscleNames, existing, profileContext);
    const outputFile = await callLLM(userId, prompt);
    const rawContent = readLLMOutput(outputFile);
    try { unlinkSync(outputFile); } catch { /* temp cleanup */ }
    const out = parseLLMResponse(rawContent) as unknown as LlmArchetypeProgramOutput;

    // VALIDATE before any DB write
    const errors = validateOutput(out, daysPerWeek, existingIds, muscleMap);
    if (errors.length > 0) {
      throw new Error(`Archetype program validation failed: ${errors.join('; ')}`);
    }

    // CREATE NEW ARCHETYPES (+ slots) — declared once, referenced by key. Created as library archetypes
    // (program_id = null) so they remain reusable across programs.
    const keyToArchetype = new Map<string, { id: string; name: string }>();
    for (const arch of out.new_archetypes!) {
      const archetypeId = await createDayArchetype(userId, { name: arch.name!, description: null, program_id: null });
      const slotErrors: string[] = []; // already validated; re-coerce to get the typed input
      let order = 1;
      for (const slot of arch.slots!) {
        await createDaySlot(userId, archetypeId, buildSlotInput(slot, muscleMap, order++, '', slotErrors));
      }
      keyToArchetype.set(arch.key!, { id: archetypeId, name: arch.name! });
    }

    // Resolve a day assignment to its archetype id + name (new or existing).
    const existingById = new Map(existing.map((a) => [a.id, a.name]));
    const resolveDay = (day: LlmDayAssignment): { id: string; name: string } => {
      if (day.archetype_key) return keyToArchetype.get(day.archetype_key)!;
      const id = day.archetype_existing_id!;
      return { id, name: existingById.get(id) ?? 'Workout' };
    };

    // BUILD DETERMINISTIC SKELETON — normalize the LLM's blocks/day assignments into the shared
    // skeleton input, then delegate to createProgramFromSkeleton (same builder the manual path uses).
    const skeletonBlocks: ArchetypeSkeletonBlock[] = out.blocks!.map((block, blockIdx) => ({
      name: block.name!,
      order_index: block.order_index ?? blockIdx + 1,
      tag: block.tag ?? null,
      color: block.color ?? null,
      weekCount: block.week_count!,
      days: block.days!.map((day) => {
        const archetype = resolveDay(day);
        return { dayIndex: day.day_index!, archetypeId: archetype.id, archetypeName: archetype.name };
      }),
    }));

    const programId = await createProgramFromSkeleton(userId, {
      name: out.program!.name!,
      description: out.program!.description ?? null,
      blocks: skeletonBlocks,
    });
    console.log(`[GenerateArchetypeProgram] Done in ${Math.round((Date.now() - startTime) / 1000)}s. Program id: '${programId}'`);
    return programId;
  } finally {
    clearInterval(heartbeat);
  }
}
