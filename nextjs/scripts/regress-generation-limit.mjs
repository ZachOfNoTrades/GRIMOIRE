#!/usr/bin/env node
// Regression check: a missing or 0 generation limit allows no generations, only the unlimited flag lifts the limit, every logged generation is checked against the limit first, and the deterministic engine paths make no model call and are not counted
// Usage: node scripts/regress-generation-limit.mjs
// NOTE: Needs no database or running server; it loads lib/generationLimit.ts with a stand-in database and reads the app's sources
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
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

// Resolve an import specifier to a source file under nextjs/, or null for a package import
const ResolveImport = (from_path, specifier) => {
  let base_path;
  if (specifier.startsWith('@/')) base_path = join(nextjs_path, specifier.slice(2));
  else if (specifier.startsWith('.')) base_path = join(dirname(from_path), specifier);
  else return null;
  for (const suffix of ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx']) {
    const candidate_path = base_path + suffix;
    if (existsSync(candidate_path) && statSync(candidate_path).isFile()) return candidate_path;
  }
  return null;
};

// Read the module specifiers a source file imports, re-exports, loads with import() or requires, skipping type-only imports
const import_pattern = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
const load_pattern = /\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g;
const ReadImports = (file_path) => {
  const source = readFileSync(file_path, 'utf8');
  return [
    ...[...source.matchAll(import_pattern)].filter((match) => !match[1]).map((match) => match[2]),
    ...[...source.matchAll(load_pattern)].map((match) => match[1]),
  ];
};

// Name a module that sends a request to a model: the shared LLM layer, a module's llm* helpers, or a model SDK
const IsModelModule = (specifier, resolved_path) => {
  if (!resolved_path) return /^(@anthropic-ai|openai|@openrouter)\b/.test(specifier);
  const nextjs_relative_path = relative(nextjs_path, resolved_path);
  return nextjs_relative_path.startsWith(join('lib', 'llm') + '/') || /^llm/i.test(nextjs_relative_path.split('/').pop());
};

// Walk every module a file reaches and list the model modules among them
const FindModelImports = (root_paths) => {
  const visited_paths = new Set();
  const model_imports = [];
  const pending_paths = [...root_paths];
  while (pending_paths.length > 0) {
    const file_path = pending_paths.pop();
    if (visited_paths.has(file_path)) continue;
    visited_paths.add(file_path);
    for (const specifier of ReadImports(file_path)) {
      const resolved_path = ResolveImport(file_path, specifier);
      if (IsModelModule(specifier, resolved_path)) model_imports.push(`${relative(nextjs_path, file_path)} -> ${specifier}`);
      else if (resolved_path) pending_paths.push(resolved_path);
    }
  }
  return { model_imports, visited_count: visited_paths.size };
};

// Confirm the deterministic session engine reaches no model call
const engine_path = join(nextjs_path, 'app/modules/golem/lib/engine');
const engine_route_path = join(nextjs_path, 'app/modules/golem/api/sessions/[id]/generate-engine/route.ts');
const engine_roots = [
  engine_route_path,
  ...readdirSync(engine_path).filter((name) => /\.ts$/.test(name)).map((name) => join(engine_path, name)),
];
const engine_reach = FindModelImports(engine_roots);
await Check(`the session engine reaches no model module (${engine_reach.model_imports.join(', ') || 'none'})`, async () =>
  engine_reach.visited_count > engine_roots.length && engine_reach.model_imports.length === 0);

// Confirm the golem_generate_session_with_engine MCP tool calls only model-free functions
const mcp_golem_path = join(nextjs_path, 'lib/mcp/tools/golem.ts');
const mcp_golem_source = readFileSync(mcp_golem_path, 'utf8');
const engine_tool_start = mcp_golem_source.indexOf("'golem_generate_session_with_engine'");
const engine_tool_source = mcp_golem_source.slice(engine_tool_start, mcp_golem_source.indexOf('server.registerTool(', engine_tool_start));
const imported_names = new Map();
for (const match of mcp_golem_source.matchAll(/import\s+(?!type\b)\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g)) {
  for (const name of match[1].split(',').map((part) => part.trim().split(/\s+as\s+/).pop()).filter(Boolean)) imported_names.set(name, match[2]);
}
const engine_tool_modules = [...new Set([...engine_tool_source.matchAll(/\b(\w+)\(/g)].map((match) => imported_names.get(match[1])).filter(Boolean))];
const engine_tool_model_imports = engine_tool_modules.filter((specifier) => IsModelModule(specifier, ResolveImport(mcp_golem_path, specifier)));
const engine_tool_reach = FindModelImports(engine_tool_modules.map((specifier) => ResolveImport(mcp_golem_path, specifier)).filter(Boolean));
await Check('the engine MCP tool calls the session engine', async () => engine_tool_source.includes('generateSessionTargetsWithEngine('));
await Check(`the engine MCP tool reaches no model module (${[...engine_tool_model_imports, ...engine_tool_reach.model_imports].join(', ') || 'none'})`, async () =>
  engine_tool_model_imports.length === 0 && engine_tool_reach.model_imports.length === 0);

// Confirm the session engine is neither limited nor counted as a generation
await Check('the session engine route neither checks nor logs a generation', async () =>
  !/\b(checkGenerationLimit|logGeneration)\(/.test(readFileSync(engine_route_path, 'utf8')));
await Check('the engine MCP tool neither checks nor logs a generation', async () =>
  !/\b(checkGenerationLimit|logGeneration)\(/.test(engine_tool_source));

if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('All checks passed');
