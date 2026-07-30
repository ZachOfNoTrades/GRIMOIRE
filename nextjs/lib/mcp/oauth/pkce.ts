import { createHash } from 'crypto';

// PKCE S256 verification per RFC 7636: code_challenge = BASE64URL(SHA256(code_verifier)).
export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  if (!codeVerifier || !codeChallenge) return false;
  // RFC 7636: code_verifier is 43-128 chars, [A-Z][a-z][0-9]-._~
  if (codeVerifier.length < 43 || codeVerifier.length > 128) return false;
  if (!/^[A-Za-z0-9._~\-]+$/.test(codeVerifier)) return false;

  const computed = createHash('sha256').update(codeVerifier, 'utf8').digest('base64url');
  // Constant-time compare via length+byte comparison through Buffer
  if (computed.length !== codeChallenge.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ codeChallenge.charCodeAt(i);
  }
  return diff === 0;
}
