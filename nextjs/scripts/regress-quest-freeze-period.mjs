#!/usr/bin/env node
// Regression check: a freeze period runs from the quest week's start day for 7 days, over a whole calendar month, leap days included, or over a whole calendar year
// Usage: node scripts/regress-quest-freeze-period.mjs
// NOTE: Needs no database or running server; it loads types/freezePeriod.ts and lib/gambleConfig.ts compiled in memory
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const quest_path = fileURLToPath(new URL('../app/modules/quest/', import.meta.url));

// Compile a quest module to CommonJS and run it, resolving its relative imports the same way
const loaded_modules = new Map();
function LoadQuestModule(relative_path) {
  if (loaded_modules.has(relative_path)) return loaded_modules.get(relative_path).exports;
  const source = readFileSync(`${quest_path}${relative_path}.ts`, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const module = { exports: {} };
  loaded_modules.set(relative_path, module);
  const folder = relative_path.split('/').slice(0, -1);
  const LocalRequire = (name) => {
    const parts = [...folder];
    for (const part of name.split('/')) {
      if (part === '..') parts.pop();
      else if (part !== '.') parts.push(part);
    }
    return LoadQuestModule(parts.join('/'));
  };
  vm.runInNewContext(outputText, { module, exports: module.exports, require: LocalRequire });
  return module.exports;
}

const { freezePeriodRange, FreezePeriod } = LoadQuestModule('types/freezePeriod');

let failures = 0;
const Check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${ok ? '' : ` (got ${JSON.stringify(actual)})`}`);
  if (!ok) failures++;
};

Check('week starting Monday', freezePeriodRange('2026-11-12', FreezePeriod.week, 1), { from: '2026-11-09', to: '2026-11-15' });
Check('week starting Sunday, on the start day', freezePeriodRange('2026-11-15', FreezePeriod.week, 0), { from: '2026-11-15', to: '2026-11-21' });
Check('week across a year end', freezePeriodRange('2026-12-31', FreezePeriod.week, 1), { from: '2026-12-28', to: '2027-01-03' });
Check('month of 30 days', freezePeriodRange('2026-11-30', FreezePeriod.month, 1), { from: '2026-11-01', to: '2026-11-30' });
Check('leap February', freezePeriodRange('2028-02-10', FreezePeriod.month, 1), { from: '2028-02-01', to: '2028-02-29' });
Check('year', freezePeriodRange('2026-03-03', FreezePeriod.year, 1), { from: '2026-01-01', to: '2026-12-31' });

process.exit(failures ? 1 : 0);
