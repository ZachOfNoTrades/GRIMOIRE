// Durable, process-global cache of the secrets resolved from Infisical at boot.
//
// instrumentation.node.ts populates this once at startup; the DB layer re-hydrates
// process.env from it on demand (see ensureSecretEnv). It lives on globalThis so it
// survives `next dev` module re-evaluation across hot-reloads — the Node process, and
// therefore globalThis, persists — whereas plain module-level state and the process.env
// values injected by instrumentation do NOT survive an env re-read. This is what stops
// the recurring "Failed to connect to :1433" (empty DB host) timeouts mid-session.

type SecretCache = Record<string, string>;

// GLOBAL CACHE HANDLE — stashed on globalThis so it outlives module re-evaluation.
const globalForSecrets = globalThis as unknown as {
  __grimoireSecretCache?: SecretCache;
};

// Store the resolved secrets so a later clobbered process.env can be re-hydrated.
export function cacheResolvedSecrets(
  secrets: { secretKey: string; secretValue: string }[]
): void {
  const cache: SecretCache = {};
  for (const secret of secrets) {
    cache[secret.secretKey] = secret.secretValue;
  }
  globalForSecrets.__grimoireSecretCache = cache;
}

// Re-apply any process.env key that is currently empty from the cache. Cheap and
// idempotent — safe to call at the top of every DB connection path. Returns the list of
// keys it re-applied (empty when nothing needed re-hydrating), so callers can log the
// recovery of a hot-reload env clobber.
export function ensureSecretEnv(): string[] {
  const cache = globalForSecrets.__grimoireSecretCache;
  if (!cache) return [];

  const rehydrated: string[] = [];
  for (const key in cache) {
    if (!process.env[key]?.length) {
      process.env[key] = cache[key];
      rehydrated.push(key);
    }
  }
  return rehydrated;
}
