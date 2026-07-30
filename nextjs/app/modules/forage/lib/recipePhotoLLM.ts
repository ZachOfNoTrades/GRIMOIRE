import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';

const CLAUDE_TIMEOUT_MS = 60_000;

export interface RecipePhotoItem {
  name: string;
  quantity: number;
  unit: string;
  grams: number;
}

function buildPrompt(imagePath: string, outputPath: string): string {
  return `Look at the food photo at ${imagePath}. Identify every distinct food ingredient visible. For each one, estimate the amount that appears in the photo using the food's most natural real-world measure.

Write a JSON array to ${outputPath}.

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

Write valid JSON only — no prose, no markdown fences, no explanation. After writing the file, output the single word "done".`;
}

export async function identifyRecipePhoto(imagePath: string): Promise<RecipePhotoItem[]> {
  const tmpDir = join(process.cwd(), '.tmp');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const outputPath = join(tmpDir, `forage-recipe-photo-${randomUUID()}.json`);
  const prompt = buildPrompt(imagePath, outputPath);

  return new Promise<RecipePhotoItem[]>((resolve, reject) => {
    const proc = spawn(
      'claude',
      [
        '-p',
        '--output-format', 'text',
        '--no-session-persistence',
        '--permission-mode', 'bypassPermissions',
        '--allowedTools', 'Read,Write',
      ],
      { timeout: CLAUDE_TIMEOUT_MS, shell: false, env: { ...process.env } }
    );
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(new Error(`Failed to start claude CLI: ${err.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude CLI exited ${code}: ${(stderr || stdout).trim().slice(0, 400)}`));
        return;
      }
      if (!existsSync(outputPath)) {
        reject(new Error(`claude CLI finished but did not write ${outputPath}. stdout: ${stdout.trim().slice(0, 400)}`));
        return;
      }
      try {
        const raw = readFileSync(outputPath, 'utf8');
        const cleaned = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        const items = coerceItems(parsed);
        try { unlinkSync(outputPath); } catch {}
        console.log(`[ForageRecipePhoto-LLM] identified ${items.length} items`);
        resolve(items);
      } catch (err: any) {
        reject(new Error(`Invalid JSON in ${outputPath}: ${err?.message ?? err}`));
      }
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
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
