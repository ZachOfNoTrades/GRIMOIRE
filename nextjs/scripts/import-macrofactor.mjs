#!/usr/bin/env node
// One-shot: parse two MacroFactor xlsx workbooks and POST to /modules/forage/api/import
// with the internal API key. Run from `nextjs/` so node_modules/xlsx resolves.

import { readFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';

// Pull the same parser the modal uses so the modal and CLI produce identical payloads.
// The modal imports it via TS; we replicate the small parser inline here to avoid
// dragging tsx/ts-node into the runner. Keep this in sync with utils/importUtils.ts.

const NUTRIENT_COLUMN_TO_CODE = {
  'B12, Cobalamin (mcg)': 'vit_b12',
  'B1, Thiamine (mg)': 'thiamin',
  'B2, Riboflavin (mg)': 'riboflavin',
  'B3, Niacin (mg)': 'niacin',
  'B5, Pantothenic Acid (mg)': 'pantothenic',
  'B6, Pyridoxine (mg)': 'vit_b6',
  'Caffeine (mg)': 'caffeine',
  'Calcium (mg)': 'calcium',
  'Cholesterol (mg)': 'cholesterol',
  'Choline (mg)': 'choline',
  'Copper (mg)': 'copper',
  'Saturated Fat (g)': 'sat_fat',
  'Trans Fat (g)': 'trans_fat',
  'Fiber (g)': 'fiber',
  'Folate (mcg)': 'folate',
  'Iron (mg)': 'iron',
  'Magnesium (mg)': 'magnesium',
  'Manganese (mg)': 'manganese',
  'Phosphorus (mg)': 'phosphorus',
  'Potassium (mg)': 'potassium',
  'Selenium (mcg)': 'selenium',
  'Sodium (mg)': 'sodium',
  'Sugars (g)': 'sugar_total',
  'Sugars Added (g)': 'sugar_added',
  'Vitamin A (mcg)': 'vit_a',
  'Vitamin C (mg)': 'vit_c',
  'Vitamin D (mcg)': 'vit_d',
  'Vitamin E (mg)': 'vit_e',
  'Vitamin K (mcg)': 'vit_k',
  'Zinc (mg)': 'zinc',
};

function parseDate(value) {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('/');
  if (parts.length === 3) {
    const m = parseInt(parts[0], 10), d = parseInt(parts[1], 10), y = parseInt(parts[2], 10);
    if (Number.isFinite(m) && Number.isFinite(d) && Number.isFinite(y)) {
      return new Date(y, m - 1, d);
    }
  }
  const fb = new Date(trimmed);
  return isNaN(fb.getTime()) ? null : fb;
}

function dateToIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseTime(value) {
  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:${String(value.getSeconds()).padStart(2, '0')}`;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(`1970-01-01 ${value.trim()}`);
    if (!isNaN(parsed.getTime())) {
      return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}:00`;
    }
  }
  return '12:00:00';
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function num(v, fallback = 0) {
  const n = numOrNull(v);
  return n === null ? fallback : n;
}

function sheetToObjects(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
}

// food_servings.unit is nvarchar(16); truncate MF's longer unit strings so they
// fit. Entries reference servings by unit, so we must truncate identically here.
function truncUnit(s) {
  return (s ?? '').slice(0, 16);
}

function extractNutrients(row, divisor = 1) {
  const out = [];
  for (const [col, code] of Object.entries(NUTRIENT_COLUMN_TO_CODE)) {
    const v = numOrNull(row[col]);
    if (v === null) continue;
    out.push({ code, amount: divisor > 0 ? v / divisor : v });
  }
  return out;
}

function parseWorkbooks(bufA, bufB) {
  const wbA = XLSX.read(bufA, { type: 'buffer', cellDates: true });
  const wbB = XLSX.read(bufB, { type: 'buffer', cellDates: true });

  const errors = [];

  const profileRows = sheetToObjects(wbA, 'User Profile');
  const userEmail =
    profileRows.length > 0 && typeof profileRows[0].Email === 'string'
      ? profileRows[0].Email.trim().toLowerCase()
      : '';
  if (!userEmail) errors.push('User Profile sheet missing Email');

  const foodByName = new Map();

  const recipeRows = sheetToObjects(wbA, 'Recipes');
  for (const r of recipeRows) {
    const name = typeof r['Recipe Name'] === 'string' ? r['Recipe Name'].trim() : '';
    if (!name) continue;
    const servingQty = num(r['Serving Qty'], 0);
    const kcal = num(r['Calories (kcal)']);
    if (servingQty <= 0 || kcal <= 0) continue;
    foodByName.set(name.toLowerCase(), {
      name,
      brand: null,
      source: 'recipe',
      kcal_per_serving: kcal / servingQty,
      protein_g_per_serving: num(r['Protein (g)']) / servingQty,
      carbs_g_per_serving: num(r['Carbs (g)']) / servingQty,
      fat_g_per_serving: num(r['Fat (g)']) / servingQty,
      servings: [{ unit: 'serving', units_per_serving: 1 }],
      nutrients: extractNutrients(r, servingQty),
    });
  }

  const customRows = sheetToObjects(wbA, 'Custom Foods');
  for (const r of customRows) {
    const name = typeof r['Food Name'] === 'string' ? r['Food Name'].trim() : '';
    if (!name) continue;
    const key = name.toLowerCase();
    if (foodByName.has(key)) continue;
    const unit = truncUnit(typeof r['Serving Size'] === 'string' ? r['Serving Size'].trim() : '');
    const servingQty = num(r['Serving Qty'], 0);
    const kcal = numOrNull(r['Calories (kcal)']);
    if (!unit || servingQty <= 0 || kcal === null) continue;
    foodByName.set(key, {
      name,
      brand: null,
      source: 'user',
      kcal_per_serving: kcal,
      protein_g_per_serving: num(r['Protein (g)']),
      carbs_g_per_serving: num(r['Carbs (g)']),
      fat_g_per_serving: num(r['Fat (g)']),
      servings: [{ unit, units_per_serving: servingQty }],
      nutrients: extractNutrients(r),
    });
  }

  const inRows = sheetToObjects(wbB, 'in');
  const entries = [];
  let earliestDate = null, latestDate = null;

  for (let i = 0; i < inRows.length; i++) {
    const r = inRows[i];
    const date = parseDate(r['Date']);
    if (!date) { errors.push(`Row ${i + 2}: invalid Date '${String(r['Date'])}'`); continue; }
    const name = typeof r['Food Name'] === 'string' ? r['Food Name'].trim() : '';
    if (!name) { errors.push(`Row ${i + 2}: missing Food Name`); continue; }
    const unit = truncUnit(typeof r['Serving Size'] === 'string' ? r['Serving Size'].trim() : '');
    const servingQty = num(r['Serving Qty'], 0);
    const kcal = num(r['Calories (kcal)']);
    if (!unit || servingQty <= 0) {
      errors.push(`Row ${i + 2} '${name}': invalid serving (${unit} × ${servingQty})`);
      continue;
    }
    const key = name.toLowerCase();
    let food = foodByName.get(key);
    if (!food) {
      food = {
        name, brand: null, source: 'user',
        kcal_per_serving: kcal,
        protein_g_per_serving: num(r['Protein (g)']),
        carbs_g_per_serving: num(r['Carbs (g)']),
        fat_g_per_serving: num(r['Fat (g)']),
        servings: [{ unit, units_per_serving: servingQty }],
        nutrients: extractNutrients(r),
      };
      foodByName.set(key, food);
    } else if (!food.servings.some(s => s.unit === unit)) {
      let ups = servingQty;
      if (food.kcal_per_serving > 0 && kcal > 0) {
        ups = servingQty * (food.kcal_per_serving / kcal);
      } else {
        const cands = [
          [food.protein_g_per_serving, num(r['Protein (g)'])],
          [food.carbs_g_per_serving, num(r['Carbs (g)'])],
          [food.fat_g_per_serving, num(r['Fat (g)'])],
        ];
        const pair = cands.find(([a, b]) => a > 0 && b > 0);
        if (pair) ups = servingQty * (pair[0] / pair[1]);
      }
      if (Number.isFinite(ups) && ups > 0) food.servings.push({ unit, units_per_serving: ups });
    }
    entries.push({
      entry_date: dateToIso(date),
      entry_time: parseTime(r['Time']),
      food_name: name,
      unit,
      quantity: servingQty,
      quick_add: null,
    });
    if (!earliestDate || date < earliestDate) earliestDate = date;
    if (!latestDate || date > latestDate) latestDate = date;
  }

  // Calories & Macros — quick-add fill
  const totalsRows = sheetToObjects(wbA, 'Calories & Macros');
  const datesWithEntries = new Set(entries.map(e => e.entry_date));
  for (const r of totalsRows) {
    const date = parseDate(r['Date']);
    if (!date) continue;
    const kcal = num(r['Calories (kcal)']);
    const fat = num(r['Fat (g)']);
    const carbs = num(r['Carbs (g)']);
    const protein = num(r['Protein (g)']);
    if (kcal === 0 && fat === 0 && carbs === 0 && protein === 0) continue;
    const iso = dateToIso(date);
    if (datesWithEntries.has(iso)) continue;
    entries.push({
      entry_date: iso,
      entry_time: '12:00:00',
      food_name: null,
      unit: null,
      quantity: 1,
      quick_add: { name: 'Imported from MacroFactor', kcal, protein_g: protein, carbs_g: carbs, fat_g: fat },
    });
    if (!earliestDate || date < earliestDate) earliestDate = date;
    if (!latestDate || date > latestDate) latestDate = date;
  }

  // Scale Weight
  const scaleRows = sheetToObjects(wbA, 'Scale Weight');
  const weights = [];
  for (const r of scaleRows) {
    const date = parseDate(r['Date']);
    const wt = numOrNull(r['Weight (lbs)']);
    if (!date || wt === null) continue;
    const bf = numOrNull(r['Fat Percent']);
    weights.push({ log_date: dateToIso(date), weight_lb: wt, body_fat_pct: bf });
  }

  // Food Log Notes
  const notesRows = sheetToObjects(wbA, 'Food Log Notes');
  const dayNotes = [];
  for (const r of notesRows) {
    const date = parseDate(r['Date']);
    const note = typeof r['Food Log Notes'] === 'string' ? r['Food Log Notes'].trim() : '';
    if (!date || !note) continue;
    dayNotes.push({ entry_date: dateToIso(date), note });
  }

  // Nutrition Program Settings — full history, averaged across the 7 weekday rows
  const programRows = sheetToObjects(wbA, 'Nutrition Program Settings');
  const programByDate = new Map();
  for (const r of programRows) {
    const d = parseDate(r['Program Update Date']);
    if (!d) continue;
    const iso = dateToIso(d);
    if (!programByDate.has(iso)) programByDate.set(iso, []);
    programByDate.get(iso).push(r);
  }
  const programHistory = Array.from(programByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([iso, rows]) => {
      const n = rows.length;
      return {
        effective_date: iso,
        kcal: Math.round(rows.reduce((s, r) => s + num(r['Calories (kcal)']), 0) / n),
        protein_g: Math.round(rows.reduce((s, r) => s + num(r['Protein (g)']), 0) / n),
        carbs_g: Math.round(rows.reduce((s, r) => s + num(r['Carbs (g)']), 0) / n),
        fat_g: Math.round(rows.reduce((s, r) => s + num(r['Fat (g)']), 0) / n),
      };
    });

  // Weight Goals — full history
  const goalRows = sheetToObjects(wbA, 'Weight Goals');
  const goals = [];
  for (const r of goalRows) {
    const startDate = parseDate(r['Start Date']);
    if (!startDate) continue;
    const endDate = parseDate(r['End Date']);
    const kindStr = typeof r['Goal'] === 'string' ? r['Goal'].trim().toLowerCase() : '';
    let goalKind = 'maintain';
    if (kindStr.includes('loss')) goalKind = 'lose';
    else if (kindStr.includes('gain')) goalKind = 'gain';
    const targetLb = numOrNull(r['Goal Weight (lbs)']);
    const ratePct = numOrNull(r['Goal Rate per Week (%)']);
    const startLb = numOrNull(r['Starting Scale Weight (lbs)']);
    const rateLbPerWeek = ratePct !== null && startLb !== null ? (ratePct * startLb) / 100 : null;
    goals.push({
      goal_kind: goalKind,
      target_weight_lb: targetLb,
      rate_lb_per_week: rateLbPerWeek,
      started_at: startDate.toISOString(),
      ended_at: endDate ? endDate.toISOString() : null,
    });
  }
  goals.sort((a, b) => a.started_at.localeCompare(b.started_at));

  entries.sort((a, b) =>
    a.entry_date === b.entry_date
      ? a.entry_time.localeCompare(b.entry_time)
      : a.entry_date.localeCompare(b.entry_date)
  );

  const foods = Array.from(foodByName.values());
  return {
    payload: {
      user_email: userEmail,
      foods,
      entries,
      weights,
      day_notes: dayNotes,
      program_history: programHistory,
      goals,
    },
    preview: {
      user_email: userEmail,
      foods_count: foods.filter(f => f.source === 'user').length,
      recipes_count: foods.filter(f => f.source === 'recipe').length,
      entries_count: entries.filter(e => e.food_name !== null).length,
      quick_add_entries_count: entries.filter(e => e.food_name === null).length,
      weights_count: weights.length,
      day_notes_count: dayNotes.length,
      program_history_count: programHistory.length,
      goals_count: goals.length,
      date_range: earliestDate && latestDate ? { earliest: dateToIso(earliestDate), latest: dateToIso(latestDate) } : null,
      errors,
    },
  };
}

// ============== Main =====================================================

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const wbAPath = args[0] ?? '/home/admin/.claude/uploads/a2b92432-0fe8-4954-be1d-f2fec6ae37fc/7a483474-MacroFactor20260522150650.xlsx';
const wbBPath = args[1] ?? '/home/admin/.claude/uploads/a2b92432-0fe8-4954-be1d-f2fec6ae37fc/75705818-MacroFactor20260522150732.xlsx';
const apiKeyPath = process.env.GRIMOIRE_API_KEY_PATH ?? '/home/admin/.claude/secrets/grimoire-api-key.txt';
const apiBase = process.env.GRIMOIRE_URL ?? 'http://127.0.0.1:3000';

console.log('Workbook A:', wbAPath);
console.log('Workbook B:', wbBPath);

const [bufA, bufB, apiKey] = await Promise.all([
  readFile(wbAPath),
  readFile(wbBPath),
  readFile(apiKeyPath, 'utf8').then(s => s.trim()),
]);

const { payload, preview } = parseWorkbooks(bufA, bufB);

console.log('\n=== Preview ===');
console.log('  user_email:', preview.user_email);
console.log('  foods:', preview.foods_count, '· recipes:', preview.recipes_count);
console.log('  entries:', preview.entries_count, '· quick-add days:', preview.quick_add_entries_count);
console.log('  weights:', preview.weights_count, '· day_notes:', preview.day_notes_count);
console.log('  program_history:', preview.program_history_count, '· goals:', preview.goals_count);
console.log('  date_range:', preview.date_range);
if (preview.errors.length > 0) {
  console.log('  errors (first 5):');
  for (const e of preview.errors.slice(0, 5)) console.log('   -', e);
  console.log('   ...', preview.errors.length, 'total');
}

if (process.argv.includes('--dry-run')) {
  console.log('\n--dry-run: not posting.');
  process.exit(0);
}

console.log(`\nPOSTing to ${apiBase}/modules/forage/api/import …`);
const t0 = Date.now();
const res = await fetch(`${apiBase}/modules/forage/api/import`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
  body: JSON.stringify(payload),
});
const ms = Date.now() - t0;
const text = await res.text();
console.log(`HTTP ${res.status} in ${ms}ms`);
console.log(text);
if (!res.ok) process.exit(1);
