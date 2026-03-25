import { readFileSync, existsSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { GenerateCardsPayload } from '../types/generation';
import { loadPromptFile } from './promptLoader';

export async function callLLM(taskPrompt: string): Promise<string> {
  // Prepare output file path for the LLM to write to
  const tmpDir = join(process.cwd(), '.tmp');
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }

  const outputFile = join(tmpDir, `llm-output-${randomUUID()}.json`);
  const outputFilePosix = outputFile.replace(/\\/g, '/'); // Replace backslashes with forward slashes for better readability by LLM

  // Wrap task prompt in base prompt template
  const basePrompt = loadPromptFile('basePrompt.md');
  const prompt = basePrompt
    .replace('{{TASK_PROMPT}}', taskPrompt)
    .replace('{{OUTPUT_FILE}}', outputFilePosix);

  const timeoutMs = 600000; // 600-second timeout

  return new Promise((resolve, reject) => {
    const proc = spawn(
      'claude',
      [
        '-p', // Print mode: accepts prompt from stdin, outputs response, then exits
        '--output-format', 'text', // Output plain text instead of JSON/streaming format
        '--no-session-persistence', // Don't save conversation to session history
        '--tools', 'Write,Bash', // Write for output file, Bash for SQL queries
        '--permission-mode', 'bypassPermissions', // Auto-accept all tool use (scoped by --tools above)
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
        console.log(`[CallLLM] stdout (${stdoutTrimmed.length} chars):\n${stdoutTrimmed}`);
      }

      // Verify the LLM wrote the output file
      if (!existsSync(outputFile)) {
        reject(new Error(`LLM completed but did not write output file: ${outputFile}`));
        return;
      }

      console.log(`[CallLLM] Output file written: ${outputFile}`);
      resolve(outputFile);
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
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
