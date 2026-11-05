#!/usr/bin/env node
// Regression check: a Golem session confirm stays open until its request answers, clears its busy state on failure and shows the refusal inside it
// Usage: node scripts/regress-golem-session-confirms.mjs
// NOTE: Needs no database or running server; it reads the app's sources
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const nextjs_path = fileURLToPath(new URL('../', import.meta.url));
const ReadSource = (relative_path) => readFileSync(join(nextjs_path, relative_path), 'utf8');

let failures = 0;
const Check = (label, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures++;
};

// List the TSX files under a folder, skipping node_modules
const ListSources = (relative_dir) => readdirSync(join(nextjs_path, relative_dir), { withFileTypes: true }).flatMap((entry) => {
  const relative_path = join(relative_dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : ListSources(relative_path);
  return /\.tsx$/.test(entry.name) ? [relative_path] : [];
});

// Read the body of a function declared as `const <name> = async (...) => {`, up to its matching closing brace
const ReadFunctionBody = (source, name) => {
  const start = source.indexOf(`const ${name} = async`);
  if (start < 0) return '';
  const open = source.indexOf('{', source.indexOf('=>', start));
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth++;
    else if (source[index] === '}' && --depth === 0) return source.slice(open, index + 1);
  }
  return '';
};

// Confirm no click handler closes a modal and then awaits the request behind it
const close_then_await_pattern = /onClick=\{async \([^)]*\) => \{[^}]*\bset\w*(?:Open|Modal)\w*\(false\)[^}]*\bawait\b/;
for (const relative_path of [...ListSources('app'), ...ListSources('components')]) {
  if (close_then_await_pattern.test(ReadSource(relative_path))) Check(`${relative_path} closes a modal before awaiting its request`, false);
}

// Confirm the Replace & Generate confirm closes only on success and shows its refusal inside
const engine_controls = ReadSource('app/modules/golem/components/SessionEngineControls.tsx');
const confirm_replace = ReadFunctionBody(engine_controls, 'handleConfirmReplace');
Check('Replace & Generate waits for the generation before closing', /await runGeneration\(\)[\s\S]*setConfirmOpen\(false\)/.test(confirm_replace));
Check('Replace & Generate keeps the refusal for the confirm', /if \(error\) setConfirmError\(error\)/.test(confirm_replace));
Check('Replace & Generate draws its refusal inside the confirm', /\{confirmError && /.test(engine_controls));

// Confirm the delete and reset confirms clear their busy state and show the refusal inside
const session_page = ReadSource('app/modules/golem/ui/session/[id]/page.tsx');
const delete_session = ReadFunctionBody(session_page, 'handleDeleteSession');
const delete_failure_branches = [...delete_session.matchAll(/if \(!response\.ok\) \{[\s\S]*?\n {6}\}|catch \(error\) \{[\s\S]*?\n {4}\}/g)].map((match) => match[0]);
Check('Delete Session handles a refused and a failed request', delete_failure_branches.length === 2);
Check('Delete Session clears its busy state on every failure', delete_failure_branches.every((branch) => branch.includes('setIsDeletingSession(false)')));
Check('Delete Session keeps the refusal for the confirm', delete_failure_branches.every((branch) => branch.includes('setDeleteSessionError(')));
const reset_session = ReadFunctionBody(session_page, 'handleResetSession');
Check('Reset Session keeps the refusal for the confirm', (reset_session.match(/setResetSessionError\("|setResetSessionError\(errorData/g) ?? []).length === 2);
Check('Reset Session clears its busy state in finally', /finally \{\s*setIsResettingSession\(false\)/.test(reset_session));
for (const modal_file of ['DeleteSessionModal.tsx', 'ResetSessionModal.tsx']) {
  Check(`${modal_file} draws its refusal inside the confirm`, /\{error && /.test(ReadSource(`app/modules/golem/ui/session/[id]/${modal_file}`)));
}

// Confirm Session Review only closes once its save answers with success
const review_submit = ReadFunctionBody(session_page, 'handleReviewSubmit') || session_page.slice(session_page.indexOf('const handleReviewSubmit'), session_page.indexOf('const handleReviewSkip'));
Check('Session Review closes only when its save succeeds', /\.then\(\((\w+)\) => \{ if \(\1\) setIsReviewModalOpen\(false\); \}\)/.test(review_submit));

if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('All checks passed');
