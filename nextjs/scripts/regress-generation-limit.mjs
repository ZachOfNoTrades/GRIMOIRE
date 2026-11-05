#!/usr/bin/env node
// Regression check: a missing or 0 generation limit allows no generations, only the unlimited flag lifts the limit, and every logged generation is checked against the limit first
// Usage: node scripts/regress-generation-limit.mjs
// NOTE: Needs no database or running server; it loads lib/generationLimit.ts with a stand-in database and reads the app's sources
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const nextjs_path = fileURLToPath(new URL('../', import.meta.url));

let failures = 0;
const Check = async (label, run) => {
  let ok = false;
  let detail = '';
  try {
    ok = await run();
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};

// Answer every generation count query with the count set here
let logged_generation_count = 0;
const stand_in_database = {
  getMainConnection: async () => ({
    request() {
      const request = { input: () => request, query: async () => ({ recordset: [{ count: logged_generation_count }] }) };
      return request;
    },
  }),
};

// Transpile lib/generationLimit.ts and run it against the stand-in database
const generation_limit_path = join(nextjs_path, 'lib/generationLimit.ts');
const generation_limit_module = { exports: {} };
const compiled_source = ts.transpileModule(readFileSync(generation_limit_path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const local_require = (name) => (name === '@/lib/db' ? stand_in_database : require(name));
vm.runInNewContext(
  compiled_source,
  { module: generation_limit_module, exports: generation_limit_module.exports, require: local_require, process, console },
  { filename: generation_limit_path },
);
const { checkGenerationLimit, toGenerationAllowance } = generation_limit_module.exports;

// Check what a user row with each limit may do
await Check('a row with no limit reads as a limit of 0', async () => toGenerationAllowance({}).generationLimit === 0);
await Check('a row with no unlimited flag is limited', async () => toGenerationAllowance({ generation_limit: 0 }).isGenerationUnlimited === false);
await Check('a missing limit allows no generations', async () => {
  logged_generation_count = 0;
  return (await checkGenerationLimit('user', toGenerationAllowance({}))).allowed === false;
});
await Check('a limit of 0 allows no generations', async () => {
  logged_generation_count = 0;
  return (await checkGenerationLimit('user', toGenerationAllowance({ generation_limit: 0, is_generation_unlimited: false }))).allowed === false;
});
await Check('the unlimited flag allows a generation past any count', async () => {
  logged_generation_count = 1000;
  return (await checkGenerationLimit('user', toGenerationAllowance({ generation_limit: 0, is_generation_unlimited: true }))).allowed === true;
});
await Check('a limit of 15 allows a generation after 14', async () => {
  logged_generation_count = 14;
  return (await checkGenerationLimit('user', toGenerationAllowance({ generation_limit: 15 }))).allowed === true;
});
await Check('a limit of 15 refuses a generation after 15', async () => {
  logged_generation_count = 15;
  return (await checkGenerationLimit('user', toGenerationAllowance({ generation_limit: 15 }))).allowed === false;
});

// Confirm no sign-in path falls back to a limit of 1
for (const relative_path of ['lib/auth.ts', 'lib/apiKeys.ts', 'lib/permissions.ts']) {
  const source = readFileSync(join(nextjs_path, relative_path), 'utf8');
  await Check(`${relative_path} has no fallback limit of 1`, async () => !/generation_?[lL]imit \?\? 1\b/.test(source));
}

// List the TypeScript files under a folder, skipping node_modules
const ListSources = (relative_dir) => readdirSync(join(nextjs_path, relative_dir), { withFileTypes: true }).flatMap((entry) => {
  const relative_path = join(relative_dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : ListSources(relative_path);
  return /\.(ts|tsx)$/.test(entry.name) ? [relative_path] : [];
});

// Confirm each generation is logged only after its own limit check
const generation_call_pattern = /\b(checkGenerationLimit|logGeneration)\(/g;
let logged_generation_files = 0;
for (const relative_path of [...ListSources('app'), ...ListSources('lib')]) {
  if (relative_path === join('lib', 'generationLimit.ts')) continue;
  const calls = [...readFileSync(join(nextjs_path, relative_path), 'utf8').matchAll(generation_call_pattern)].map((match) => match[1]);
  if (!calls.includes('logGeneration')) continue;
  logged_generation_files++;
  await Check(`${relative_path} checks the limit before each generation it logs`, async () =>
    calls.every((name, index) => name !== 'logGeneration' || calls[index - 1] === 'checkGenerationLimit'));
}
await Check('the source scan found the files that log generations', async () => logged_generation_files > 0);

if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('All checks passed');
