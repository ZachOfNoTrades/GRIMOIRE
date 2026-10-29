#!/usr/bin/env node
// Regression check: the email and cleanup schedulers start only when NODE_ENV is production, never in a development server
// Usage: node scripts/regress-dev-schedulers.mjs
// NOTE: Loads lib/serverBootstrap.ts with stub schedulers, so it needs no database, mail account or running server
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const source_path = fileURLToPath(new URL('../lib/serverBootstrap.ts', import.meta.url));
const compiled_source = ts.transpileModule(readFileSync(source_path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

let failures = 0;
const Check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};

// Load the bootstrap under a NODE_ENV and list the schedulers it started
const StartedSchedulers = (node_env) => {
  const started_names = [];
  const StubRequire = (module_path) => new Proxy({}, {
    get: (_, export_name) => () => started_names.push(`${module_path}#${String(export_name)}`),
  });
  const module = { exports: {} };
  vm.runInNewContext(compiled_source, {
    module,
    exports: module.exports,
    require: StubRequire,
    process: { env: { NODE_ENV: node_env } },
    console,
  }, { filename: source_path });
  return started_names;
};

const development_started = StartedSchedulers('development');
Check('development server starts no schedulers', development_started.length === 0, development_started.join(', '));

const production_started = StartedSchedulers('production');
Check('production server starts every scheduler', production_started.length === 4, `${production_started.length} started`);

process.exit(failures ? 1 : 0);
