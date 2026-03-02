import { readFileSync } from 'fs';
import { join } from 'path';
import { callLLM } from './llmFunctions';
import { PowerliftingGeneratorInput } from './powerliftingProgramGenerator';
import { calculateBlockSplit } from '../utils/calc';
import { ExerciseSummary } from '../types/exercise';
import { LLMSessionPlan } from '../types/weekGeneration';
import {
  CreateProgramSession,
  BlockPhase,
  HYPERTROPHY,
  STRENGTH,
  PEAKING,
} from '../types/program';
import { ValidationResult } from '../types/llm';

// =============================
// First Week Plan Generation
// =============================

function buildFirstWeekPlanPrompt(
  input: PowerliftingGeneratorInput,
  phase: BlockPhase,
  exerciseNames: { squat: string; bench: string; deadlift: string },
  exerciseE1rms: { squat: number | null; bench: number | null; deadlift: number | null },
): string {
  const promptsDir = join(process.cwd(), 'nextjs', 'app', 'modules', 'west', 'lib', 'prompts');
  const baseTemplate = readFileSync(join(promptsDir, 'generateFirstWeekPlan.md'), 'utf-8');
  const programContext = readFileSync(join(promptsDir, 'powerliftingFirstWeekContext.md'), 'utf-8');

  // Inject program-specific context into the base template, then replace all placeholders
  return baseTemplate
    .replace(/\{\{PROGRAM_CONTEXT\}\}/g, programContext)
    .replace(/\{\{DAYS_PER_WEEK\}\}/g, String(input.daysPerWeek))
    .replace(/\{\{BLOCK_NAME\}\}/g, phase.name)
    .replace(/\{\{BLOCK_TAG\}\}/g, phase.tag)
    .replace(/\{\{INTENSITY_MIN\}\}/g, String(Math.round(phase.intensityMin * 100)))
    .replace(/\{\{INTENSITY_MAX\}\}/g, String(Math.round(phase.intensityMax * 100)))
    .replace(/\{\{REP_MIN\}\}/g, String(phase.repMin))
    .replace(/\{\{REP_MAX\}\}/g, String(phase.repMax))
    .replace(/\{\{WORKING_SETS\}\}/g, String(phase.workingSets))
    .replace(/\{\{BASE_RPE\}\}/g, String(phase.baseRPE))
    .replace(/\{\{SQUAT_EXERCISE_NAME\}\}/g, exerciseNames.squat)
    .replace(/\{\{SQUAT_1RM\}\}/g, String(exerciseE1rms.squat ?? 'unknown'))
    .replace(/\{\{BENCH_EXERCISE_NAME\}\}/g, exerciseNames.bench)
    .replace(/\{\{BENCH_1RM\}\}/g, String(exerciseE1rms.bench ?? 'unknown'))
    .replace(/\{\{DEADLIFT_EXERCISE_NAME\}\}/g, exerciseNames.deadlift)
    .replace(/\{\{DEADLIFT_1RM\}\}/g, String(exerciseE1rms.deadlift ?? 'unknown'));
}

function parseFirstWeekPlanResponse(rawContent: string): LLMSessionPlan[] {
  let cleaned = rawContent.trim();

  // Strip markdown code fences if present
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      throw new Error('Response is not a JSON array');
    }
    return parsed;
  } catch (error) {
    const preview = cleaned.substring(0, 200);
    throw new Error(`Failed to parse session plan response as JSON array. Preview: ${preview}`);
  }
}

function validateFirstWeekPlans(plans: LLMSessionPlan[], expectedCount: number): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(plans) || plans.length === 0) {
    errors.push('Response must be a non-empty array of session plans');
    return { valid: false, errors };
  }

  if (plans.length !== expectedCount) {
    errors.push(`Expected ${expectedCount} session plans but received ${plans.length}`);
  }

  const orderIndices = new Set<number>();
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const label = `Session plan ${i + 1}`;

    if (!plan.name || typeof plan.name !== 'string' || plan.name.trim().length === 0) {
      errors.push(`${label}: name is required`);
    }

    if (!plan.description || typeof plan.description !== 'string' || plan.description.trim().length === 0) {
      errors.push(`${label}: description is required`);
    }

    if (typeof plan.order_index !== 'number' || plan.order_index < 1) {
      errors.push(`${label}: order_index must be a positive number`);
    }

    if (orderIndices.has(plan.order_index)) {
      errors.push(`${label}: duplicate order_index '${plan.order_index}'`);
    }
    orderIndices.add(plan.order_index);
  }

  return { valid: errors.length === 0, errors };
}

export async function generateFirstWeekPlanWithLlm(
  input: PowerliftingGeneratorInput,
  allExercises: ExerciseSummary[],
): Promise<CreateProgramSession[]> {
  const startTime = Date.now();

  /**
   * STEP 1: CALCULATE PHASE
   *  TODO: PowerliftingGeneratorInput does not contain the actual assigned block phases, so we reverse engineer it with the same function that assigns them.
   *  In the future, the generatePowerliftingProgram payload should contain and provide this data here.
   */

  const { hypertrophyWeeks, strengthWeeks } = calculateBlockSplit(input.totalWeeks);
  let phase: BlockPhase;
  if (hypertrophyWeeks > 0) {
    phase = HYPERTROPHY;
  } else if (strengthWeeks > 0) {
    phase = STRENGTH;
  } else {
    phase = PEAKING;
  }

  /**
   * STEP 2: COMPILE EXERCISE LIST
   * Find e1RM for competition lifts for better prompt context
   */

  const exerciseLookup = new Map(allExercises.map(e => [e.id, e]));

  const exerciseNames = {
    squat: exerciseLookup.get(input.squatExerciseId)?.name || 'Squat',
    bench: exerciseLookup.get(input.benchExerciseId)?.name || 'Bench Press',
    deadlift: exerciseLookup.get(input.deadliftExerciseId)?.name || 'Deadlift',
  };

  const exerciseE1rms = {
    squat: exerciseLookup.get(input.squatExerciseId)?.estimated_one_rep_max ?? null,
    bench: exerciseLookup.get(input.benchExerciseId)?.estimated_one_rep_max ?? null,
    deadlift: exerciseLookup.get(input.deadliftExerciseId)?.estimated_one_rep_max ?? null,
  };

  /**
   * STEP 3: GENERATE SESSION PLANS FROM LLM
   * Compile prompt, send to LLM, parse response as JSON, validate no invalid data
   */

  console.log(`[FirstWeekLLM] Generating ${input.daysPerWeek} session plans...`);

  const planPrompt = buildFirstWeekPlanPrompt(input, phase, exerciseNames, exerciseE1rms);
  const planRaw = await callLLM(planPrompt);
  const sessionPlans = parseFirstWeekPlanResponse(planRaw);

  const validation = validateFirstWeekPlans(sessionPlans, input.daysPerWeek);
  if (!validation.valid) {
    console.error('[FirstWeekLLM] Validation failed:', validation.errors);
    throw new Error(`Session plan validation failed: ${validation.errors.join('; ')}`);
  }

  /**
   * STEP 4: ADD SESSIONS
   */

  // Sort plans by order_index
  sessionPlans.sort((a, b) => a.order_index - b.order_index);

  const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
  console.log(`[FirstWeekLLM] Complete in ${elapsedSeconds}s. Sessions: ${sessionPlans.map(p => p.name).join(', ')}`);

  // Build sessions (names + descriptions only, no target exercises)
  const sessions: CreateProgramSession[] = sessionPlans.map(plan => ({
    order_index: plan.order_index,
    name: plan.name,
    notes: plan.description,
    target_exercises: [],
  }));

  return sessions;
}