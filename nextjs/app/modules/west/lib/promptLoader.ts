import { readFileSync } from 'fs';
import { join } from 'path';

const PROMPTS_DIR = join(process.cwd(), 'app', 'modules', 'west', 'lib', 'prompts');

// Loads a prompt markdown file from the prompts directory
export function loadPromptFile(fileName: string): string {
  const filePath = join(PROMPTS_DIR, fileName);
  return readFileSync(filePath, 'utf-8');
}

// Loads a prompt file and injects the template's domain context from the database
export function assemblePrompt(fileName: string, templateContext: string | null): string {
  const promptFile = loadPromptFile(fileName);
  return promptFile.replace('{{TEMPLATE_CONTEXT}}', templateContext?.trim() || '');
}
