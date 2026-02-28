import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';
import { CreateProgramPayload } from '../types/program';
import { ExerciseSummary } from '../types/exercise';
import { GenerateProgramInput, GenerateProgramResult, ValidationResult } from '../types/llm';
import { getAllExercisesWithMuscleGroups } from './exerciseFunctions';
import { createProgram } from './programFunctions';

export function buildPrompt(input: GenerateProgramInput, exercises: ExerciseSummary[]): string {
  const templatePath = join(process.cwd(), 'app', 'modules', 'west', 'lib', 'prompts', 'generateProgram.md');
  const template = readFileSync(templatePath, 'utf-8');
  const exerciseListJson = JSON.stringify(exercises, null, 2);

  return template
    .replace('{{EXERCISE_LIST}}', exerciseListJson)
    .replace('{{USER_PROMPT}}', input.userPrompt)
    .replace('{{START_DATE}}', input.startDate);
}

export async function callLLM(prompt: string): Promise<string> {
  const provider = process.env.LLM_PROVIDER;

  if (!provider) {
    throw new Error('LLM_PROVIDER environment variable is not set');
  }

  switch (provider) {
    case 'claude-code':
      return callClaudeCode(prompt);
    default:
      throw new Error(`Unsupported LLM_PROVIDER: '${provider}'`);
  }
}

async function callClaudeCode(prompt: string): Promise<string> {
  const timeoutMs = 300000; // 300-second timeout for program generation

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', '--output-format', 'text'], {
      timeout: timeoutMs,
      shell: true,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('error', (error) => {
      reject(new Error(`Failed to start Claude CLI: ${error.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr.trim()}`));
      }
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

export function parseLLMResponse(rawContent: string): CreateProgramPayload {
  // Strip markdown code fences if present
  let cleanedResponse = rawContent.trim();
  const fenceMatch = cleanedResponse.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    cleanedResponse = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(cleanedResponse);
  } catch {
    const preview = cleanedResponse.substring(0, 200);
    throw new Error(`Failed to parse LLM response as JSON. Preview: ${preview}`);
  }
}

export function validateGeneratedPayload(
  payload: CreateProgramPayload,
  validExerciseIds: Set<string>,
): ValidationResult {
  const errors: string[] = [];

  // Program-level validation
  if (!payload.name || typeof payload.name !== 'string' || payload.name.trim().length === 0) {
    errors.push('Program name is required');
  }

  if (!Array.isArray(payload.blocks) || payload.blocks.length === 0) {
    errors.push('Program must have at least one block');
  }

  if (!Array.isArray(payload.blocks)) {
    return { valid: false, errors };
  }

  for (let blockIndex = 0; blockIndex < payload.blocks.length; blockIndex++) {
    const block = payload.blocks[blockIndex];
    const blockLabel = `Block ${blockIndex + 1}`;

    if (!block.name || typeof block.name !== 'string') {
      errors.push(`${blockLabel}: name is required`);
    }

    if (!Array.isArray(block.weeks) || block.weeks.length === 0) {
      errors.push(`${blockLabel}: must have at least one week`);
      continue;
    }

    for (let weekIndex = 0; weekIndex < block.weeks.length; weekIndex++) {
      const week = block.weeks[weekIndex];
      const weekLabel = `${blockLabel} > Week ${weekIndex + 1}`;

      if (!Array.isArray(week.sessions) || week.sessions.length === 0) {
        errors.push(`${weekLabel}: must have at least one session`);
        continue;
      }

      for (let sessionIndex = 0; sessionIndex < week.sessions.length; sessionIndex++) {
        const session = week.sessions[sessionIndex];
        const sessionLabel = `${weekLabel} > Session ${sessionIndex + 1}`;

        if (!session.name || typeof session.name !== 'string') {
          errors.push(`${sessionLabel}: name is required`);
        }

        // Validate session_date format
        if (!session.session_date || !/^\d{4}-\d{2}-\d{2}$/.test(session.session_date)) {
          errors.push(`${sessionLabel}: session_date must be YYYY-MM-DD format`);
        } else {
          const dateCheck = new Date(session.session_date);
          if (isNaN(dateCheck.getTime())) {
            errors.push(`${sessionLabel}: session_date is not a valid date`);
          }
        }

        if (!Array.isArray(session.target_exercises)) continue;

        for (let exerciseIndex = 0; exerciseIndex < session.target_exercises.length; exerciseIndex++) {
          const exercise = session.target_exercises[exerciseIndex];
          const exerciseLabel = `${sessionLabel} > Exercise ${exerciseIndex + 1}`;

          // Validate exercise_id exists in the database
          if (!exercise.exercise_id || !validExerciseIds.has(exercise.exercise_id)) {
            errors.push(`${exerciseLabel}: exercise_id '${exercise.exercise_id}' is not a valid exercise`);
          }

          if (!Array.isArray(exercise.sets)) continue;

          for (let setIndex = 0; setIndex < exercise.sets.length; setIndex++) {
            const set = exercise.sets[setIndex];
            const setLabel = `${exerciseLabel} > Set ${setIndex + 1}`;

            if (typeof set.reps !== 'number' || set.reps <= 0) {
              errors.push(`${setLabel}: reps must be a positive number`);
            }

            if (typeof set.weight !== 'number' || set.weight < 0) {
              errors.push(`${setLabel}: weight must be zero or positive`);
            }

            if (set.rpe !== null && set.rpe !== undefined) {
              if (typeof set.rpe !== 'number' || set.rpe < 1 || set.rpe > 10) {
                errors.push(`${setLabel}: rpe must be between 1 and 10, or null`);
              }
            }
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function generateProgram(
  input: GenerateProgramInput,
  exercises: ExerciseSummary[],
): Promise<GenerateProgramResult> {
  const prompt = buildPrompt(input, exercises);
  const rawContent = await callLLM(prompt);
  const programPayload = parseLLMResponse(rawContent);

  return {
    programPayload,
    modelUsed: process.env.LLM_PROVIDER || 'unknown',
  };
}

// Self-contained background generation function. Fetches exercises, generates via LLM,
// validates, and saves the program. All errors are caught and logged internally.
export async function generateProgramInBackground(input: GenerateProgramInput): Promise<void> {
  const startTime = Date.now();
  const heartbeat = setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`Program generating... [${elapsedSeconds}s elapsed]`);
  }, 15000); // Log every 15 seconds

  try {
    const exercises = await getAllExercisesWithMuscleGroups();
    const validExerciseIds = new Set(exercises.map(e => e.id)); // Verify no hallucinated exercise IDs

    const { programPayload } = await generateProgram(input, exercises);

    const validation = validateGeneratedPayload(programPayload, validExerciseIds);
    if (!validation.valid) {
      console.error('[GenerateProgram] Failed validation:', validation.errors);
      return;
    }

    const programId = await createProgram(programPayload);
    const totalSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`[GenerateProgram] Completed in ${totalSeconds}s. Program id: '${programId}'`);
  } catch (error) {
    const totalSeconds = Math.round((Date.now() - startTime) / 1000);
    console.error(`[GenerateProgram] Failed after ${totalSeconds}s:`, error);
  } finally {
    clearInterval(heartbeat);
  }
}
