#!/usr/bin/env node
// Regression check: a nutrition label with two columns gives one serving, and a food can never hold conflicting serving rows
// Usage: node scripts/regress-forage-serving-rows.mjs
// NOTE: Loads the Forage parsers with stub server modules, so it needs no database, model or running server
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const forage_lib_path = fileURLToPath(new URL('../app/modules/forage/lib/', import.meta.url));
const stub_modules = {
  './foodIcons': { FOOD_ICON_CODES: [] },
  './unitFunctions': { dupeKey: (name) => name.toLowerCase() },
  '@/lib/llm/generate': {},
};
const loaded_modules = new Map();

// Transpile a TypeScript module and run it, stubbing server modules
const LoadModule = (module_path) => {
  if (loaded_modules.has(module_path)) return loaded_modules.get(module_path).exports;
  const module = { exports: {} };
  loaded_modules.set(module_path, module);
  const compiled_source = ts.transpileModule(readFileSync(module_path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const LocalRequire = (request) => {
    if (stub_modules[request]) return stub_modules[request];
    if (request.startsWith('.')) return LoadModule(`${resolve(dirname(module_path), request)}.ts`);
    return require(request);
  };
  vm.runInNewContext(compiled_source, { module, exports: module.exports, require: LocalRequire, console, process }, { filename: module_path });
  return module.exports;
};

const { coerceDraft } = LoadModule(`${forage_lib_path}labelOcrLLM.ts`);
const { parseNutritionText } = LoadModule(`${forage_lib_path}labelParser.ts`);
const { findServingRowConflict, mergeServingRows, nextServingUnit, servingRowsFromGrams } = LoadModule(`${forage_lib_path}servingRows.ts`);

let failures = 0;
const Check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};
const Rows = (...pairs) => pairs.map(([units_per_serving, unit]) => ({ unit, units_per_serving }));
const Describe = (rows) => rows.map((row) => `${row.units_per_serving} ${row.unit}`).join(', ');
const known_units = new Set(['g', 'ml', 'oz', 'fl oz', 'cup', 'tbsp', 'tsp', 'serving', 'piece', 'slice']);

// Read the draft a vision model returned for a label with 2 oz (56g) and 3.5 oz (100g) columns
const scanned_draft = coerceDraft(
  { serving_size_stated: true, servings: Rows([2, 'oz'], [56, 'g'], [3.5, 'oz'], [100, 'g']), kcal_per_serving: 190 },
  known_units,
);
Check('two label columns keep the first serving', Describe(scanned_draft.servings) === '2 oz, 56 g', Describe(scanned_draft.servings));

// Read a pasted two-column label through the regex fallback
const parsed_draft = parseNutritionText(
  'Serving size 2 oz (56g) 3.5 oz (100g)\nCalories 190 340\nTotal Fat 1g 1% 2g 3%\nProtein 10g 18g',
  known_units,
);
Check('regex fallback keeps the first serving', Describe(parsed_draft.servings) === '2 oz, 56 g', Describe(parsed_draft.servings));

// Confirm what a food may hold
Check('a repeated unit conflicts', findServingRowConflict(Rows([45, 'g'], [50, 'g'])) !== null);
Check('a spelled-out repeat conflicts', findServingRowConflict(Rows([45, 'g'], [50, 'grams'])) !== null);
Check('a repeated count unit conflicts', findServingRowConflict(Rows([1, 'slice'], [2, 'slice'])) !== null);
Check('a repeated unit with no amount conflicts', findServingRowConflict(Rows([45, 'g'], [NaN, 'g'])) !== null);
Check('weights for different servings conflict', findServingRowConflict(Rows([2, 'oz'], [100, 'g'])) !== null);
Check('volumes for different servings conflict', findServingRowConflict(Rows([1, 'cup'], [2, 'tbsp'])) !== null);
Check('a rounded weight pair is allowed', findServingRowConflict(Rows([2, 'oz'], [56, 'g'])) === null);
Check('a rounded volume pair is allowed', findServingRowConflict(Rows([1, 'cup'], [240, 'ml'])) === null);
Check('matching volumes are allowed', findServingRowConflict(Rows([1, 'cup'], [16, 'tbsp'])) === null);
Check('a weight beside a volume is allowed', findServingRowConflict(Rows([2, 'tbsp'], [32, 'g'])) === null);
Check('an ounce beside a fluid ounce is allowed', findServingRowConflict(Rows([8, 'fl oz'], [30, 'oz'])) === null);
Check('two count units are allowed', findServingRowConflict(Rows([1, 'slice'], [2, 'piece'])) === null);

// Confirm automatic imports never produce rows the save check refuses
const estimated_rows = servingRowsFromGrams('oz', 85);
Check('an estimate in ounces converts from its grams', findServingRowConflict(estimated_rows) === null, Describe(estimated_rows));
Check('an estimate in grams gives one row', Describe(servingRowsFromGrams('g', 85)) === '85 g');
Check('an estimate in a count unit stays 1', Describe(servingRowsFromGrams('slice', 28)) === '1 slice, 28 g');
const merged_rows = mergeServingRows(Rows([1, 'cup'], [158, 'g']), Rows([1.2, 'cup'], [16, 'tbsp'], [10, 'tbsp']));
Check('imported rows skip units already held', Describe(merged_rows) === '1 cup, 158 g, 16 tbsp', Describe(merged_rows));

// Confirm 'Add unit' starts on a unit no row uses
Check('a new row skips a used unit', nextServingUnit(['g', 'Oz']) === 'lb', nextServingUnit(['g', 'Oz']));

console.log(failures === 0 ? 'All checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
