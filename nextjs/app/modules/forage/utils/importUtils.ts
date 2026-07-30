// MacroFactor xlsx → ImportPayload. Pure parser; runs in both browser (modal) and
// node (scripts/import-macrofactor.mts). All MacroFactor column layouts are hard-coded —
// the export format is fixed, so unlike golem we don't need a column-mapping wizard.

import * as XLSX from 'xlsx';
import { MF_COLUMN_TO_CODE } from './nutrientLedger';
import {
  ImportPayload,
  ImportFood,
  ImportFoodNutrient,
  ImportEntry,
  ImportWeight,
  ImportDayNote,
  ImportProgramHistoryEntry,
  ImportGoal,
  ImportPreview,
} from '../types/import';

// MF column header → our `nutrients.code`. Sourced from the ledger's per-nutrient
// `mfColumn` (single source of truth). Columns the ledger doesn't tag are dropped
// silently (alcohol, mono/polyunsaturated fat, omega-3 variants, amino acids,
// starch, water).
const NUTRIENT_COLUMN_TO_CODE = MF_COLUMN_TO_CODE;

const WEEKDAY_NAME_TO_DOW: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

// Parse cell that's either an ISO Date (when xlsx convertd date serial) or a "M/D/YYYY" string.
function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // M/D/YYYY
  const parts = trimmed.split('/');
  if (parts.length === 3) {
    const m = parseInt(parts[0], 10), d = parseInt(parts[1], 10), y = parseInt(parts[2], 10);
    if (Number.isFinite(m) && Number.isFinite(d) && Number.isFinite(y)) {
      return new Date(y, m - 1, d);
    }
  }
  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseTime(value: unknown): string {
  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:${String(value.getSeconds()).padStart(2, '0')}`;
  }
  if (typeof value === 'string' && value.trim()) {
    // MF exports as "7:47 PM" — Date parsing of "Jan 1 1970 7:47 PM" works.
    const parsed = new Date(`1970-01-01 ${value.trim()}`);
    if (!isNaN(parsed.getTime())) {
      return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}:00`;
    }
  }
  return '12:00:00';
}

// food_servings.unit is nvarchar(16); MF uses longer strings like 'large - 8" to 8 7/8" long'.
// Truncate identically here so food + entry references match.
function truncUnit(s: string): string {
  return s.slice(0, 16);
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function num(value: unknown, fallback = 0): number {
  const n = numOrNull(value);
  return n === null ? fallback : n;
}

function sheetToObjects(wb: XLSX.WorkBook, sheetName: string): Record<string, unknown>[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });
}

// Extract per-row nutrient entries from any MF row, mapping known columns to codes
// and dropping blanks (blank = unknown, NOT zero). If `divisor` > 0, each amount is
// divided by it (used for recipe rows where macros are for the whole batch).
function extractNutrients(row: Record<string, unknown>, divisor = 1): ImportFoodNutrient[] {
  const out: ImportFoodNutrient[] = [];
  for (const [col, code] of Object.entries(NUTRIENT_COLUMN_TO_CODE)) {
    const v = numOrNull(row[col]);
    if (v === null) continue;
    out.push({ code, amount: divisor > 0 ? v / divisor : v });
  }
  return out;
}

interface ParsedWorkbooks {
  payload: ImportPayload;
  preview: ImportPreview;
}

/**
 * Parse the two MacroFactor xlsx workbooks into a single ImportPayload + preview.
 * workbookA = the rich 18-sheet workbook (with Recipes, Custom Foods, Scale Weight,
 * Calories & Macros, Food Log Notes, Nutrition Program Settings, Weight Goals, User Profile).
 * workbookB = the single-sheet "in" workbook (the per-entry food log).
 */
export function parseWorkbooks(
  workbookABuffer: ArrayBuffer,
  workbookBBuffer: ArrayBuffer,
): ParsedWorkbooks {
  const wbA = XLSX.read(workbookABuffer, { type: 'array', cellDates: true });
  const wbB = XLSX.read(workbookBBuffer, { type: 'array', cellDates: true });

  const errors: string[] = [];

  // === User Profile (just the email for sanity check) =====================
  const profileRows = sheetToObjects(wbA, 'User Profile');
  const userEmail =
    profileRows.length > 0 && typeof profileRows[0].Email === 'string'
      ? (profileRows[0].Email as string).trim().toLowerCase()
      : '';
  if (!userEmail) errors.push('User Profile sheet missing Email');

  // === Foods (Recipes first, then Custom Foods, then per-entry first-encounter) ===
  // foodByName: case-insensitive name → ImportFood, with mutable servings list.
  const foodByName = new Map<string, ImportFood>();

  // Recipes
  const recipeRows = sheetToObjects(wbA, 'Recipes');
  for (const r of recipeRows) {
    const name = typeof r['Recipe Name'] === 'string' ? (r['Recipe Name'] as string).trim() : '';
    if (!name) continue;
    const servingQty = num(r['Serving Qty'], 0);
    const kcal = num(r['Calories (kcal)']);
    if (servingQty <= 0 || kcal <= 0) {
      // Header-only / placeholder row
      continue;
    }
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

  // Custom Foods (don't overwrite Recipes — Recipes are richer)
  const customRows = sheetToObjects(wbA, 'Custom Foods');
  for (const r of customRows) {
    const name = typeof r['Food Name'] === 'string' ? (r['Food Name'] as string).trim() : '';
    if (!name) continue;
    const key = name.toLowerCase();
    if (foodByName.has(key)) continue; // recipe wins
    const unit = truncUnit(typeof r['Serving Size'] === 'string' ? (r['Serving Size'] as string).trim() : '');
    const servingQty = num(r['Serving Qty'], 0);
    const kcal = numOrNull(r['Calories (kcal)']);
    if (!unit || servingQty <= 0 || kcal === null) continue; // header-only row
    foodByName.set(key, {
      name,
      brand: null,
      source: 'user',
      // The row's values represent `servingQty` of `unit` — store as kcal_per_serving
      // and set units_per_serving=servingQty (1 serving = servingQty of unit).
      kcal_per_serving: kcal,
      protein_g_per_serving: num(r['Protein (g)']),
      carbs_g_per_serving: num(r['Carbs (g)']),
      fat_g_per_serving: num(r['Fat (g)']),
      servings: [{ unit, units_per_serving: servingQty }],
      nutrients: extractNutrients(r),
    });
  }

  // === Entries ("in" sheet) ===============================================
  // For unknown foods, create from first-encounter row. For known foods that appear
  // with a new unit, add an extra serving derived by kcal ratio.
  const inRows = sheetToObjects(wbB, 'in');
  const entries: ImportEntry[] = [];
  let earliestDate: Date | null = null;
  let latestDate: Date | null = null;

  for (let i = 0; i < inRows.length; i++) {
    const r = inRows[i];
    const date = parseDate(r['Date']);
    if (!date) {
      errors.push(`Row ${i + 2}: invalid Date '${String(r['Date'])}'`);
      continue;
    }
    const name = typeof r['Food Name'] === 'string' ? (r['Food Name'] as string).trim() : '';
    if (!name) {
      errors.push(`Row ${i + 2}: missing Food Name`);
      continue;
    }
    const unit = truncUnit(typeof r['Serving Size'] === 'string' ? (r['Serving Size'] as string).trim() : '');
    const servingQty = num(r['Serving Qty'], 0);
    const kcal = num(r['Calories (kcal)']);
    if (!unit || servingQty <= 0) {
      errors.push(`Row ${i + 2} '${name}': invalid serving (${unit} × ${servingQty})`);
      continue;
    }

    const key = name.toLowerCase();
    let food = foodByName.get(key);
    if (!food) {
      // First-encounter: this row defines the canonical serving for the food.
      food = {
        name,
        brand: null,
        source: 'user',
        kcal_per_serving: kcal,
        protein_g_per_serving: num(r['Protein (g)']),
        carbs_g_per_serving: num(r['Carbs (g)']),
        fat_g_per_serving: num(r['Fat (g)']),
        servings: [{ unit, units_per_serving: servingQty }],
        nutrients: extractNutrients(r),
      };
      foodByName.set(key, food);
    } else if (!food.servings.some((s) => s.unit === unit)) {
      // Known food, new unit: derive units_per_serving from kcal ratio.
      let ups = servingQty;
      if (food.kcal_per_serving > 0 && kcal > 0) {
        ups = servingQty * (food.kcal_per_serving / kcal);
      } else {
        // Fallback: try protein, then carbs, then fat ratio.
        const cands: Array<[number, number]> = [
          [food.protein_g_per_serving, num(r['Protein (g)'])],
          [food.carbs_g_per_serving, num(r['Carbs (g)'])],
          [food.fat_g_per_serving, num(r['Fat (g)'])],
        ];
        const pair = cands.find(([a, b]) => a > 0 && b > 0);
        if (pair) ups = servingQty * (pair[0] / pair[1]);
      }
      if (Number.isFinite(ups) && ups > 0) {
        food.servings.push({ unit, units_per_serving: ups });
      }
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

  // === Calories & Macros — quick-add fill for days with no itemized entries ===
  const totalsRows = sheetToObjects(wbA, 'Calories & Macros');
  const datesWithEntries = new Set(entries.map((e) => e.entry_date));
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
      quick_add: {
        name: 'Imported from MacroFactor',
        kcal,
        protein_g: protein,
        carbs_g: carbs,
        fat_g: fat,
      },
    });
    if (!earliestDate || date < earliestDate) earliestDate = date;
    if (!latestDate || date > latestDate) latestDate = date;
  }

  // === Scale Weight =======================================================
  const scaleRows = sheetToObjects(wbA, 'Scale Weight');
  const weights: ImportWeight[] = [];
  for (const r of scaleRows) {
    const date = parseDate(r['Date']);
    const wt = numOrNull(r['Weight (lbs)']);
    if (!date || wt === null) continue;
    const bf = numOrNull(r['Fat Percent']);
    weights.push({
      log_date: dateToIso(date),
      weight_lb: wt,
      body_fat_pct: bf,
    });
  }

  // === Food Log Notes =====================================================
  const notesRows = sheetToObjects(wbA, 'Food Log Notes');
  const dayNotes: ImportDayNote[] = [];
  for (const r of notesRows) {
    const date = parseDate(r['Date']);
    const note = typeof r['Food Log Notes'] === 'string' ? (r['Food Log Notes'] as string).trim() : '';
    if (!date || !note) continue;
    dayNotes.push({ entry_date: dateToIso(date), note });
  }

  // === Nutrition Program Settings — full history, one row per program change =
  // The sheet has 7 weekday rows per change; we average them into a single per-program
  // target. The lib inserts these chronologically with is_active=1 only on the latest.
  const programRows = sheetToObjects(wbA, 'Nutrition Program Settings');
  const programByDate = new Map<string, Record<string, unknown>[]>();
  for (const r of programRows) {
    const d = parseDate(r['Program Update Date']);
    if (!d) continue;
    const iso = dateToIso(d);
    if (!programByDate.has(iso)) programByDate.set(iso, []);
    programByDate.get(iso)!.push(r);
  }
  const programHistory: ImportProgramHistoryEntry[] = Array.from(programByDate.entries())
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

  // === Weight Goals — full history ========================================
  const goalRows = sheetToObjects(wbA, 'Weight Goals');
  const goals: ImportGoal[] = [];
  for (const r of goalRows) {
    const startDate = parseDate(r['Start Date']);
    if (!startDate) continue;
    const endDate = parseDate(r['End Date']);
    const kindStr = typeof r['Goal'] === 'string' ? (r['Goal'] as string).trim().toLowerCase() : '';
    let goalKind: 'lose' | 'maintain' | 'gain' = 'maintain';
    if (kindStr.includes('loss')) goalKind = 'lose';
    else if (kindStr.includes('gain')) goalKind = 'gain';
    const targetLb = numOrNull(r['Goal Weight (lbs)']);
    const ratePct = numOrNull(r['Goal Rate per Week (%)']);
    const startLb = numOrNull(r['Starting Scale Weight (lbs)']);
    const rateLbPerWeek =
      ratePct !== null && startLb !== null ? (ratePct * startLb) / 100 : null;
    goals.push({
      goal_kind: goalKind,
      target_weight_lb: targetLb,
      rate_lb_per_week: rateLbPerWeek,
      started_at: startDate.toISOString(),
      ended_at: endDate ? endDate.toISOString() : null,
    });
  }
  goals.sort((a, b) => a.started_at.localeCompare(b.started_at));

  // === Sort entries chronologically for deterministic preview/insert =====
  entries.sort((a, b) =>
    a.entry_date === b.entry_date
      ? a.entry_time.localeCompare(b.entry_time)
      : a.entry_date.localeCompare(b.entry_date)
  );

  const foods = Array.from(foodByName.values());

  const payload: ImportPayload = {
    user_email: userEmail,
    foods,
    entries,
    weights,
    day_notes: dayNotes,
    program_history: programHistory,
    goals,
  };

  const preview: ImportPreview = {
    user_email: userEmail,
    foods_count: foods.filter((f) => f.source === 'user').length,
    recipes_count: foods.filter((f) => f.source === 'recipe').length,
    entries_count: entries.filter((e) => e.food_name !== null).length,
    quick_add_entries_count: entries.filter((e) => e.food_name === null).length,
    weights_count: weights.length,
    day_notes_count: dayNotes.length,
    program_history_count: programHistory.length,
    goals_count: goals.length,
    date_range:
      earliestDate && latestDate
        ? { earliest: dateToIso(earliestDate), latest: dateToIso(latestDate) }
        : null,
    errors,
  };

  // Suppress unused weekday map warning — referenced by name for clarity but the
  // averaging path collapses weekdays, so we don't actually use the map.
  void WEEKDAY_NAME_TO_DOW;

  return { payload, preview };
}
