#!/usr/bin/env node
// Regression check: a Forage check-in keeps the current targets when the last 7 days have fewer logged days or weigh-ins than the user's minimums or the user keeps them, and both minimums are user settings with defaults
// Usage: node scripts/regress-forage-checkin-hold.mjs
// NOTE: Needs no database or running server; it loads lib/checkInHold.ts and reads the app's sources
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const nextjs_path = fileURLToPath(new URL('../', import.meta.url));
const forage_path = join(nextjs_path, 'app/modules/forage');

let failures = 0;
const Check = (label, run) => {
  let ok = false;
  let detail = '';
  try {
    ok = run();
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
};

// Transpile a TypeScript file and run it, resolving its relative imports through local_require
const LoadModule = (path, local_require) => {
  const loaded_module = { exports: {} };
  const compiled_source = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(compiled_source, { module: loaded_module, exports: loaded_module.exports, require: local_require }, { filename: path });
  return loaded_module.exports;
};

const read_source = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

// Load the hold rule with its enum
let findCheckInHold = null;
let CheckInHoldReason = {};
const hold_path = join(forage_path, 'lib/checkInHold.ts');
if (existsSync(hold_path)) {
  const hold_types = LoadModule(join(forage_path, 'types/checkInHold.ts'), require);
  CheckInHoldReason = hold_types.CheckInHoldReason;
  ({ findCheckInHold } = LoadModule(hold_path, (name) => (name === '../types/checkInHold' ? hold_types : require(name))));
}
const defaults = { min_logged_days: 4, min_weigh_ins: 3 };

// Check the hold rule
Check('the hold rule exists', () => typeof findCheckInHold === 'function');
Check('a week with no food logged keeps the targets', () =>
  findCheckInHold({ logged_days: 0, weigh_ins: 3 }, defaults)?.reason === CheckInHoldReason.FewLoggedDays);
Check('a week with too few weigh-ins keeps the targets', () =>
  findCheckInHold({ logged_days: 7, weigh_ins: 2 }, defaults)?.reason === CheckInHoldReason.FewWeighIns);
Check('a week that meets both minimums changes the targets', () =>
  findCheckInHold({ logged_days: 4, weigh_ins: 3 }, defaults) === null);
Check('minimums of 0 never keep the targets', () =>
  findCheckInHold({ logged_days: 0, weigh_ins: 0 }, { min_logged_days: 0, min_weigh_ins: 0 }) === null);
Check('a hold carries the counts and minimums', () => {
  const hold = findCheckInHold({ logged_days: 1, weigh_ins: 2 }, defaults);
  return hold?.logged_days === 1 && hold.min_logged_days === 4 && hold.weigh_ins === 2 && hold.min_weigh_ins === 3;
});

// Check the minimums are user settings with defaults, not constants in the check-in
const settings_types = read_source(join(forage_path, 'types/settings.ts'));
const checkin_source = read_source(join(forage_path, 'lib/checkinFunctions.ts'));
Check('the settings default to 4 logged days and 3 weigh-ins', () =>
  /checkin_min_logged_days:\s*4/.test(settings_types) && /checkin_min_weigh_ins:\s*3/.test(settings_types));
Check('the check-in reads the minimums from the user settings', () =>
  checkin_source.includes('settings.checkin_min_logged_days') && checkin_source.includes('settings.checkin_min_weigh_ins'));
Check('the check-in has no fixed weigh-in minimum', () => !checkin_source.includes('MIN_WEIGH_INS_PER_WEEK'));
Check('a held check-in writes no target', () => /if \(\(hold \|\| isKeepingCurrent\) && previous\)[\s\S]{0,200}markCheckIn[\s\S]{0,120}return \{ applied: true, target: previous/.test(checkin_source));
Check('a declined check-in skips the stale preview check', () => checkin_source.includes('expected && !isKeepingCurrent && !sameMacros'));
Check('the confirm route reads keep_current', () => read_source(join(forage_path, 'api/checkin/confirm/route.ts')).includes('keep_current === true'));
const settings_page = read_source(join(forage_path, 'ui/settings/check-in/page.tsx'));
Check('the minimum fields stay off until the settings load', () =>
  (settings_page.match(/disabled=\{!isMinimumsLoaded\}/g) ?? []).length === 2 && settings_page.includes('setIsMinimumsLoaded(true)'));
Check('a migration adds both setting columns', () => {
  const migration = read_source(join(nextjs_path, '../sql/migrations/food/V3__add_checkin_hold_minimums.sql'));
  return migration.includes('checkin_min_logged_days') && migration.includes('checkin_min_weigh_ins');
});

if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('All checks passed');
