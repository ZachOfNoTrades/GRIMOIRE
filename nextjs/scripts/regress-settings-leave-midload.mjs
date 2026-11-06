#!/usr/bin/env node
// Regression check: leaving Rune settings while its first load is in flight logs no error and sets no state
// Usage: node scripts/regress-settings-leave-midload.mjs
// NOTE: Needs no database or browser; it runs lib/pageLoad.ts against a local server that holds its answer, and reads the page's source
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
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

// Transpile a TypeScript file and run it with Node's own AbortController
const LoadModule = (relative_path) => {
  const module_path = join(nextjs_path, relative_path);
  const module = { exports: {} };
  const compiled_source = ts.transpileModule(readFileSync(module_path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(compiled_source, { module, exports: module.exports, require, AbortController }, { filename: module_path });
  return module.exports;
};

// Read a source file, failing the check instead of the script when it is missing
const ReadSource = (relative_path) => {
  try {
    return readFileSync(join(nextjs_path, relative_path), 'utf8');
  } catch {
    return '';
  }
};

let pageLoadModule = {};
try {
  pageLoadModule = LoadModule('lib/pageLoad.ts');
} catch (error) {
  Check('lib/pageLoad.ts loads', false, error.message);
}
const { startPageLoad } = pageLoadModule;

if (typeof startPageLoad === 'function') {
  // Hold every request until the test closes the server
  const held_responses = [];
  const server = createServer((request, response) => held_responses.push(response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;

  // Check stopping a load while its request is open aborts the request
  const unmount_target = new EventTarget();
  const unmount_load = startPageLoad(unmount_target);
  const unmount_request = fetch(url, { signal: unmount_load.signal }).then(() => null, (error) => error);
  setTimeout(() => unmount_load.stop(), 100);
  const unmount_error = await unmount_request;
  Check('stopping a load rejects its open request', unmount_error instanceof Error, unmount_error?.name);
  Check('a load stopped on unmount counts as stopped', unmount_load.isStopped() === true);
  Check('a load stopped on unmount aborts its signal', unmount_load.signal.aborted === true);

  // Check a load counts as stopped once the page starts to unload, with its signal left open
  const leave_target = new EventTarget();
  const leave_load = startPageLoad(leave_target);
  Check('a fresh load does not count as stopped', leave_load.isStopped() === false);
  leave_target.dispatchEvent(new Event('beforeunload'));
  Check('a load counts as stopped once the page starts to unload', leave_load.isStopped() === true);
  Check('starting to unload leaves the signal open', leave_load.signal.aborted === false);

  // Check a dropped connection on a page that is not leaving does not count as stopped
  const failure_load = startPageLoad(new EventTarget());
  const failure_request = fetch(url, { signal: failure_load.signal }).then(() => null, (error) => error);
  await new Promise((resolve) => setTimeout(resolve, 100));
  for (const response of held_responses) response.socket?.destroy();
  const failure_error = await failure_request;
  Check('a dropped connection still rejects', failure_error instanceof Error);
  Check('a real failure does not count as stopped', failure_load.isStopped() === false);

  // Check finishing or stopping a load removes its unload listener
  const CountingTarget = () => {
    const listeners = new Set();
    return {
      listeners,
      addEventListener: (type, listener) => listeners.add(listener),
      removeEventListener: (type, listener) => listeners.delete(listener),
    };
  };
  const finished_target = CountingTarget();
  startPageLoad(finished_target).finish();
  const stopped_target = CountingTarget();
  startPageLoad(stopped_target).stop();
  Check('finishing a load removes its unload listener', finished_target.listeners.size === 0);
  Check('stopping a load removes its unload listener', stopped_target.listeners.size === 0);

  server.closeAllConnections?.();
  server.close();
}

// Confirm Rune settings ties its first load to a page load and ignores a stopped load's failure
const page_source = ReadSource('app/modules/rune/ui/settings/page.tsx');
Check('the page starts a page load', /const pageLoad = startPageLoad\(\)/.test(page_source));
Check('the settings request carries the page load signal', /fetch\("\/modules\/rune\/api\/settings", \{ signal: pageLoad\.signal \}\)/.test(page_source));
Check('a stopped load returns before logging', /catch \(e\) \{\s*if \(pageLoad\.isStopped\(\)\) return;[^\n]*\n\s*console\.error\(e\);/.test(page_source));
Check('an answer after unmount sets no state', /const data = await res\.json\(\);\s*if \(pageLoad\.signal\.aborted\) return;/.test(page_source));
Check('the load stops watching for an unload once it settles', /finally \{\s*pageLoad\.finish\(\);/.test(page_source));
Check('the effect stops the load on unmount', /load\(\);\s*return pageLoad\.stop;/.test(page_source));

// Confirm the email delivery note under the page's notifications ties its request to a page load
const email_source = ReadSource('components/settings/EmailDeliveryStatus.tsx');
Check('the email status request carries the page load signal', /fetch\("\/api\/email\/status", \{ signal: pageLoad\.signal \}\)/.test(email_source));
Check('the email status effect stops the load on unmount', /return pageLoad\.stop;/.test(email_source));

if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('All checks passed');
