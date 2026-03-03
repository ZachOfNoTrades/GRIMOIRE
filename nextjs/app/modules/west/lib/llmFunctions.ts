import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';
import { randomUUID } from 'crypto';
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
    .replace('{{USER_PROMPT}}', input.userPrompt);
}

export async function callLLM(prompt: string): Promise<string> {
  const provider = process.env.LLM_PROVIDER;

  if (!provider) {
    throw new Error('LLM_PROVIDER environment variable is not set');
  }

  switch (provider) {
    case 'claude-code':
      return callClaudeCode(prompt);
    case 'local':
      return callLocalLLM(prompt);
    default:
      throw new Error(`Unsupported LLM_PROVIDER: '${provider}'`);
  }
}

async function callClaudeCode(prompt: string): Promise<string> {
  const timeoutMs = 300000; // 300-second timeout

  // Prepare output file path for the LLM to write to
  const tmpDir = join(process.cwd(), '.tmp');
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }
  const outputFile = join(tmpDir, `llm-output-${randomUUID()}.json`);
  const outputFilePosix = outputFile.replace(/\\/g, '/'); // Replace backslashes with forward slashes for better readability by LLM
  const promptWithOutputInstructions = `${prompt}\n\n---\nIMPORTANT: Write your complete response (the JSON output only, no markdown fences or extra text) to the following file path:\n${outputFilePosix}\n\nUse the Write tool to create this file. The file must contain ONLY the raw JSON response.\n---`;

  return new Promise((resolve, reject) => {
    const proc = spawn(
      'claude',
      [
        '-p', // Print mode: accepts prompt from stdin, outputs response, then exits
        '--output-format', 'text', // Output plain text instead of JSON/streaming format
        '--no-session-persistence', // Don't save conversation to session history
        '--tools', 'Write', // Only allow the Write tool (for writing the output file)
        '--permission-mode', 'acceptEdits', // Auto-accept file edits without prompting
      ], {
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
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr.trim()}`));
        return;
      }

      // Log stdout for debugging
      const stdoutTrimmed = stdout.trim();
      if (stdoutTrimmed.length > 0) {
        const preview = stdoutTrimmed.length > 200 ? stdoutTrimmed.substring(0, 200) + '...' : stdoutTrimmed;
        console.log(`[CallClaudeCode] stdout (${stdoutTrimmed.length} chars): ${preview}`);
      }

      // Verify the LLM wrote the output file
      if (!existsSync(outputFile)) {
        reject(new Error(`Claude CLI completed but did not write output file: ${outputFile}`));
        return;
      }

      console.log(`[CallClaudeCode] Output file written by LLM: ${outputFile}`);
      resolve(outputFile);
    });

    proc.stdin.write(promptWithOutputInstructions);
    proc.stdin.end();
  });
}

async function callLocalLLM(prompt: string): Promise<string> {
  const serverUrl = process.env.LLM_SERVER_URL;
  const model = process.env.LLM_MODEL;

  if (!serverUrl) {
    throw new Error('LLM_SERVER_URL environment variable is not set');
  }
  if (!model) {
    throw new Error('LLM_MODEL environment variable is not set');
  }

  // Auto-prepend http:// if no protocol specified
  const baseUrl = serverUrl.match(/^https?:\/\//) ? serverUrl : `http://${serverUrl}`;

  // OpenAI-compatible chat completions endpoint
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Local LLM request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Write response to file
  const tmpDir = join(process.cwd(), '.tmp');
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }
  const outputFile = join(tmpDir, `llm-output-${randomUUID()}.json`);
  writeFileSync(outputFile, content, 'utf-8');
  console.log(`[CallLocalLLM] Response written to: ${outputFile}`);

  return outputFile;
}

export function readLLMOutput(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  console.log(`[ReadLLMOutput] Read ${content.length} chars from: ${filePath}`);
  return content;
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
  const outputFile = await callLLM(prompt);
  const rawContent = readLLMOutput(outputFile);
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
