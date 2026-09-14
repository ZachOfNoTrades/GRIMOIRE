import { createHash, randomBytes } from "crypto";

// Guest credentials. Same construction as lib/apiKeys.ts (random bytes, only the SHA-256
// hash is stored) with a distinct prefix so the two token families can never be confused.
const TOKEN_PREFIX = "dmn_";
const RANDOM_BYTES = 32;

// Guests send the token in this header, not `Authorization: Bearer` — middleware and
// getAuthorizedUser treat every Bearer header as a possible Grimoire API key.
export const PLAYER_TOKEN_HEADER = "x-damnation-token";

export function generatePlayerToken(): { plaintext: string; hash: Buffer } {
  const plaintext = `${TOKEN_PREFIX}${randomBytes(RANDOM_BYTES).toString("base64url")}`;
  return { plaintext, hash: hashPlayerToken(plaintext) };
}

export function hashPlayerToken(plaintext: string): Buffer {
  return createHash("sha256").update(plaintext, "utf8").digest();
}

// Returns the hash of a well-formed token from the request, or null.
export function readPlayerTokenHash(request: Request): Buffer | null {
  const provided = request.headers.get(PLAYER_TOKEN_HEADER);
  if (!provided || !provided.startsWith(TOKEN_PREFIX) || provided.length > 100) return null;
  return hashPlayerToken(provided);
}
