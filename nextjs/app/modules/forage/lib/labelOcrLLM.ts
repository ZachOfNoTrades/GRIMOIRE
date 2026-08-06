import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { LabelOcrDraft } from '../types/labelOcr';
import { NUTRIENT_CODES_IN_ORDER } from '../utils/nutrientLedger';
import { FOOD_ICON_CODES } from './foodIcons';

// 60s ceiling for the Claude CLI call. Vision on a phone-photo label is typically
// 7-15s; the cap is here so a stuck CLI invocation can't hang the request indefinitely.
const CLAUDE_TIMEOUT_MS = 60_000;

// Nutrient codes the modal knows how to render — from the ledger (single source of
// truth), excluding `creatine` (in the ledger but not yet seeded in food_nutrients).
// Sent in the prompt so the LLM only emits codes that downstream code will accept.
const KNOWN_NUTRIENT_CODES = NUTRIENT_CODES_IN_ORDER.filter((code) => code !== 'creatine');

function buildPrompt(imagePaths: string[], outputPath: string, knownUnits: Set<string>): string {
  const unitsList = Array.from(knownUnits).sort().join(', ');
  const codesList = KNOWN_NUTRIENT_CODES.join(', ');
  const iconList = FOOD_ICON_CODES.join(', ');
  // One image → the classic single-panel scan. Multiple images → the user shot the
  // package from more than one side (typically the front/marketing face for the
  // brand & product name and the back nutrition-facts panel for the macros), so
  // tell the LLM to read ALL of them and combine: brand/name come off the front,
  // nutrition off the panel. Whichever angle is clearest for a given field wins.
  const isMulti = imagePaths.length > 1;
  const imageLines = imagePaths.map((p, i) => `  ${i + 1}. ${p}`).join('\n');
  const intro = isMulti
    ? `You are given ${imagePaths.length} photos of the SAME packaged food, taken from different sides (e.g. the front/marketing face and the back nutrition-facts panel):
${imageLines}

Read EVERY image, then combine what you see into a single product. The brand and product name are usually on the FRONT/marketing face; the calories, macros and nutrient amounts are on the nutrition-facts panel. Take each field from whichever image shows it most clearly. Write a single JSON object to ${outputPath}.`
    : `Read the nutrition label image at ${imagePaths[0]}. Extract the nutrition facts and write a single JSON object to ${outputPath}.`;
  return `${intro}

JSON shape (strict — extra/misnamed keys break the consumer):
{
  "name": string,
  "brand": string,
  "barcode_upc": string | null,
  "icon": string | null,
  "serving_size_stated": boolean,
  "servings": [{ "unit": string, "units_per_serving": number }, ...],
  "kcal_per_serving": number | null,
  "protein_g_per_serving": number | null,
  "carbs_g_per_serving": number | null,
  "fat_g_per_serving": number | null,
  "nutrients_by_code": { "<code>": number, ... }
}

Rules:
- NUTRITION SOURCE OF TRUTH: only read calories / macros / nutrients from an actual Nutrition Facts or Supplement Facts panel that EXPLICITLY states a serving size (e.g. "Serving size 2 tbsp (30g)", "Serving size 1 capsule"). Set "serving_size_stated": true ONLY when such a panel with a stated serving size is visible.
- If there is NO facts panel with a stated serving size, set "serving_size_stated": false AND emit null for kcal/protein/carbs/fat and an empty {} for nutrients_by_code. Still return name, brand and barcode_upc if visible.
- NEVER take macro/nutrient numbers from front-of-pack marketing claims (a big "24g PROTEIN" callout, "High Protein", "Now with Caffeine", "Excellent source of fiber", etc.). Those are not per-serving sources of truth — ignore them entirely for nutrition.
- All macro & nutrient values are PER SERVING (not per container, not per 100g).
- A value the label lists as "0g"/"0mg" → emit 0. A value the label does NOT list → emit null (macros) or omit from nutrients_by_code (nutrients).
- "<1g" → emit 0.5.
- name / brand: extract from the package if visible (prefer the front/marketing face for the brand and product name); otherwise empty string "".
- barcode_upc: if a product barcode is visible, emit the digits printed beneath it (the 8/12/13-digit UPC/EAN number) as a string of digits only — no spaces or dashes. If no barcode/number is legible, emit null.
- icon: pick the single best-fitting icon code for this food from this exact list: ${iconList}. Choose by category (e.g. a soda/energy drink → cup-soda, a chocolate/candy bar → candy, a cookie/biscuit → cookie, chicken → drumstick, a leafy salad → salad, coffee → coffee, milk → milk, beer → beer, wine → wine). Emit exactly one code from the list, or null if none is a reasonable match. Never invent a code not in the list.
- servings.unit must be one of: ${unitsList}. If the label says "1 Cup (240mL)" emit BOTH rows: [{"unit":"cup","units_per_serving":1},{"unit":"ml","units_per_serving":240}]. If a unit on the label is not in that list, drop that row. If no recognizable serving info, emit [{"unit":"g","units_per_serving":0}].
- nutrients_by_code keys must be from this exact list: ${codesList}. Values are in the standard unit for that nutrient (g for fiber/sugars/fats, mg for sodium/calcium/iron/potassium/magnesium/phosphorus/etc., mcg for vitamin D/B12/folate/biotin/iodine/selenium/chromium/molybdenum/vitamin A/K). Do NOT include calories/protein/carbs/fat here — those go in the top-level macro fields.
- If the label only shows %DV for a nutrient, back-calculate using FDA 2016 Daily Values (e.g. phosphorus 10% × 1250mg = 125mg).
- When (and only when) serving_size_stated is true, don't stop at the nutrition-facts panel: also read the INGREDIENTS list and any SUPPLEMENT FACTS panel for trackable nutrients in the known-codes list. Some actives — caffeine above all — are usually declared there (e.g. "Caffeine 200mg", "Caffeine (from green tea extract) 150mg", "Caffeine Anhydrous 150mg") rather than in the nutrition facts. When an ingredient names a known-code nutrient WITH an explicit per-serving amount, emit it in nutrients_by_code under its code (caffeine in mg). Only emit a quantified amount — if an ingredient is listed by name with no amount, omit it (do not guess). A caffeine pill's Supplement Facts panel that states "Serving size 1 capsule" counts as serving_size_stated=true even if caffeine is the only line.

Write valid JSON only — no prose, no markdown fences, no explanation. After writing the file, output the single word "done".`;
}

// Spawns the Claude CLI in print-mode with Read+Write tools auto-allowed, asks it
// to OCR one OR MORE images of the same packaged food (e.g. front + back) and emit
// a strict JSON draft, then parses and returns the draft. Reading multiple sides
// lets the model pull the brand/name off the front while still getting nutrition
// off the facts panel. Throws on timeout, non-zero exit, missing output file, or
// invalid JSON shape. Designed as a drop-in replacement for parseLabelImage().
export async function parseLabelImageWithLLM(opts: {
  imagePaths: string[];
  knownUnits: Set<string>;
}): Promise<LabelOcrDraft> {
  const { imagePaths, knownUnits } = opts;
  if (imagePaths.length === 0) throw new Error('parseLabelImageWithLLM: no image paths provided');
  const tmpDir = join(process.cwd(), '.tmp');
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });

  const outputPath = join(tmpDir, `forage-label-llm-${randomUUID()}.json`);
  const prompt = buildPrompt(imagePaths, outputPath, knownUnits);

  return new Promise<LabelOcrDraft>((resolve, reject) => {
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
        reject(new Error(`claude CLI exited with code ${code}: ${(stderr || stdout).trim().slice(0, 400)}`));
        return;
      }
      if (!existsSync(outputPath)) {
        reject(new Error(`claude CLI finished but did not write ${outputPath}. stdout: ${stdout.trim().slice(0, 400)}`));
        return;
      }
      try {
        const raw = readFileSync(outputPath, 'utf8');
        // Tolerate leading/trailing whitespace, accidental ```json fences, and a "done"
        // tail that Claude sometimes appends inside the file.
        const cleaned = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        const draft = coerceDraft(parsed, knownUnits);
        try { unlinkSync(outputPath); } catch {}
        console.log(`[ForageOCR-LLM] draft: ${JSON.stringify(draft)}`);
        resolve(draft);
      } catch (err: any) {
        reject(new Error(`claude CLI wrote invalid JSON to ${outputPath}: ${err?.message ?? err}`));
      }
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// Defensively coerce the LLM's JSON to the LabelOcrDraft shape. Drops unknown
// nutrient codes / units, clamps types, fills required fields with safe defaults.
// Anything that can't be coerced becomes null/empty so the modal still loads.
// Exported so the source-link import (foodUrlLLM) coerces identically — both
// paths produce the same draft the food form consumes.
export function coerceDraft(raw: any, knownUnits: Set<string>): LabelOcrDraft {
  const name = typeof raw?.name === 'string' ? raw.name : '';
  const brand = typeof raw?.brand === 'string' ? raw.brand : '';

  // Keep digits only (the printed UPC/EAN), so "0 12345 67890 5" → "012345678905".
  // Empty/unreadable → null. zbar's decode in parseLabelImage takes precedence
  // over this when it succeeds.
  const barcodeRaw = typeof raw?.barcode_upc === 'string' ? raw.barcode_upc.replace(/\D/g, '') : '';
  const barcode_upc = barcodeRaw.length >= 8 ? barcodeRaw : null;

  // Only accept an icon the renderer actually knows; anything else → null.
  const icon = typeof raw?.icon === 'string' && FOOD_ICON_CODES.includes(raw.icon) ? raw.icon : null;

  const servingsIn: any[] = Array.isArray(raw?.servings) ? raw.servings : [];
  const servings = servingsIn
    .map((s) => ({
      unit: typeof s?.unit === 'string' ? s.unit.trim().toLowerCase() : '',
      units_per_serving: Number(s?.units_per_serving),
    }))
    .filter((s) => s.unit && knownUnits.has(s.unit) && Number.isFinite(s.units_per_serving) && s.units_per_serving > 0);
  if (servings.length === 0) {
    servings.push({ unit: 'g', units_per_serving: 0 });
  }

  // Nutrition is only trustworthy from a real facts panel with a stated serving
  // size. When the model didn't see one, hard-drop all nutrition (regardless of
  // what it emitted) so front-of-pack marketing claims ("24g PROTEIN!") can never
  // leak in. name / brand / barcode still pass through.
  const serving_size_stated = raw?.serving_size_stated === true;

  const kcal_per_serving      = serving_size_stated ? coerceNumberOrNull(raw?.kcal_per_serving) : null;
  const protein_g_per_serving = serving_size_stated ? coerceNumberOrNull(raw?.protein_g_per_serving) : null;
  const carbs_g_per_serving   = serving_size_stated ? coerceNumberOrNull(raw?.carbs_g_per_serving) : null;
  const fat_g_per_serving     = serving_size_stated ? coerceNumberOrNull(raw?.fat_g_per_serving) : null;

  const nutrients_by_code: Record<string, number> = {};
  const known = new Set<string>(KNOWN_NUTRIENT_CODES);
  if (serving_size_stated && raw?.nutrients_by_code && typeof raw.nutrients_by_code === 'object') {
    for (const [code, v] of Object.entries(raw.nutrients_by_code)) {
      if (!known.has(code)) continue;
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) nutrients_by_code[code] = n;
    }
  }

  return { name, brand, barcode_upc, icon, serving_size_stated, servings, kcal_per_serving, protein_g_per_serving, carbs_g_per_serving, fat_g_per_serving, nutrients_by_code };
}

function coerceNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
