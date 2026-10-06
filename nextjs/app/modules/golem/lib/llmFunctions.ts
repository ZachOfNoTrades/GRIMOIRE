import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { extractJson, generateText, generateWithTools, usesOpenRouter } from '@/lib/llm/generate';
import type { LlmTaskId } from '@/lib/llm/tasks';
import { makeSqlTools } from '@/lib/llm/tools/sql';
import { CreateProgramPayload } from '../types/program';
import { getGolemConnection } from './db';
import { MAX_RESULT_CHARS, MAX_ROWS, QUERY_TIMEOUT_MS, validateSqlQuery } from './sql_query_tool/sqlValidation.mjs';
import { GeneratedSegment } from '../types/segment';
import { GenerateProgramResult, ValidationResult } from '../types/llm';
import { getAllExercises } from './exerciseFunctions';
import { createProgram, getFirstWeekId } from './programFunctions';
import { getProgramTemplateById } from './programTemplateFunctions';
import { getProfileContext, getUserProfile } from './userProfileFunctions';
import { generateNextWeekPlanWithLlm } from './llmWeekGenerationFunctions';
import { insertSessionsIntoWeek, setFirstSessionAsCurrent } from './weekGenerationFunctions';
import { assemblePrompt, loadPromptFile } from './promptLoader';

export function buildPrompt(templateContext: string | null, profileContext: string | null = null): string {
  return assemblePrompt('generateProgram.md', templateContext, profileContext);
}

// Ten minutes: a program generation reads the profile, exercises and history and
// writes the whole structure in one agentic run.
const TIMEOUT_MS = 600000;

// An agentic golem call on the user's backend for `task`. On the Claude CLI the model
// gets Write + Bash (the user-scoped SQL script) and writes its answer to a file; on
// OpenRouter it gets the in-process run_sql / read_schema tools and answers with the
// JSON itself. Either way the answer lands in a temp file whose path is returned,
// which is what every caller already expects.
export async function callLLM(userId: string, taskPrompt: string, task: LlmTaskId = 'golem_program'): Promise<string> {
  // Prepare output file path for the LLM to write to
  const tmpDir = join(process.cwd(), '.tmp');
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }

  const outputFile = join(tmpDir, `llm-output-${randomUUID()}.json`);
  const outputFilePosix = outputFile.replace(/\\/g, '/'); // Replace backslashes with forward slashes for better readability by LLM

  let text: string;
  if (await usesOpenRouter(userId, task)) {
    const prompt = loadPromptFile('basePrompt.openrouter.md').replace('{{TASK_PROMPT}}', taskPrompt);
    const reply = await generateWithTools(userId, task, {
      prompt,
      json: true,
      timeoutMs: TIMEOUT_MS,
      maxRounds: 12,
      tools: makeSqlTools({
        userId,
        getPool: getGolemConnection,
        validate: validateSqlQuery,
        limits: { QUERY_TIMEOUT_MS, MAX_ROWS, MAX_RESULT_CHARS },
        databaseLabel: 'the training database',
        guidance: 'User-owned tables (programs, blocks, weeks, workout_sessions, session_segments, session_segment_sets, target_session_segments, target_session_segment_sets, program_templates, user_profiles, user_exercise_overrides) must be filtered with user_id = @userId; exercises holds system rows (user_id IS NULL) and the user\'s own.',
      }),
    });
    // A chat reply may wrap the JSON in a sentence or a fence; the file must hold
    // bare JSON for the structured tasks. The session analysis is prose and is
    // kept as the model wrote it.
    text = task === 'golem_analysis' ? reply : JSON.stringify(extractJson(reply));
  } else {
    // Wrap task prompt in base prompt template
    const prompt = loadPromptFile('basePrompt.md')
      .replace('{{TASK_PROMPT}}', taskPrompt)
      .replace(/\{\{USER_ID\}\}/g, userId)
      .replace('{{OUTPUT_FILE}}', outputFilePosix);
    text = await generateText(userId, task, {
      prompt,
      timeoutMs: TIMEOUT_MS,
      cli: {
        tools: 'Write,Bash', // Write for output file, Bash for SQL queries
        permissionMode: 'bypassPermissions', // Auto-accept all tool use (scoped by --tools above)
        shell: true,
        outputFile,
      },
    });
  }

  writeFileSync(outputFile, text, 'utf-8');
  console.log(`[CallLLM] Output written: ${outputFile}`);
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
  userId: string,
  templateContext: string | null,
  profileContext: string | null = null,
): Promise<GenerateProgramResult> {
  const prompt = buildPrompt(templateContext, profileContext);
  const outputFile = await callLLM(userId, prompt, 'golem_program');
  const rawContent = readLLMOutput(outputFile);
  try { unlinkSync(outputFile); } catch { } // Clear temp file
  const programPayload = parseLLMResponse(rawContent);

  return {
    programPayload,
    modelUsed: (await usesOpenRouter(userId, 'golem_program')) ? 'openrouter' : 'claude-code',
  };
}

// Generates target exercises and sets for a single session using the session formatting file + context.
// Returns validated GeneratedSegment[] ready for insertion into target tables.
export async function generateSessionTargetsWithLlm(
  userId: string,
  sessionContext: string | null,
  sessionId: string,
  sessionName: string,
  sessionDescription: string,
  profileContext: string | null = null,
): Promise<GeneratedSegment[]> {

  // Build prompt from formatting file + DB context
  const basePrompt = assemblePrompt('generateSession.md', sessionContext, profileContext);
  const prompt = basePrompt
    .replace('{{SESSION_ID}}', sessionId)
    .replace('{{SESSION_NAME}}', sessionName)
    .replace('{{USER_DESCRIPTION}}', sessionDescription);

  console.log(`[GenerateSessionTargets] Calling LLM for session '${sessionName}'`);
  const outputFile = await callLLM(userId, prompt, 'golem_session');
  const rawContent = readLLMOutput(outputFile);
  try { unlinkSync(outputFile); } catch { } // Clear temp file

  // Parse response (reuse parseLLMResponse which strips code fences)
  const parsed = parseLLMResponse(rawContent) as unknown as { target_exercises: GeneratedSegment[] };

  if (!parsed.target_exercises || !Array.isArray(parsed.target_exercises)) {
    throw new Error('LLM returned invalid response structure — expected { target_exercises: [] }');
  }

  // Validate exercise IDs
  const { exercises } = await getAllExercises(userId);
  const validExerciseIds = new Set(exercises.map(e => e.id));

  const invalidIds = parsed.target_exercises
    .filter(te => !validExerciseIds.has(te.exercise_id))
    .map(te => te.exercise_id);

  if (invalidIds.length > 0) {
    throw new Error(`LLM returned invalid exercise IDs: ${invalidIds.join(', ')}`);
  }

  // Validate warmup segments have only warmup sets
  const invalidWarmupSegments = parsed.target_exercises
    .filter(te => te.is_warmup && te.sets.some(s => !s.is_warmup))
    .map(te => te.exercise_id);

  if (invalidWarmupSegments.length > 0) {
    throw new Error(`LLM returned warmup exercises with non-warmup sets: ${invalidWarmupSegments.join(', ')}`);
  }

  console.log(`[GenerateSessionTargets] Generated ${parsed.target_exercises.length} exercises for session '${sessionName}'`);
  return parsed.target_exercises;
}

// Generates a plain-text analysis of a completed session. The LLM uses SQL Query skill
// to retrieve performance data, targets, and history. Returns the analysis as a string.
export async function generateSessionAnalysisWithLlm(
  userId: string,
  analysisContext: string | null,
  profileContext: string | null,
  sessionId: string,
  sessionReview: string | null,
): Promise<string> {

  const basePrompt = assemblePrompt('analyzeSession.md', analysisContext, profileContext);
  const prompt = basePrompt
    .replace('{{SESSION_ID}}', sessionId)
    .replace('{{SESSION_REVIEW}}', sessionReview || 'None provided');

  console.log(`[GenerateSessionAnalysis] Calling LLM for session '${sessionId}'`);
  const outputFile = await callLLM(userId, prompt, 'golem_analysis');
  const analysis = readLLMOutput(outputFile);
  try { unlinkSync(outputFile); } catch { } // Clear temp file

  console.log(`[GenerateSessionAnalysis] Generated ${analysis.length} chars of analysis for session '${sessionId}'`);
  return analysis.trim();
}

// Regenerates a single session's name and description using the regenerateSessionPlan prompt.
// The LLM uses SQL Query skill to pull context from completed sessions, reviews, analyses, etc.
export async function regenerateSessionPlanWithLlm(
  userId: string,
  weekContext: string | null,
  profileContext: string | null,
  sessionId: string,
): Promise<{ name: string; description: string }> {

  const basePrompt = assemblePrompt('regenerateSessionPlan.md', weekContext, profileContext);
  const prompt = basePrompt.replace('{{SESSION_ID}}', sessionId);

  console.log(`[RegenerateSessionPlan] Calling LLM for session '${sessionId}'`);
  const outputFile = await callLLM(userId, prompt, 'golem_regenerate');
  const rawContent = readLLMOutput(outputFile);
  try { unlinkSync(outputFile); } catch { } // Clear temp file

  const parsed = parseLLMResponse(rawContent) as unknown as { name: string; description: string };

  if (!parsed.name || typeof parsed.name !== 'string' || parsed.name.trim().length === 0) {
    throw new Error('LLM returned invalid session plan — name is required');
  }
  if (!parsed.description || typeof parsed.description !== 'string' || parsed.description.trim().length === 0) {
    throw new Error('LLM returned invalid session plan — description is required');
  }

  console.log(`[RegenerateSessionPlan] Generated plan for session '${sessionId}': ${parsed.name}`);
  return { name: parsed.name.trim(), description: parsed.description.trim() };
}

// Two-stage generation:
// Stage 1: LLM generates program structure (blocks + weeks, no sessions)
// Stage 2: LLM generates session plans for week 1 (names + descriptions, no exercises)
// Returns the created program ID.
export async function generateProgramFromTemplate(userId: string, templateId: string): Promise<string> {
  const startTime = Date.now();
  const heartbeat = setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`Program generating... [${elapsedSeconds}s elapsed]`);
  }, 15000); // Log every 15 seconds

  try {
    // Load template and user profile
    const template = await getProgramTemplateById(userId, templateId);
    const userProfile = await getUserProfile(userId);
    const profileContext = await getProfileContext(userId);

    // STAGE 1: Generate program structure via LLM
    console.log('[GenerateProgram] Stage 1: Generating program structure...');
    const { programPayload } = await generateProgram(userId, template.program_prompt, profileContext);

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
    const programId = await createProgram(userId, programPayload, templateId);
    const stage1Seconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`[GenerateProgram] Stage 1 complete in ${stage1Seconds}s. Program id: '${programId}'`);

    // STAGE 2: Generate week 1 session plans via LLM
    console.log('[GenerateProgram] Stage 2: Generating week 1 sessions...');

    // Find week 1 (first week of first block)
    const week1 = await getFirstWeekId(userId, programId);
    if (week1) {
      // Generate session plans via LLM
      const sessionPlans = await generateNextWeekPlanWithLlm(
        userId,
        template.week_prompt,
        week1.weekId,
        template.days_per_week,
        profileContext,
      );

      // Insert sessions into week 1
      await insertSessionsIntoWeek(userId, week1.weekId, sessionPlans);

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