import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { CreateProgramPayload } from '../types/program';
import { GeneratedSegment } from '../types/segment';
import { GenerateProgramResult, ValidationResult } from '../types/llm';
import { getAllExercisesWithMuscleGroups } from './exerciseFunctions';
import { createProgram, getFirstWeekId } from './programFunctions';
import { getProgramTemplateById } from './programTemplateFunctions';
import { generateNextWeekPlanWithLlm } from './llmWeekGenerationFunctions';
import { insertSessionsIntoWeek, setFirstSessionAsCurrent } from './weekGenerationFunctions';
import { assemblePrompt } from './promptLoader';

export function buildPrompt(templateContext: string | null): string {
  return assemblePrompt('generateProgram.md', templateContext);
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

// Validates structure-only program payload
export function validateProgramPayload(payload: CreateProgramPayload): ValidationResult {
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
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function generateProgram(
  templateContext: string | null,
): Promise<GenerateProgramResult> {
  const prompt = buildPrompt(templateContext);
  const outputFile = await callLLM(prompt);
  const rawContent = readLLMOutput(outputFile);
  const programPayload = parseLLMResponse(rawContent);

  return {
    programPayload,
    modelUsed: process.env.LLM_PROVIDER || 'unknown',
  };
}

// Generates target exercises and sets for a single session using the session formatting file + context.
// Returns validated GeneratedSegment[] ready for insertion into target tables.
export async function generateSessionTargetsWithLlm(
  sessionContext: string | null,
  sessionName: string,
  sessionDescription: string,
): Promise<GeneratedSegment[]> {

  // Fetch exercise list for the prompt
  const exercises = await getAllExercisesWithMuscleGroups();
  const validExerciseIds = new Set(exercises.map(e => e.id));
  const exerciseListJson = JSON.stringify(exercises, null, 2);

  // Build prompt from formatting file + DB context
  const basePrompt = assemblePrompt('generateSession.md', sessionContext);
  const prompt = basePrompt
    .replace('{{SESSION_NAME}}', sessionName)
    .replace('{{USER_DESCRIPTION}}', sessionDescription)
    .replace('{{EXERCISE_LIST}}', exerciseListJson);

  console.log(`[GenerateSessionTargets] Calling LLM for session '${sessionName}'`);
  const outputFile = await callLLM(prompt);
  const rawContent = readLLMOutput(outputFile);

  // Parse response (reuse parseLLMResponse which strips code fences)
  const parsed = parseLLMResponse(rawContent) as unknown as { target_exercises: GeneratedSegment[] };

  if (!parsed.target_exercises || !Array.isArray(parsed.target_exercises)) {
    throw new Error('LLM returned invalid response structure — expected { target_exercises: [] }');
  }

  // Validate exercise IDs
  const invalidIds = parsed.target_exercises
    .filter(te => !validExerciseIds.has(te.exercise_id))
    .map(te => te.exercise_id);

  if (invalidIds.length > 0) {
    throw new Error(`LLM returned invalid exercise IDs: ${invalidIds.join(', ')}`);
  }

  console.log(`[GenerateSessionTargets] Generated ${parsed.target_exercises.length} exercises for session '${sessionName}'`);
  return parsed.target_exercises;
}

// Two-stage generation:
// Stage 1: LLM generates program structure (blocks + weeks, no sessions)
// Stage 2: LLM generates session plans for week 1 (names + descriptions, no exercises)
// Returns the created program ID.
export async function generateProgramFromTemplate(templateId: string): Promise<string> {
  const startTime = Date.now();
  const heartbeat = setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`Program generating... [${elapsedSeconds}s elapsed]`);
  }, 15000); // Log every 15 seconds

  try {
    // Load template (program_prompt, week_prompt, days_per_week)
    const template = await getProgramTemplateById(templateId);

    // STAGE 1: Generate program structure via LLM
    console.log('[GenerateProgram] Stage 1: Generating program structure...');
    const { programPayload } = await generateProgram(template.program_prompt);

    // Normalize: LLM returns structure-only, ensure each week has sessions: []
    for (const block of programPayload.blocks) {
      for (const week of block.weeks) {
        if (!week.sessions) {
          week.sessions = [];
        }
      }
    }

    // Validate structure-only payload
    const validation = validateProgramPayload(programPayload);
    if (!validation.valid) {
      throw new Error(`Program validation failed: ${validation.errors.join('; ')}`);
    }

    // Save program structure to database
    const programId = await createProgram(programPayload, templateId);
    const stage1Seconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`[GenerateProgram] Stage 1 complete in ${stage1Seconds}s. Program id: '${programId}'`);

    // STAGE 2: Generate week 1 session plans via LLM
    console.log('[GenerateProgram] Stage 2: Generating week 1 sessions...');

    // Find week 1 (first week of first block)
    const week1 = await getFirstWeekId(programId);
    if (week1) {
      // Generate session plans via LLM
      const sessionPlans = await generateNextWeekPlanWithLlm(
        template.week_prompt,
        template.days_per_week,
      );

      // Insert sessions into week 1
      await insertSessionsIntoWeek(week1.weekId, sessionPlans);

      await setFirstSessionAsCurrent(week1.weekId);

      const totalSeconds = Math.round((Date.now() - startTime) / 1000);
      console.log(`[GenerateProgram] Stage 2 complete in ${totalSeconds}s. ${sessionPlans.length} sessions created.`);
    } else {
      console.warn('[GenerateProgram] Stage 2 skipped: no weeks found in program');
    }

    return programId;
  } finally {
    clearInterval(heartbeat);
  }
}