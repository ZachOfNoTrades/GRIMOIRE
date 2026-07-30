// Absolute base URL for links we put in outbound content (emails, mostly), where a relative
// path is meaningless. Prefers an explicit APP_BASE_URL override and otherwise reuses
// NEXTAUTH_URL, which .env.local already pins to the public host (an empty one 500s every
// route, so it is always set here). Trailing slashes are stripped so callers can concatenate.

export function appBaseUrl(): string {
  const raw = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || '';
  return raw.replace(/\/+$/, '');
}
