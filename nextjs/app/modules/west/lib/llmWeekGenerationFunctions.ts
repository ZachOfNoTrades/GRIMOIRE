import { unlinkSync } from 'fs';
import { callLLM, readLLMOutput } from './llmFunctions';
import { assemblePrompt } from './promptLoader';
import { LLMSessionPlan } from '../types/weekGeneration';
import { CreateProgramSession } from '../types/program';
import { ValidationResult } from '../types/llm';

// =============================
// Week Plan Prompt Building
// =============================

function buildWeekPlanPrompt(
  weekContext: string | null,
  daysPerWeek: number,
): string {
  // Load formatting file and inject DB context, then replace runtime placeholders
  const basePrompt = assemblePrompt('generateWeekPlan.md', weekContext);
  return basePrompt.replace(/\{\{DAYS_PER_WEEK\}\}/g, String(daysPerWeek));
}

function parseWeekPlanResponse(rawContent: string): LLMSessionPlan[] {
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

function validateWeekPlans(plans: LLMSessionPlan[]): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(plans) || plans.length === 0) {
    errors.push('Response must be a non-empty array of session plans');
    return { valid: false, errors };
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

// Generates session plans for a week using the week_prompt template.
// Returns sessions with names + descriptions only (no target exercises).
export async function generateNextWeekPlanWithLlm(
  weekContext: string | null,
  daysPerWeek: number,
): Promise<CreateProgramSession[]> {
  const startTime = Date.now();

  console.log(`[WeekPlanLLM] Generating ${daysPerWeek} session plans...`);

  const planPrompt = buildWeekPlanPrompt(weekContext, daysPerWeek);
  const outputFile = await callLLM(planPrompt);
  const planRaw = readLLMOutput(outputFile);
  try { unlinkSync(outputFile); } catch { } // Clear temp file
  const sessionPlans = parseWeekPlanResponse(planRaw);

  const validation = validateWeekPlans(sessionPlans);
  if (!validation.valid) {
    console.error('[WeekPlanLLM] Validation failed:', validation.errors);
    throw new Error(`Session plan validation failed: ${validation.errors.join('; ')}`);
  }

  // Sort plans by order_index
  sessionPlans.sort((a, b) => a.order_index - b.order_index);

  const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
  console.log(`[WeekPlanLLM] Complete in ${elapsedSeconds}s. Sessions: ${sessionPlans.map(p => p.name).join(', ')}`);

  // Build sessions (names + descriptions only, no target exercises)
  const sessions: CreateProgramSession[] = sessionPlans.map(plan => ({
    order_index: plan.order_index,
    name: plan.name,
    notes: plan.description,
    target_exercises: [],
  }));

  return sessions;
}