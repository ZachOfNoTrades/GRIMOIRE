#!/usr/bin/env node
// Regression check: a failed first load of the Usage page shows an error and a Retry button, not an endless spinner
// Usage: node scripts/regress-usage-failed-load.mjs
// NOTE: Needs no database or running server; it loads lib/usageView.ts and reads the page's source
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const nextjs_path = fileURLToPath(new URL('../', import.meta.url));

let failures = 0;
const Check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};

// Transpile a TypeScript file and run it, resolving "@/" imports to other transpiled files
const LoadModule = (relative_path) => {
  const module_path = join(nextjs_path, relative_path);
  const module = { exports: {} };
  const compiled_source = ts.transpileModule(readFileSync(module_path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const local_require = (name) => (name.startsWith('@/') ? LoadModule(`${name.slice(2)}.ts`) : require(name));
  vm.runInNewContext(compiled_source, { module, exports: module.exports, require: local_require }, { filename: module_path });
  return module.exports;
};

const { UsageView } = LoadModule('types/usageView.ts');
const { usageView } = LoadModule('lib/usageView.ts');

// Pick the view from whether a report is held and whether the first load failed
Check('no report and no failure shows the loading state', usageView(false, false) === UsageView.Loading);
Check('a failed first load shows the failed view', usageView(false, true) === UsageView.Failed);
Check('a held report shows the report', usageView(true, false) === UsageView.Ready);
Check('a held report wins over an old failure', usageView(true, true) === UsageView.Ready);

// Confirm the page marks a failed first load and offers Retry in the failed view
const page_source = readFileSync(join(nextjs_path, 'app/settings/ui/usage/UsageClient.tsx'), 'utf8');
Check('the page marks a failed first load', /else setIsFirstLoadFailed\(true\)/.test(page_source));
Check('the failed view holds a Retry button', /view === UsageView\.Failed[\s\S]{0,400}onClick=\{retry\}>Retry</.test(page_source));

if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('All checks passed');
