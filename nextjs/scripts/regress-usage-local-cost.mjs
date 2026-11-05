#!/usr/bin/env node
// Regression check: a call on the shared Claude CLI or a local engine never stores a cost, and the Usage report shows a dash, not $0, where no call has a tracked cost
// Usage: node scripts/regress-usage-local-cost.mjs
// NOTE: Needs no database or running server; it loads lib/llm/usage.ts with a stand-in connection pool
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
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

// Record every statement the code under test runs, and answer report queries with the rows in report_rows
const inserted_rows = [];
let report_rows = {};
const FakePool = {
  request() {
    const inputs = {};
    const request = {
      input(name, _type, value) { inputs[name] = value; return request; },
      async query(text) {
        if (/INSERT INTO llm_usage/.test(text)) { inserted_rows.push({ ...inputs }); return { recordset: [] }; }
        const key = Object.keys(report_rows).find((pattern) => text.includes(pattern));
        return { recordset: key ? report_rows[key] : [] };
      },
    };
    return request;
  },
};
const STUBS = {
  '@/lib/db': { getMainConnection: async () => FakePool },
  '@/lib/modules': { getAllModules: async () => [] },
};

// Transpile a TypeScript file and run it, resolving "@/" and relative imports to other transpiled files
const LoadModule = (module_path) => {
  const module = { exports: {} };
  const compiled_source = ts.transpileModule(readFileSync(module_path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const local_require = (name) => {
    if (STUBS[name]) return STUBS[name];
    if (name.startsWith('@/')) return LoadModule(join(nextjs_path, `${name.slice(2)}.ts`));
    if (name.startsWith('.')) return LoadModule(`${resolve(dirname(module_path), name)}.ts`);
    return require(name);
  };
  vm.runInNewContext(compiled_source, { module, exports: module.exports, require: local_require, console }, { filename: module_path });
  return module.exports;
};

const usage_path = join(nextjs_path, 'lib/llm/usage.ts');
const cost_path = join(nextjs_path, 'lib/llm/usageCost.ts');
const { recordUsage, getUsageReport } = LoadModule(usage_path);

// Log a call on each backend with a cost and confirm only OpenRouter keeps it
const base_row = { userId: '00000000-0000-0000-0000-000000000001', promptTokens: 1, completionTokens: 1, durationMs: 1200, ok: true, errorCode: null };
recordUsage({ ...base_row, task: 'rune_eval', backend: 'claude', model: 'sonnet', costUsd: 0.064 });
recordUsage({ ...base_row, task: 'rune_stt', backend: 'local', model: 'Whisper base.en', costUsd: 0.5 });
recordUsage({ ...base_row, task: 'rune_eval', backend: 'openrouter', model: 'qwen/qwen3-30b', costUsd: 0.00008 });
await new Promise((resolve_wait) => setTimeout(resolve_wait, 50));
const stored_cost = (backend) => inserted_rows.find((r) => r.backend === backend)?.costUsd;
Check('a Claude CLI row stores no cost', stored_cost('claude') === null, String(stored_cost('claude')));
Check('a local engine row stores no cost', stored_cost('local') === null, String(stored_cost('local')));
Check('an OpenRouter row keeps its cost', stored_cost('openrouter') === 0.00008, String(stored_cost('openrouter')));
Check('a local engine row keeps its duration', inserted_rows.find((r) => r.backend === 'local')?.durationMs === 1200);

// Build a report where Rune ran only on the CLI and Whisper, and Forage on OpenRouter
const totals = (cost_usd, calls = 2) => ({ calls, failed: 0, prompt_tokens: 10, completion_tokens: 5, cost_usd, duration_ms_avg: 900 });
report_rows = {
  'GROUP BY backend, model': [
    { backend: 'claude', model: 'sonnet', ...totals(null) },
    { backend: 'local', model: 'Whisper base.en', ...totals(null) },
    { backend: 'openrouter', model: 'gemini', ...totals(0.02) },
  ],
  'GROUP BY task, backend, model': [
    { task: 'rune_eval', backend: 'claude', model: 'sonnet', ...totals(null) },
    { task: 'rune_stt', backend: 'local', model: 'Whisper base.en', ...totals(null) },
    { task: 'forage_estimate', backend: 'openrouter', model: 'gemini', ...totals(0.02) },
  ],
  'GROUP BY CAST(ts AS DATE), task': [
    { day: new Date('2026-11-05'), task: 'rune_eval', calls: 2, cost_usd: null },
    { day: new Date('2026-11-05'), task: 'forage_estimate', calls: 2, cost_usd: 0.02 },
  ],
  'GROUP BY CAST(ts AS DATE) ORDER BY': [{ day: new Date('2026-11-05'), ...totals(0.02, 4) }],
  'GROUP BY backend': [
    { backend: 'claude', ...totals(null) },
    { backend: 'local', ...totals(null) },
    { backend: 'openrouter', ...totals(0.02) },
  ],
};
const report = await getUsageReport('00000000-0000-0000-0000-000000000001', 'all');
const module_cost = (key) => report.modules.find((m) => m.module === key)?.costUsd;
Check('the total counts only tracked cost', Math.abs(report.summary.costUsd - 0.02) < 1e-9, String(report.summary.costUsd));
Check('the total counts every call', report.summary.calls === 6, String(report.summary.calls));
Check('a module with only local calls has no cost', module_cost('rune') === null, String(module_cost('rune')));
Check('a module with no calls has no cost', module_cost('golem') === null, String(module_cost('golem')));
Check('a module with OpenRouter calls keeps its cost', Math.abs(module_cost('forage') - 0.02) < 1e-9, String(module_cost('forage')));
Check('the Claude backend has no cost', report.summary.byBackend.claude.costUsd === null);
Check('the local backend counts its calls', report.summary.byBackend.local.calls === 2);
Check('a day keeps no cost for a module with only local calls', report.daily[0].byModule.rune.costUsd === null);

// Format an untracked cost and share as a dash, never $0 or a divide by zero
Check('lib/llm/usageCost.ts exists', existsSync(cost_path));
const { formatCost, formatCostShare } = existsSync(cost_path) ? LoadModule(cost_path) : { formatCost: () => '', formatCostShare: () => '' };
Check('an untracked cost shows a dash', formatCost(null) === '—', formatCost(null));
Check('a tracked cost shows dollars', formatCost(0.02) === '$0.0200', formatCost(0.02));
Check('an untracked module share shows a dash', formatCostShare(null, 0.02) === '—', formatCostShare(null, 0.02));
Check('a share of an untracked total shows a dash', formatCostShare(0, null) === '—', formatCostShare(0, null));
Check('a share of a zero total shows a dash', formatCostShare(0, 0) === '—', formatCostShare(0, 0));

// Confirm the page draws every cost through formatCost and every share through formatCostShare
const page_source = readFileSync(join(nextjs_path, 'app/settings/ui/usage/UsageClient.tsx'), 'utf8');
Check('the page formats no cost with its own helper', !/money\(|\$\$\{/.test(page_source));

if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('All checks passed');
