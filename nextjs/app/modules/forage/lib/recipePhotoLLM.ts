import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { extractJson, generateJson, generateText, usesOpenRouter } from '@/lib/llm/generate';

const LLM_TIMEOUT_MS = 60_000;

export interface RecipePhotoItem {
  name: string;
  quantity: number;
  unit: string;
  grams: number;
}

// Two openings for the same task: on the Claude CLI the model Reads the file at
// `imagePath` and Writes its answer to `outputPath`; on OpenRouter the photo is
// attached to the request and the answer is the reply itself (outputPath null).
function buildPrompt(imagePath: string, outputPath: string | null): string {
  const intro = outputPath
    ? `Look at the food photo at ${imagePath}. Identify every distinct food ingredient visible. For each one, estimate the amount that appears in the photo using the food's most natural real-world measure.

Write a JSON array to ${outputPath}.`
    : `Look at the attached food photo. Identify every distinct food ingredient visible. For each one, estimate the amount that appears in the photo using the food's most natural real-world measure.

Reply with a JSON array.`;
  const outro = outputPath
    ? `Write valid JSON only — no prose, no markdown fences, no explanation. After writing the file, output the single word "done".`
    : `Reply with valid JSON only — no prose, no markdown fences, no explanation.`;
  return `${intro}

JSON shape (strict):
[
  { "name": string, "quantity": number, "unit": string, "grams": number },
  ...
]

Rules:
- name: generic unbranded food name, lowercase, under 60 chars. Examples: "chicken breast", "white rice", "olive oil", "cheddar cheese", "red bell pepper".
- Do NOT include brand names. Always use the generic equivalent.
- unit: the most natural measurement unit for the amount shown, lowercase and singular, from this set when possible: g, kg, ml, l, oz, lb, cup, tbsp, tsp, clove, slice, piece, can, pinch. For a countable whole item (a chicken breast, an egg, a banana) use "piece". Do NOT default everything to "serving" — pick the unit that matches what the photo actually shows.
- quantity: the numeric amount in that unit (e.g. "2 tbsp olive oil" -> 2; "1 chicken breast" -> 1 piece; "about a cup of rice" -> 1 cup).
- grams: that same amount expressed as total weight in grams (your best estimate, e.g. "2 tbsp olive oil" -> 27, "1 chicken breast" -> 170, "3 cloves garlic" -> 9). Must be > 0. This is the universal fallback when the food can't carry the unit above.
- Include sauces, seasonings, and garnishes if clearly visible.
- If you see a prepared dish, break it down into its likely component ingredients.
- Order from most prominent to least prominent ingredient.
- If you cannot identify any food in the image, write an empty array [].

${outro}`;
}

// Identify the ingredients in a photo on the user's `forage_recipe_photo` backend.
export async function identifyRecipePhoto(userId: string, imagePath: string): Promise<RecipePhotoItem[]> {
  let parsed: unknown;
  if (await usesOpenRouter(userId, 'forage_recipe_photo')) {
    parsed = await generateJson(userId, 'forage_recipe_photo', {
      prompt: buildPrompt(imagePath, null),
      images: [{ path: imagePath }],
      timeoutMs: LLM_TIMEOUT_MS,
    });
  } else {
    const tmpDir = join(process.cwd(), '.tmp');
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
    const outputPath = join(tmpDir, `forage-recipe-photo-${randomUUID()}.json`);
    const raw = await generateText(userId, 'forage_recipe_photo', {
      prompt: buildPrompt(imagePath, outputPath),
      timeoutMs: LLM_TIMEOUT_MS,
      cli: { permissionMode: 'bypassPermissions', allowedTools: 'Read,Write', outputFile: outputPath },
    });
    // Tolerate accidental ```json fences and a "done" tail inside the file.
    parsed = extractJson(raw);
  }
  const items = coerceItems(parsed);
  console.log(`[ForageRecipePhoto-LLM] identified ${items.length} items`);
  return items;
}

function coerceItems(raw: unknown): RecipePhotoItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item: any) => typeof item?.name === 'string' && item.name.trim())
    .map((item: any) => {
      const grams = Number(item.grams);
      return {
        name: item.name.trim().slice(0, 120),
        quantity: Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 1,
        unit: typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim().toLowerCase().slice(0, 32) : 'piece',
        // Universal fallback weight; only kept when positive.
        grams: Number.isFinite(grams) && grams > 0 ? grams : 1,
      };
    });
}
