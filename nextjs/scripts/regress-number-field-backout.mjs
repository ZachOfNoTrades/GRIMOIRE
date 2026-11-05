#!/usr/bin/env node
// Regression check: a number field can be emptied while editing, its limits apply only when it is left, and a decimal field keeps a typed 0
// Usage: node scripts/regress-number-field-backout.mjs
// NOTE: Needs no database or running server; it loads lib/numberDraft.ts and reads the app's source
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
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

// Transpile lib/numberDraft.ts and run it
const LoadNumberDraft = () => {
  const module_path = join(nextjs_path, 'lib/numberDraft.ts');
  const module = { exports: {} };
  const compiled_source = ts.transpileModule(readFileSync(module_path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(compiled_source, { module, exports: module.exports, require }, { filename: module_path });
  return module.exports;
};

const { parseNumberDraft, formatNumberDraft, settleNumberDraft } = LoadNumberDraft();

// Read drafts as typed, with an emptied or half-typed field as null rather than 0
Check('an emptied draft reads as null', parseNumberDraft('') === null);
Check('a blank draft reads as null', parseNumberDraft('  ') === null);
Check('a lone minus sign reads as null', parseNumberDraft('-') === null);
Check('a typed number reads as that number', parseNumberDraft('2.5') === 2.5);
Check('a typed 0 reads as 0', parseNumberDraft('0') === 0);
Check('null shows as an empty field', formatNumberDraft(null) === '');
Check('0 shows as 0', formatNumberDraft(0) === '0');

// Apply limits only when the field is left, keeping an empty field empty
Check('leaving an empty field keeps it empty', settleNumberDraft('', { min: 1, max: 10 }) === null);
Check('leaving a field below its minimum raises it', settleNumberDraft('0.2', { min: 1, max: 10 }) === 1);
Check('leaving a field above its maximum lowers it', settleNumberDraft('25', { min: 1, max: 10 }) === 10);
Check('leaving a whole-number field rounds it', settleNumberDraft('3.6', { integer: true }) === 4);
Check('leaving a field in range keeps the value', settleNumberDraft('3.5', { min: 1, max: 10 }) === 3.5);

// List the app's .tsx files
const ListTsx = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (name === 'node_modules' || name.startsWith('.')) return [];
  if (statSync(path).isDirectory()) return ListTsx(path);
  return path.endsWith('.tsx') ? [path] : [];
});

// Find number inputs that turn each keystroke into a number, which puts a 0 or a limit back into an emptied field
const number_input_pattern = /<input\b(?:[^>]|=>)*?\/>/gs;
const numeric_marker_pattern = /type=["{]+number|inputMode=["{]+(numeric|decimal)/;
const keystroke_parse_pattern = /onChange=\{[^}]*\b(Number|parseInt|parseFloat)\(/s;
const offenders = [];
for (const file of [...ListTsx(join(nextjs_path, 'app')), ...ListTsx(join(nextjs_path, 'components'))]) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(number_input_pattern)) {
    const element = match[0];
    if (!numeric_marker_pattern.test(element) || /type=["{]+range/.test(element)) continue;
    if (!keystroke_parse_pattern.test(element)) continue;
    const line = source.slice(0, match.index).split('\n').length;
    offenders.push(`${relative(nextjs_path, file)}:${line}`);
  }
}
Check('no number input parses its value on each keystroke; use NumberField', offenders.length === 0, offenders.join(', '));

// Find decimal number inputs that show 0 as empty, which drops a typed "0" before its "." and keeps a weight below 1 from being typed
const zero_hiding_offenders = [];
for (const file of [...ListTsx(join(nextjs_path, 'app')), ...ListTsx(join(nextjs_path, 'components'))]) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(number_input_pattern)) {
    const element = match[0];
    if (!numeric_marker_pattern.test(element) || !/step=["{]+0?\.\d/.test(element)) continue;
    if (!/value=\{[^}]*\|\|\s*""\}/.test(element)) continue;
    zero_hiding_offenders.push(`${relative(nextjs_path, file)}:${source.slice(0, match.index).split('\n').length}`);
  }
}
Check('no decimal number input hides a typed 0; use NumberField', zero_hiding_offenders.length === 0, zero_hiding_offenders.join(', '));

// Confirm set logging's weight field keeps a typed 0 while a weight below 1 is typed, and reads an untouched weight of 0 as empty
const set_tab_source = readFileSync(join(nextjs_path, 'app/modules/golem/ui/session/[id]/SetTab.tsx'), 'utf8');
Check('set logging weight is a NumberField', /<NumberField\s+id=\{`\$\{set\.id\}-weight`\}/.test(set_tab_source));
Check('set logging weight shows a weight of 0 as empty', /value=\{set\.weight > 0 \? set\.weight : null\}/.test(set_tab_source));
Check('typing 0, then 0., then 0.5 reads as 0, 0 and 0.5', ['0', '0.', '0.5'].map(parseNumberDraft).join(',') === '0,0,0.5');

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('All number field checks passed');
