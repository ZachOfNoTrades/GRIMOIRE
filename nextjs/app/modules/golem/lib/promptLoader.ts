import { readFileSync } from 'fs';
import { join } from 'path';

const PROMPTS_DIR = join(process.cwd(), 'app', 'modules', 'golem', 'lib', 'prompts');

// Loads a prompt markdown file from the prompts directory
export function loadPromptFile(fileName: string): string {
  const filePath = join(PROMPTS_DIR, fileName);
  return readFileSync(filePath, 'utf-8');
}

// Loads a prompt file and injects the template's domain context, user profile context, volume landmarks, pre-survey, and active location's equipment
export function assemblePrompt(
  fileName: string,
  templateContext: string | null,
  profileContext: string | null = null,
  volumeLandmarksContext: string | null = null,
  preSurveyContext: string | null = null,
  locationEquipmentContext: string | null = null,
): string {
  const promptFile = loadPromptFile(fileName);
  return promptFile
    .replace('{{TEMPLATE_CONTEXT}}', templateContext?.trim() || '')
    .replace('{{PROFILE_CONTEXT}}', profileContext?.trim() || '')
    .replace('{{VOLUME_LANDMARKS}}', volumeLandmarksContext?.trim() || '')
    .replace('{{PRE_SURVEY}}', preSurveyContext?.trim() || '')
    .replace('{{LOCATION_EQUIPMENT}}', locationEquipmentContext?.trim() || '');
}
