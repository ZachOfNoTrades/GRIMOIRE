#!/usr/bin/env node
// Regression check: a nutrition label row printed only as a %DV becomes an amount from its FDA Daily Value, never 0
// Usage: node scripts/regress-forage-percent-dv.mjs
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

let failures = 0;
const Check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};
const known_units = new Set(['g', 'ml', 'can']);

// Read the draft a vision model returned for a can listing vitamins only as %DV
const scanned_draft = coerceDraft(
  {
    serving_size_stated: true,
    servings: [{ unit: 'can', units_per_serving: 1 }],
    kcal_per_serving: 220,
    nutrients_by_code: { calcium: 340, iron: 1.1, vit_c: 0 },
    percent_dv_by_code: { calcium: 25, vit_c: 130, riboflavin: 200, niacin: 200, vit_b6: 200, phosphorus: 15, caffeine: 50 },
  },
  known_units,
);
const nutrients = scanned_draft.nutrients_by_code;
Check('a %DV-only vitamin becomes an amount', nutrients.riboflavin === 2.6, String(nutrients.riboflavin));
Check('a %DV-only mineral becomes an amount', nutrients.phosphorus === 187.5, String(nutrients.phosphorus));
Check('a %DV replaces a 0 the model wrote', nutrients.vit_c === 117, String(nutrients.vit_c));
Check('a printed amount wins over its %DV', nutrients.calcium === 340, String(nutrients.calcium));
Check('a nutrient with no Daily Value is skipped', !('caffeine' in nutrients), String(nutrients.caffeine));

// Confirm a %DV is ignored without a stated serving size
const unstated_draft = coerceDraft({ serving_size_stated: false, percent_dv_by_code: { vit_c: 100 } }, known_units);
Check('no serving size drops %DV rows', Object.keys(unstated_draft.nutrients_by_code).length === 0);

console.log(failures === 0 ? 'All checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
