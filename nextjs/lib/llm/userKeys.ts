import sql from "mssql";
import { getMainConnection } from "@/lib/db";
import { openForUser, sealForUser } from "@/lib/userSecrets";
import { LlmBackendError, redactSecrets } from "./types";

// PER-USER OPENROUTER KEYS — dbo.user_llm_keys in the MAIN database.
//
// This is the only module that reads or writes the table. The plaintext key exists
// in three places and nowhere else: the PUT request body, `saveOpenRouterKey` while
// it is being validated and sealed, and the callback handed to `withOpenRouterKey`.
// Nothing returns it, nothing caches it, nothing logs it. Every statement is scoped
// by user_id, and the ciphertext is bound to that user (lib/userSecrets.ts), so a
// key can never be read on behalf of anyone but its owner.

export interface OpenRouterKeyStatus {
  configured: boolean;
  last4: string | null;
  label: string | null;
  ts_updated: string | null;
}

const NOT_CONFIGURED: OpenRouterKeyStatus = { configured: false, last4: null, label: null, ts_updated: null };

const OPENROUTER_API = "https://openrouter.ai/api/v1";
const KEY_PATTERN = /^sk-or-v1-[A-Za-z0-9]{32,128}$/;

export function looksLikeOpenRouterKey(value: unknown): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value.trim());
}

// What OpenRouter reports about a key (GET /api/v1/key). Used to validate a key
// before it is stored and to label it in the UI.
export interface OpenRouterKeyInfo {
  label: string | null;
  limit: number | null;
  limitRemaining: number | null;
  usage: number | null;
}

export async function describeOpenRouterKey(key: string): Promise<OpenRouterKeyInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_API}/key`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
  } catch (error) {
    throw new LlmBackendError("openrouter_error", `OpenRouter is unreachable: ${redactSecrets(error instanceof Error ? error.message : String(error))}`);
  } finally {
    clearTimeout(timer);
  }
  if (response.status === 401 || response.status === 403) {
    throw new LlmBackendError("openrouter_auth", "OpenRouter rejected this key", 422);
  }
  if (!response.ok) {
    throw new LlmBackendError("openrouter_error", `OpenRouter answered ${response.status} while checking the key`);
  }
  const body = (await response.json().catch(() => null)) as { data?: Record<string, unknown> } | null;
  const data = body?.data ?? {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  // OpenRouter's default label is the masked key itself ("sk-or-v1-f5a...117"), which
  // would only repeat the last-4 shown next to it; keep a label only when it's a name.
  const label = typeof data.label === "string" && !/^sk-or-/.test(data.label) ? data.label.slice(0, 100) : null;
  return {
    label,
    limit: num(data.limit),
    limitRemaining: num(data.limit_remaining),
    usage: num(data.usage),
  };
}

export async function getOpenRouterKeyStatus(userId: string): Promise<OpenRouterKeyStatus> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .query<{ key_last4: string; key_label: string | null; ts_updated: Date }>(
      `SELECT key_last4, key_label, ts_updated
       FROM user_llm_keys
       WHERE user_id = @userId AND provider = 'openrouter'`
    );
  if (result.recordset.length === 0) return { ...NOT_CONFIGURED };
  const row = result.recordset[0];
  return { configured: true, last4: row.key_last4, label: row.key_label, ts_updated: row.ts_updated.toISOString() };
}

// Validate against OpenRouter, then seal and upsert. Returns the status shape, never
// the key.
export async function saveOpenRouterKey(userId: string, key: string): Promise<OpenRouterKeyStatus> {
  const trimmed = key.trim();
  if (!looksLikeOpenRouterKey(trimmed)) {
    throw new LlmBackendError("openrouter_auth", "That doesn't look like an OpenRouter key (sk-or-v1-…)", 400);
  }
  const info = await describeOpenRouterKey(trimmed);
  const sealed = sealForUser(userId, trimmed);

  const pool = await getMainConnection();
  await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .input("ciphertext", sql.VarBinary(512), sealed.ciphertext)
    .input("iv", sql.Binary, sealed.iv)
    .input("tag", sql.Binary, sealed.tag)
    .input("last4", sql.Char(4), trimmed.slice(-4))
    .input("label", sql.NVarChar(100), info.label)
    .query(
      `MERGE user_llm_keys AS target
       USING (SELECT @userId AS user_id) AS source
          ON target.user_id = source.user_id AND target.provider = 'openrouter'
       WHEN MATCHED THEN
          UPDATE SET key_ciphertext = @ciphertext, key_iv = @iv, key_tag = @tag,
                     key_last4 = @last4, key_label = @label, ts_updated = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN
          INSERT (user_id, provider, key_ciphertext, key_iv, key_tag, key_last4, key_label)
          VALUES (@userId, 'openrouter', @ciphertext, @iv, @tag, @last4, @label);`
    );
  return getOpenRouterKeyStatus(userId);
}

export async function deleteOpenRouterKey(userId: string): Promise<void> {
  const pool = await getMainConnection();
  await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .query(`DELETE FROM user_llm_keys WHERE user_id = @userId AND provider = 'openrouter'`);
}

// Run `fn` with the user's decrypted key. The key never leaves this call: it is not
// returned, not stored on any object that outlives `fn`, and not logged.
export async function withOpenRouterKey<T>(userId: string, fn: (key: string) => Promise<T>): Promise<T> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .query<{ key_ciphertext: Buffer; key_iv: Buffer; key_tag: Buffer }>(
      `SELECT key_ciphertext, key_iv, key_tag
       FROM user_llm_keys
       WHERE user_id = @userId AND provider = 'openrouter'`
    );
  if (result.recordset.length === 0) {
    throw new LlmBackendError("openrouter_key_missing", "OpenRouter key not configured — add one in Settings → AI", 409);
  }
  const row = result.recordset[0];
  let key: string;
  try {
    key = openForUser(userId, { ciphertext: row.key_ciphertext, iv: row.key_iv, tag: row.key_tag });
  } catch {
    // Wrong master key or a row that doesn't belong to this user. Treated as "no
    // usable key" rather than leaking which.
    throw new LlmBackendError("openrouter_key_missing", "Stored OpenRouter key can't be read — remove it and add it again", 409);
  }
  return fn(key);
}
