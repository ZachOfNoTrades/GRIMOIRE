import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { extractJson, generateText, generateWithTools, usesOpenRouter } from '@/lib/llm/generate';
import { makeSqlTools } from '@/lib/llm/tools/sql';
import { GenerateCardsPayload } from '../types/generation';
import { getRuneConnection } from './db';
import { loadPromptFile } from './promptLoader';
import { MAX_RESULT_CHARS, MAX_ROWS, QUERY_TIMEOUT_MS, validateSqlQuery } from './sql_query_tool/sqlValidation.mjs';

// Ten minutes: deck generation reads the source, queries the deck and writes
// every card in one agentic run.
const TIMEOUT_MS = 600000;

// An agentic deck call on the user's `rune_deck` backend. On the Claude CLI the model
// gets Write + Bash (the SQL script, user-scoped) and writes its answer to a file; on
// OpenRouter it gets the in-process run_sql / read_schema tools and answers with the
// JSON itself. Either way the answer lands in a temp file whose path is returned,
// which is what every caller already expects.
export async function callLLM(userId: string, taskPrompt: string): Promise<string> {
  // Prepare output file path for the LLM to write to
  const tmpDir = join(process.cwd(), '.tmp');
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }

  const outputFile = join(tmpDir, `llm-output-${randomUUID()}.json`);
  const outputFilePosix = outputFile.replace(/\\/g, '/'); // Replace backslashes with forward slashes for better readability by LLM

  let text: string;
  if (await usesOpenRouter(userId, 'rune_deck')) {
    const prompt = loadPromptFile('basePrompt.openrouter.md').replace('{{TASK_PROMPT}}', taskPrompt);
    const reply = await generateWithTools(userId, 'rune_deck', {
      prompt,
      json: true,
      timeoutMs: TIMEOUT_MS,
      maxRounds: 10,
      tools: makeSqlTools({
        userId,
        getPool: getRuneConnection,
        validate: validateSqlQuery,
        limits: { QUERY_TIMEOUT_MS, MAX_ROWS, MAX_RESULT_CHARS },
        databaseLabel: 'the flash cards database',
        guidance: 'User-owned tables (decks, cards, card_progress, card_reviews, collections, study_sessions, rune_settings) must be filtered with user_id = @userId.',
      }),
    });
    // A chat reply may wrap the JSON in a sentence or a fence; the file must hold
    // bare JSON, which is what parseLLMResponse expects.
    text = JSON.stringify(extractJson(reply));
  } else {
    // Wrap task prompt in base prompt template
    const prompt = loadPromptFile('basePrompt.md')
      .replace('{{TASK_PROMPT}}', taskPrompt)
      .replace(/\{\{USER_ID\}\}/g, userId)
      .replace('{{OUTPUT_FILE}}', outputFilePosix);
    text = await generateText(userId, 'rune_deck', {
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

export function parseLLMResponse(rawContent: string): GenerateCardsPayload {
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

export function validateGeneratedCards(payload: GenerateCardsPayload): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!payload.cards || !Array.isArray(payload.cards)) {
    errors.push('Response must contain a cards array');
    return { valid: false, errors };
  }

  if (payload.cards.length === 0) {
    errors.push('No cards were generated');
  }

  for (let i = 0; i < payload.cards.length; i++) {
    const card = payload.cards[i];
    const cardLabel = `Card ${i + 1}`;

    if (!card.front || typeof card.front !== 'string' || card.front.trim().length === 0) {
      errors.push(`${cardLabel}: front is required`);
    }

    if (!card.back || typeof card.back !== 'string' || card.back.trim().length === 0) {
      errors.push(`${cardLabel}: back is required`);
    }

    if (typeof card.order_index !== 'number') {
      errors.push(`${cardLabel}: order_index must be a number`);
    }
  }

  return { valid: errors.length === 0, errors };
}
