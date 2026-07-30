import { readFileSync } from "fs";
import { InfisicalSDK } from "@infisical/sdk";
import { cacheResolvedSecrets } from "./lib/secretCache";

// Number of times to attempt the Infisical login + listSecrets before giving up.
const MAX_ATTEMPTS = 5;
// Base backoff in ms; grows exponentially (500, 1000, 2000, 4000, ...) with jitter.
const BASE_BACKOFF_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetch all secrets for the configured project/environment, retrying transient
// Infisical failures with exponential backoff. Returns the secret list, or throws
// if every attempt fails.
async function fetchSecretsWithRetry(
  client: InfisicalSDK,
  login: { clientId: string; clientSecret: string },
  query: { projectId: string; environment: string }
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await client.auth().universalAuth.login(login);
      const secrets = await client.secrets().listSecrets({
        ...query,
        secretPath: "/",
      });
      return secrets.secrets;
    } catch (error) {
      lastError = error;

      // Don't sleep after the final attempt — we're about to throw.
      if (attempt < MAX_ATTEMPTS) {
        const backoff =
          BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
        console.warn(
          `[instrumentation] Infisical fetch attempt ${attempt}/${MAX_ATTEMPTS} failed, retrying in ${backoff}ms:`,
          error instanceof Error ? error.message : error
        );
        await sleep(backoff);
      }
    }
  }

  throw new Error(
    `[instrumentation] Infisical secret fetch failed after ${MAX_ATTEMPTS} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

export async function register() {
  const credentialsFile = process.env.INFISICAL_CREDENTIALS_FILE;
  const siteUrl = process.env.INFISICAL_SITE_URL;
  const environment = process.env.INFISICAL_ENVIRONMENT;

  // No Infisical config (e.g. a non-managed local dev box) — nothing to inject.
  if (!credentialsFile || !siteUrl || !environment) return;

  const { clientId, clientSecret, projectId } = JSON.parse(
    readFileSync(credentialsFile, "utf-8")
  );

  const client = new InfisicalSDK({ siteUrl });

  // Fail loud: if the fetch can't complete after retries, throw so the process
  // exits and pm2 restarts it, rather than silently serving traffic with empty
  // placeholder secrets (which surfaces as DB ":1433" connect failures,
  // NextAuth error=Configuration, MCP 500s, etc.).
  const secrets = await fetchSecretsWithRetry(
    client,
    { clientId, clientSecret },
    { projectId, environment }
  );

  for (const secret of secrets) {
    if (!process.env[secret.secretKey]?.length) {
      process.env[secret.secretKey] = secret.secretValue;
    }
  }

  // Stash the resolved secrets on globalThis so the DB layer can re-hydrate process.env
  // if a `next dev` hot-reload later drops these injected values (which otherwise
  // surfaces as "Failed to connect to :1433" empty-host timeouts). See lib/secretCache.
  cacheResolvedSecrets(secrets);
}
