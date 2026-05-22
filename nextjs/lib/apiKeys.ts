import { createHash, randomBytes } from "crypto";
import { headers } from "next/headers";
import type { Session } from "next-auth";
import { getMainConnection } from "@/lib/db";
import type { GeneratedApiKey, UserApiKeySummary } from "@/types/apiKey";

const KEY_PREFIX = "grm_";
const RANDOM_BYTES = 32;
const PREFIX_DISPLAY_LENGTH = KEY_PREFIX.length + 7;

export function generateApiKey(): GeneratedApiKey {
  const plaintext = `${KEY_PREFIX}${randomBytes(RANDOM_BYTES).toString("base64url")}`;
  return {
    plaintext,
    hash: hashApiKey(plaintext),
    prefix: plaintext.slice(0, PREFIX_DISPLAY_LENGTH),
  };
}

export function hashApiKey(plaintext: string): Buffer {
  return createHash("sha256").update(plaintext, "utf8").digest();
}

export async function resolveApiKey(): Promise<Session | null> {
  const provided = (await headers()).get("x-api-key");
  if (!provided || !provided.startsWith(KEY_PREFIX)) return null;

  const candidateHash = hashApiKey(provided);

  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("keyHash", candidateHash)
    .query<{
      key_id: string;
      id: string;
      email: string;
      name: string;
      global_admin: boolean;
      generation_limit: number;
    }>(
      `SELECT k.id AS key_id, u.id, u.email, u.name, u.global_admin, u.generation_limit
       FROM dbo.user_api_keys k
       INNER JOIN dbo.users u ON u.id = k.user_id
       WHERE k.key_hash = @keyHash AND k.revoked = 0 AND u.enabled = 1`
    );

  if (result.recordset.length === 0) return null;

  const row = result.recordset[0];

  // Update the last used value for the API key
  pool
    .request()
    .input("keyId", row.key_id)
    .query(`UPDATE dbo.user_api_keys SET ts_last_used = GETDATE() WHERE id = @keyId`)
    .catch((err) => console.error("Failed to update ts_last_used for api key:", err));

  return {
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      globalAdmin: !!row.global_admin,
      generationLimit: row.generation_limit ?? 1,
    },
    expires: "",
  };
}

export async function listUserApiKeys(userId: string): Promise<UserApiKeySummary[]> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("userId", userId)
    .query<UserApiKeySummary>(
      `SELECT id, name, key_prefix, ts_created, ts_last_used
       FROM dbo.user_api_keys
       WHERE user_id = @userId AND revoked = 0
       ORDER BY ts_created DESC`
    );

  if (result.recordset.length === 0) {
    console.warn(`No api keys found for user id: '${userId}'`);
  }

  return result.recordset;
}
