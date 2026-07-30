import { LabelOcrDraft } from '../types/labelOcr';
import { DAILY_VALUES as LEDGER_DAILY_VALUES, MACRO_BY_KEY, type NutrientCode } from '../utils/nutrientLedger';

// Maps text-on-the-label phrases to the nutrient `code` values (typed against the
// ledger so a typo'd or renamed code is caught at compile time). Patterns are
// matched against lower-cased, normalized OCR text. Order doesn't matter — the
// parser picks the first nutrient whose regex appears on a given line.
const NUTRIENT_PATTERNS: Array<{ code: NutrientCode; unit: 'mg' | 'mcg' | 'g'; pattern: RegExp }> = [
  // Vitamins
  { code: 'vit_a',       unit: 'mcg', pattern: /vitamin\s*a\b|vit\.?\s*a\b/i },
  { code: 'vit_c',       unit: 'mg',  pattern: /vitamin\s*c\b|vit\.?\s*c\b|ascorbic\s*acid/i },
  { code: 'vit_d',       unit: 'mcg', pattern: /vitamin\s*d\b|vit\.?\s*d\b/i },
  { code: 'vit_e',       unit: 'mg',  pattern: /vitamin\s*e\b|vit\.?\s*e\b/i },
  { code: 'vit_k',       unit: 'mcg', pattern: /vitamin\s*k\b|vit\.?\s*k\b/i },
  { code: 'thiamin',     unit: 'mg',  pattern: /thiami(?:n|ne)\b|vitamin\s*b\s*1\b/i },
  { code: 'riboflavin',  unit: 'mg',  pattern: /riboflavin\b|vitamin\s*b\s*2\b/i },
  { code: 'niacin',      unit: 'mg',  pattern: /niacin\b|niacinamide\b|vitamin\s*b\s*3\b/i },
  { code: 'vit_b6',      unit: 'mg',  pattern: /vitamin\s*b\s*6\b|pyridoxine/i },
  { code: 'folate',      unit: 'mcg', pattern: /folate\b|folic\s*acid|vitamin\s*b\s*9\b/i },
  { code: 'vit_b12',     unit: 'mcg', pattern: /vitamin\s*b\s*12\b|cobalamin/i },
  { code: 'biotin',      unit: 'mcg', pattern: /biotin\b|vitamin\s*b\s*7\b/i },
  { code: 'pantothenic', unit: 'mg',  pattern: /pantothenic\s*acid|vitamin\s*b\s*5\b/i },
  { code: 'choline',     unit: 'mg',  pattern: /choline\b/i },
  // Minerals — `iron` allows no separator (OCR drops the space: "iron2.7mg") and
  // accepts a leading lowercase L since Tesseract often confuses I→l in serif/blocky
  // fonts ("Iron 1.7mg" → "lron 1.7mg").
  { code: 'calcium',     unit: 'mg',  pattern: /calcium\b/i },
  { code: 'iron',        unit: 'mg',  pattern: /[il]ron(?:\b|\d)/i },
  { code: 'magnesium',   unit: 'mg',  pattern: /magnesium\b/i },
  { code: 'phosphorus',  unit: 'mg',  pattern: /phosphorus\b/i },
  // 'potassium' tolerates severe OCR mangling of the middle letters since the word
  // sits in the small-print column and gets corrupted often: "Phlassium", "Prtacsium",
  // "Potacsim", etc. all match. Guard: must start with 'p', be 6-12 chars, and end
  // with the -ium / -im suffix so we don't false-match unrelated words ("Premium",
  // "Pavilion" — "Premium" is 7 chars but only has 3 letters between p and ium).
  { code: 'potassium',   unit: 'mg',  pattern: /\bp[a-z]{4,8}(?:ssium|ium|im)\b/i },
  { code: 'sodium',      unit: 'mg',  pattern: /sodium\b/i },
  { code: 'zinc',        unit: 'mg',  pattern: /zinc\b/i },
  { code: 'copper',      unit: 'mg',  pattern: /copper\b/i },
  { code: 'manganese',   unit: 'mg',  pattern: /manganese\b/i },
  { code: 'selenium',    unit: 'mcg', pattern: /selenium\b/i },
  { code: 'iodine',      unit: 'mcg', pattern: /iodine\b/i },
  { code: 'chromium',    unit: 'mcg', pattern: /chromium\b/i },
  { code: 'molybdenum',  unit: 'mcg', pattern: /molybdenum\b/i },
  { code: 'chloride',    unit: 'mg',  pattern: /chloride\b/i },
  // Other macros — tolerant patterns for common OCR letter swaps (Saturated→Safutated,
  // Cholesterol→Gholesterel). One missing/swapped char per word is allowed.
  { code: 'fiber',       unit: 'g',   pattern: /dietary\s*fib(?:er|re)|^fib(?:er|re)\b/i },
  { code: 'sugar_added', unit: 'g',   pattern: /added\s*sug(?:ar|ars)|incl(?:\.|udes)?\s+\S+\s*added\s*sug/i },
  { code: 'sugar_total', unit: 'g',   pattern: /(?:total\s*)?sug(?:ar|ars)\b/i },
  { code: 'sat_fat',     unit: 'g',   pattern: /s[ae]?[a-z]?[utf][ufrt]rated\s*fat|sat\.?\s*fat/i },
  { code: 'trans_fat',   unit: 'g',   pattern: /trans\s*fat/i },
  { code: 'cholesterol', unit: 'mg',  pattern: /[cg]hol[a-z]{2,8}rol\b|[cg]holest/i },
  // Caffeine has no FDA Daily Value (not a required-on-label nutrient), so it has
  // no DAILY_VALUES entry below — parsing relies on the explicit "Xmg" reading.
  { code: 'caffeine',    unit: 'mg',  pattern: /caffeine\b/i },
];

// FDA 2016 Daily Values used to back out absolute amounts when a label gives only %DV
// — or when the absolute on the label has been mangled by OCR but the %DV is still
// readable. From the ledger (single source of truth). Cast to a string index so the
// `DAILY_VALUES[code]` lookup (and no-DV codes like caffeine) stay ergonomic.
const DAILY_VALUES = LEDGER_DAILY_VALUES as Record<string, number | undefined>;

// Macro DVs (in grams) from the ledger's MACROS. Used the same way as DAILY_VALUES
// — recover the absolute value from a %DV when the OCR'd absolute is suspicious.
const MACRO_DAILY_VALUES: Record<'protein' | 'carbs' | 'fat', number> = {
  fat: MACRO_BY_KEY.fat.dv!,
  carbs: MACRO_BY_KEY.carbs.dv!,
  protein: MACRO_BY_KEY.protein.dv!,
};

// Normalizes OCR text — quote cleanup + character substitutions for the small set of
// well-known Tesseract confusions that ONLY make sense as digits in the context of a
// nutrition unit suffix. Restricted to "<char><unit>" patterns so we don't accidentally
// rewrite letters in a real word ("Iron", "log", etc.). Examples handled:
//   "Protein ig"   → "Protein 1g"     (i misread as 1)
//   "Sat Fat Og"   → "Sat Fat 0g"     (O misread as 0)
//   "Total Fat 2.5¢" → "Total Fat 2.5g" (¢ misread as g — common when g sits next to %)
function normalize(line: string): string {
  return line
    .replace(/[“”"„]/g, '"')
    .replace(/[‘’]/g, "'")
    // Strip leading sidebar / box-border noise. PSM 6 routinely OCRs the vertical
    // border of a nutrition-facts box as "| ", "} ", "\\ ", "DP ] ", etc. on the
    // line, which then defeats `^header\b` anchors in macro patterns
    // ("| Total Fat 3.5g" → "^fat\b" misses; "| Protein 10g" → "^protein\b" misses).
    // Only strips a leading run of clearly-noise characters; never digits or letters,
    // so real content like "1 cup" still anchors correctly.
    .replace(/^[\s|\\\/\-\.\*\>\<\(\)\{\}\[\]_]+/, '')
    // Lone letter standing in for a digit immediately before a unit suffix.
    // Includes 'meg' and 'mca' since OCR often mangles 'mcg' that way and we still
    // want "Vitamin D Omeg" to normalize to "Vitamin D 0meg" so the amount extractor
    // can pull out an explicit zero.
    .replace(/\b[iIl](?=(?:mg|mcg|mca|meg|g|%)\b)/g, '1')
    .replace(/\b[Oo](?=(?:mg|mcg|mca|meg|g|%)\b)/g, '0')
    // OCR sometimes reads the "g" suffix as "¢" / "€" / "£" / "9" when adjacent to a
    // bold percent column. Restrict to single-char rewrites following a digit.
    .replace(/(\d(?:\.\d+)?)\s*[¢€£](?=\s|$|\d|%)/g, '$1g')
    // PSM 4 occasionally merges the "% Daily Value" column header into the first
    // macro row, e.g. "Total Fat 2.5g" gets read as "Total Fat 2.59 % Daily Values".
    // The trailing "9" is the lost g — restore it when followed by " % <letter>" so
    // we don't clobber legitimate "9 %" %DV cells (which are followed by digits / EOL,
    // not a letter).
    .replace(/(\d+(?:\.\d+)?)9\b(?=\s+%\s*[A-Za-z])/g, '$1g')
    // Same g→9 confusion inside a parenthesized weight, e.g. "Serving size 1 Bun (66g)"
    // gets OCR'd as "(669)". Restore the g when a digit-run sits flush against "9)".
    // Safe: a legit weight ending in "9" would have its unit outside the parens
    // ("(150 g)") or use a different form, not "(N9)".
    .replace(/(\d)9\)/g, '$1g)')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pulls "12.5 g" / "200 mg" / "30 mcg" from a line — looking for the absolute amount
// with its unit attached. Returns null when no unit-anchored value is on the line.
function extractAmountWithUnit(line: string, expectedUnit: 'mg' | 'mcg' | 'g'): number | null {
  const unitPattern = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${expectedUnit}\\b`, 'i');
  const m = line.match(unitPattern);
  if (m) return parseFloat(m[1]);
  // OCR often mangles "mcg" → "meg" / "mca" / "ug" / "µg".
  if (expectedUnit === 'mcg') {
    const alt = line.match(/(\d+(?:\.\d+)?)\s*(?:meg|mca|mc[ageo]|µg|ug)\b/i);
    if (alt) return parseFloat(alt[1]);
  }
  return null;
}

// Collects every "real number" on a line, excluding percentages and digit-suffix groups
// (e.g. in "Total Fat 259 33%" returns [259], not [259, 33, 3]). The lookbehind/lookahead
// pair prevents partial-digit captures via greedy-regex backtracking.
function listBareNumbers(line: string): number[] {
  const re = /(?<![\d.])(\d+(?:\.\d+)?)(?![\d.])(?!\s*%)/g;
  return [...line.matchAll(re)].map((m) => parseFloat(m[1]));
}

function extractPercentDV(line: string): number | null {
  // Tolerate "30 %" (Tesseract sometimes injects space) and a trailing junk char that
  // gets read as part of the percent (e.g. "8%*"). "21%" first match wins.
  const m = line.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

// Reads "Calories" line. Calories are reported as a bare integer on US labels, often on
// its own line with "Calories" alone above the number, or as "Calories 230". Returns
// null when the calories field is not on the label so the modal can show its placeholder.
function extractCalories(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/calorie/i.test(line)) continue;
    const same = line.match(/calorie[s]?\s*[:]?\s*(\d{1,4})/i);
    if (same) return parseInt(same[1], 10);
    const next = lines[i + 1]?.match(/^\s*(\d{1,4})\s*$/);
    if (next) return parseInt(next[1], 10);
    // On rotated / cramped labels Tesseract sometimes places the calories number
    // on the line ABOVE the "Calories" label (e.g. "Amount per serving 200" then
    // "Calories ." on the next line). Look one line up for a bare 1-4 digit number,
    // optionally preceded by the "Amount per serving" header.
    const prev = lines[i - 1];
    if (prev) {
      const prevBare = prev.match(/^\s*(?:amount\s*per\s*serving\s*)?(\d{1,4})\s*$/i);
      if (prevBare) return parseInt(prevBare[1], 10);
      const prevTrailing = prev.match(/amount\s*per\s*serving\s+(\d{1,4})\b/i);
      if (prevTrailing) return parseInt(prevTrailing[1], 10);
    }
  }
  return null;
}

// Parses every "<number> <unit>" pair near the "Serving Size" line and filters to
// the units that exist in the food_units table (passed by the caller as a lowercase
// Set). Examples:
//   "Serving size 1 cup (240 mL)"   →  [{cup, 1}, {ml, 240}]   (both in DB)
//   "Serving size 2 tbsp (32g)"     →  [{tbsp, 2}, {g, 32}]
//   "Serving Size 28g"              →  [{g, 28}]
//   "Serving Size 1 Gordita"        →  [{unit, 1}]             (Gordita not in DB; line still
//                                                               had a quantity → falls through
//                                                               to the "1 unit" inference if
//                                                               the literal "unit" is in DB)
//   "Serving Size:\n + Gordita"     →  [{unit, 1}]             (multi-line OCR pattern)
// Returns [{g, 0}] when nothing recognizable is found so the modal still gets a row.
function extractServings(
  text: string,
  lines: string[],
  knownUnits: Set<string>
): Array<{ unit: string; units_per_serving: number }> {
  // Build the parse window: the serving-size line, plus up to 2 continuation lines,
  // stopping as soon as we hit a recognizable next-section header. Without the early
  // stop, "Total Fat 2g" on the line below could leak a bogus `{g, 2}` row into the
  // serving list.
  const idx = lines.findIndex((l) => /serving\s*size/i.test(l));
  if (idx < 0) {
    // Fallback: OCR sometimes mangles the literal "Serving size" beyond recognition
    // (e.g. "P ngsize 1 Bun (66g)"). Look for the canonical parenthesized weight
    // "(66g)" / "(28 g)" / "(240ml)" anywhere in the top portion of the label —
    // before the macro section starts — and use that as the gram/ml serving.
    const TOP_STOP = /^(saturated|trans\s*fat|cholesterol|sodium|total\s*carb|dietary\s*fib|protein\b|vitamin|calcium|iron|potass)/i;
    for (const line of lines) {
      if (TOP_STOP.test(line)) break;
      const paren = line.match(/\(\s*(\d+(?:\.\d+)?)\s*(g|ml)\s*\)/i);
      if (paren) {
        const unit = paren[2].toLowerCase();
        if (knownUnits.has(unit)) {
          return [{ unit, units_per_serving: parseFloat(paren[1]) }];
        }
      }
    }
    return [{ unit: 'g', units_per_serving: 0 }];
  }
  const STOP = /^(amount\s*per|calories\b|servings?\s*per|%\s*daily|total\s*fat|saturated|trans\s*fat|cholesterol|sodium|total\s*carb|carbohydrate|dietary\s*fib|sugars?\b|protein\b|vitamin|calcium|iron|potass)/i;
  const ctxLines: string[] = [lines[idx]];
  for (let j = idx + 1; j < lines.length && ctxLines.length < 3; j++) {
    if (STOP.test(lines[j])) break;
    ctxLines.push(lines[j]);
  }
  const stripped = ctxLines
    .join(' ')
    .replace(/serving\s*size\s*[:.]?/i, '')
    .replace(/[()]/g, ' ');

  // Collect every "<n> <word>" pair. The word may be a multi-token unit name (only
  // "fl oz" today) so try the two-word form first.
  const pairs: Array<{ unit: string; units_per_serving: number }> = [];
  const seen = new Set<string>();

  const re = /(\d+(?:[./]\d+)?)\s*(fl\s*oz|[A-Za-z]+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    const num = parseFraction(m[1]);
    if (!Number.isFinite(num) || num <= 0) continue;
    const raw = m[2].toLowerCase().replace(/\s+/g, ' ');
    // Skip numeric-context words that aren't UOMs ("about", "approximately").
    if (raw === 'about' || raw === 'approx' || raw === 'approximately') continue;
    if (!knownUnits.has(raw)) continue; // strict: drop UOMs not registered in food_units
    if (seen.has(raw)) continue;
    seen.add(raw);
    pairs.push({ unit: raw, units_per_serving: num });
  }
  if (pairs.length > 0) return pairs;

  // Header and value on separate OCR lines (spinner digit dropped or read as "+"):
  // "Serving Size:" then a line of plain letters. Use the generic 'unit' if it's
  // present in food_units, else fall through.
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*serving\s*size\s*[:.]?\s*$/i.test(lines[i])) continue;
    const next = lines[i + 1] ?? '';
    if (/[A-Za-z]/.test(next) && knownUnits.has('unit')) {
      return [{ unit: 'unit', units_per_serving: 1 }];
    }
  }
  return [{ unit: 'g', units_per_serving: 0 }];
}

function parseFraction(s: string): number {
  if (/\//.test(s)) {
    const [a, b] = s.split('/').map(parseFloat);
    return b ? a / b : 0;
  }
  return parseFloat(s);
}

// Main entry. Takes the raw Tesseract output (multi-line text) plus the set of
// unit names that exist in food_units (lowercase) and returns the draft shape the
// modal consumes.
export function parseNutritionText(rawText: string, knownUnits: Set<string>): LabelOcrDraft {
  const lines = rawText
    .split(/\r?\n/)
    .map(normalize)
    .filter((l) => l.length > 0);

  const text = lines.join('\n');

  const kcal = extractCalories(lines);
  const servings = extractServings(text, lines, knownUnits);
  // A real serving size was parsed (not the [g,0] fallback) → treat this as a
  // legitimate facts panel. Mirrors the LLM path: without a stated serving size
  // we don't trust any nutrition reading (could be front-of-pack marketing).
  const servingSizeStated = servings.some((s) => s.units_per_serving > 0);

  // Macros — same aggregation as nutrients_by_code (collect every candidate across
  // both PSM passes, then pick best per kind).
  const macros = {
    protein_g_per_serving: extractMacroValue(lines, /^protein\b/i, 'protein'),
    carbs_g_per_serving:   extractMacroValue(lines, /^(?:total\s*)?carbohydrate(?:s)?\b|^total\s*carb/i, 'carbs'),
    fat_g_per_serving:     extractMacroValue(lines, /^(?:total\s*)?fat\b/i, 'fat'),
  };

  // Collect every candidate reading for each nutrient code across all lines and
  // both PSM passes, classified by source. Then pick the best per code in a second
  // pass so a noisy first hit can't outrank a clean later one.
  const candidatesByCode = new Map<string, Array<{ value: number; source: 'direct' | 'derived' }>>();
  for (const line of lines) {
    if (line.length > 80) continue; // long ingredient lists confuse the matcher
    for (const { code, unit, pattern } of NUTRIENT_PATTERNS) {
      if (!pattern.test(line)) continue;
      const reading = readNutrient(line, unit, code);
      if (reading === null) break;
      const bucket = candidatesByCode.get(code) ?? [];
      bucket.push(reading);
      candidatesByCode.set(code, bucket);
      break;
    }
  }
  const nutrients_by_code: Record<string, number> = {};
  for (const [code, readings] of candidatesByCode) {
    const best = pickBestReading(readings);
    if (best !== null) nutrients_by_code[code] = best;
  }

  return {
    name: '',
    brand: '',
    // Tesseract reads only the nutrition panel; the UPC is decoded separately by
    // zbarimg in parseLabelImage and merged onto the draft there.
    barcode_upc: null,
    // Icon selection is a vision-model job; the OCR fallback can't infer one.
    icon: null,
    serving_size_stated: servingSizeStated,
    servings,
    // Drop all nutrition unless a serving size was actually parsed.
    kcal_per_serving: servingSizeStated ? kcal : null,
    protein_g_per_serving: servingSizeStated ? macros.protein_g_per_serving : null,
    carbs_g_per_serving: servingSizeStated ? macros.carbs_g_per_serving : null,
    fat_g_per_serving: servingSizeStated ? macros.fat_g_per_serving : null,
    nutrients_by_code: servingSizeStated ? nutrients_by_code : {},
  };
}

// Collects a candidate (value, source) reading from a single nutrient-matched line.
// 'direct' = unit-anchored "<n><unit>" read (most trustworthy). 'derived' = %DV ×
// DV when the absolute value didn't OCR cleanly. Returns null when neither yields
// a value (nutrient line was present but had no parseable number).
function readNutrient(
  line: string,
  unit: 'mg' | 'mcg' | 'g',
  code: string
): { value: number; source: 'direct' | 'derived' } | null {
  return readWithSanity(line, () => extractAmountWithUnit(line, unit), DAILY_VALUES[code]);
}

// Reconciles a unit-anchored "direct" read against the %DV-derived value on the
// same line. Centralizes the OCR sanity rule used by both nutrient and macro paths:
//   - direct alone: trust it
//   - direct AND pct present, agree (direct ≤ 2.5× pct): trust direct (more precise,
//     since the absolute usually has a digit Tesseract didn't have to invert)
//   - direct AND pct present, direct >> pct: trust pct. This catches the
//     dropped-decimal failure mode — "Total Fat 3.5g 4%" → OCR sees "35g" while the
//     %DV column still reads "4%". 4% × 78g DV = 3.12g, which is ~10× smaller than
//     35 — that mismatch is the signal that the decimal was lost.
//   - only pct: derived
//   - neither: null
function readWithSanity(
  line: string,
  getDirect: () => number | null,
  dv: number | undefined
): { value: number; source: 'direct' | 'derived' } | null {
  const direct = getDirect();
  const pct = extractPercentDV(line);
  const pctVal = pct !== null && dv ? round3((pct / 100) * dv) : null;
  if (direct !== null && direct >= 0) {
    if (pctVal !== null && pctVal > 0 && direct > pctVal * 2.5) {
      return { value: pctVal, source: 'derived' };
    }
    return { value: direct, source: 'direct' };
  }
  // Direct unit-anchored read missed — usually because the "g"/"mg" suffix got
  // OCR-mangled into a digit ("Total Fat 2.5g" → "Total Fat 2.52"). Fall back to
  // bare-number-vs-%DV reconciliation: if the lone bare number on the line agrees
  // with the %DV-back-calculated value, trust the bare number (the digits before
  // the unit usually survive OCR even when the unit doesn't); otherwise use the
  // derived value (bare is probably a different-line contaminant).
  const derived = chooseFromBareAndPct(line, dv);
  if (derived !== null) return { value: derived, source: 'derived' };
  return null;
}

// Picks the best value across all candidate readings for a single nutrient code.
// Direct (unit-anchored) reads always beat derived (%DV-back-calculated) reads.
// Among direct reads, pick the MINIMUM — when PSM 4 and PSM 6 disagree, the larger
// reading is almost always OCR junk: trailing underline read as a digit
// ("Total Sugars 4g" → "49g") or a column-header letter merged into the value.
// Among derived reads only, take the first (they'll be close, all share the same DV).
function pickBestReading(readings: Array<{ value: number; source: 'direct' | 'derived' }>): number | null {
  if (readings.length === 0) return null;
  const direct = readings.filter((r) => r.source === 'direct');
  if (direct.length > 0) return Math.min(...direct.map((r) => r.value));
  return readings[0].value;
}

// Macro extractor — same aggregation contract as nutrients. Collects every reading
// across all lines that match the header (both PSM passes' rows show up here) and
// picks the best with the shared pickBestReading rule.
function extractMacroValue(lines: string[], header: RegExp, kind: 'protein' | 'carbs' | 'fat'): number | null {
  const readings: Array<{ value: number; source: 'direct' | 'derived' }> = [];
  for (const line of lines) {
    if (!header.test(line)) continue;
    const reading = readWithSanity(line, () => extractAmountWithUnit(line, 'g'), MACRO_DAILY_VALUES[kind]);
    if (reading !== null) readings.push(reading);
  }
  return pickBestReading(readings);
}

// When the unit-anchored read fails, decide between the bare number on the line and
// the %DV-derived value:
//   - Both present & agree (within ~25%): use bare (more precise, OCR kept the digits).
//   - Both present & disagree: use %DV (bare is probably contaminated by a trailing
//     OCR-inserted digit, e.g. "Total Fat 269 33%" — bare 269, %DV gives ~26).
//   - Only one present: use it.
//   - Neither: return null.
// A "0%" %DV is treated as "this nutrient is on the label and is zero" so the caller
// can record an explicit 0 rather than dropping the field.
function chooseFromBareAndPct(line: string, dv: number | undefined): number | null {
  const numbers = listBareNumbers(line);
  const bare = numbers.length === 1 ? numbers[0] : null;
  const pct = extractPercentDV(line);
  const pctVal = pct !== null && dv ? round3((pct / 100) * dv) : null;

  if (bare !== null && pctVal !== null) {
    if (bare === 0 && pctVal === 0) return 0;
    const denom = Math.max(bare, pctVal);
    const diff = Math.abs(bare - pctVal) / (denom || 1);
    return diff <= 0.25 ? bare : pctVal;
  }
  if (bare !== null) return bare;
  if (pctVal !== null) return pctVal;
  return null;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
