import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { ensureSecretEnv } from "@/lib/secretCache";

// PER-USER SECRET SEALING — AES-256-GCM under the app-wide USER_SECRETS_KEY (Infisical).
//
// Every blob is bound to the user it was sealed for: the user id is the GCM
// additional authenticated data, so a ciphertext copied onto another user's row (or
// a row whose user_id was edited) fails authentication instead of decrypting. The
// key itself is never derived from NEXTAUTH_SECRET — rotating sessions must not
// brick stored secrets.

export interface SealedSecret {
  ciphertext: Buffer;
  iv: Buffer;   // 12 bytes
  tag: Buffer;  // 16 bytes
}

const IV_BYTES = 12;

// The 32-byte key, decoded from its base64 form in the environment. Hot-reloads can
// clobber process.env, so the secret cache is re-applied first (the same guard the
// DB layer uses). A missing key is a hard error — there is no plaintext path.
function masterKey(): Buffer {
  if (!process.env.USER_SECRETS_KEY?.length) ensureSecretEnv();
  const raw = process.env.USER_SECRETS_KEY;
  if (!raw) throw new Error("USER_SECRETS_KEY is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("USER_SECRETS_KEY must decode to 32 bytes");
  return key;
}

// Normalized AAD — SQL Server returns GUIDs upper-cased, NextAuth lower-cased.
function aadFor(userId: string): Buffer {
  return Buffer.from(userId.trim().toLowerCase(), "utf8");
}

export function sealForUser(userId: string, plaintext: string): SealedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  cipher.setAAD(aadFor(userId));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

export function openForUser(userId: string, sealed: SealedSecret): string {
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), sealed.iv);
  decipher.setAAD(aadFor(userId));
  decipher.setAuthTag(sealed.tag);
  // A wrong user, a wrong key, or a tampered row all surface here as a generic
  // "Unsupported state or unable to authenticate data" — callers must not log the
  // blob.
  return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString("utf8");
}
