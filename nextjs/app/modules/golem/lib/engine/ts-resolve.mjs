// Resolve hook for the dev harnesses (verify.mjs / simulate-program.mjs).
//
// The engine's .ts modules import their siblings WITHOUT a file extension, which is what TypeScript and
// Next expect. Node's --experimental-strip-types does no extension resolution, so as soon as one .ts file
// gained a runtime (non-type) import of another, the harnesses stopped loading. This hook adds just that
// one missing step: a relative specifier with no extension that exists on disk as `.ts` resolves to it.
//
// Run a harness with:  node --import ./app/modules/golem/lib/engine/ts-resolve.mjs --experimental-strip-types <harness>.mjs
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register(new URL('./ts-resolve-hooks.mjs', import.meta.url), pathToFileURL('./'));
