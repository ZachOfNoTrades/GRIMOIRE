import { readFileSync } from 'fs';
import { join } from 'path';

const PROMPTS_DIR = join(process.cwd(), 'app', 'modules', 'rune', 'lib', 'prompts');

// Loads a prompt markdown file from the prompts directory
export function loadPromptFile(fileName: string): string {
  const filePath = join(PROMPTS_DIR, fileName);
  return readFileSync(filePath, 'utf-8');
}
