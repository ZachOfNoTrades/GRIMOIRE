import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[mc]?[jt]s$/.test(specifier)) {
    try {
      const candidate = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        // No explicit `format`: let Node classify it as TypeScript so --experimental-strip-types applies.
        return { url: candidate.href, shortCircuit: true };
      }
    } catch { /* fall through to Node's own resolution */ }
  }
  return nextResolve(specifier, context);
}
