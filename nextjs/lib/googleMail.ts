// Sends transactional email through the recipient's own Gmail account, server-side only.
//
// Why this exists: every notification in the app already goes to the user's own address, but
// actually delivering one needed an SMTP credential that nobody had provisioned — so every send
// came back "email not configured" and the whole notification system was silently dead. Everyone
// signs in with Google, so the mailbox we need is already connected: sign-in asks for the
// gmail.send scope, the refresh token lands in dbo.user_google_tokens, and each user's
// notifications are sent from their own Gmail to their own inbox. No shared mail credential, and
// revoking Grimoire in Google account settings switches it off at the source.
//
// A connected Gmail account is preferred over the SMTP transport in lib/email.ts: it is the
// address the user actually asked their notifications to come from. SMTP stays as the fallback for
// users who never connected one (an account created through the API, say).

import sql from 'mssql';
import { getMainConnection } from '@/lib/db';

// The one scope we ask for beyond sign-in. Send-only: it cannot read the user's mail.
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

// Access tokens live an hour; refresh a minute early so a send can't race the expiry.
const ACCESS_TOKEN_TTL_MS = 55 * 60 * 1000;

export interface GmailSender {
  userId: string;
  // The Google account address. Also the From header — Gmail rejects a From it doesn't own.
  address: string;
  refreshToken: string;
}

// ---------------------------------------------------------------- configuration

// Whether the app *could* send via Gmail at all. Per-user connection is a separate question
// (hasGmailConnection) — this is only the OAuth client the token exchange needs.
export function isGoogleMailConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// True when Google granted the send scope, not just the sign-in scopes. Google returns the
// granted scopes space-separated; a null scope predates this check, so treat it as granted.
export function scopeAllowsSend(scope: string | null): boolean {
  if (!scope) return true;
  return scope.split(/\s+/).includes(GMAIL_SEND_SCOPE);
}

// ---------------------------------------------------------------- token store

// Google documents refresh tokens as at most 512 bytes, which is what the column holds. Refuse
// anything longer rather than let mssql truncate it silently — a truncated token authenticates
// nothing, and the failure would only show up as an unexplained "revoked" days later.
const REFRESH_TOKEN_MAX_LENGTH = 512;

export async function saveGoogleRefreshToken(
  userId: string,
  refreshToken: string,
  scope: string | null,
): Promise<void> {
  if (refreshToken.length > REFRESH_TOKEN_MAX_LENGTH) {
    throw new Error(
      `Google refresh token for user '${userId}' is ${refreshToken.length} chars, over the ${REFRESH_TOKEN_MAX_LENGTH} the column holds`,
    );
  }
  const pool = await getMainConnection();
  await pool
    .request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('refreshToken', sql.NVarChar(512), refreshToken)
    .input('scope', sql.NVarChar(1000), scope)
    .query(
      `MERGE dbo.user_google_tokens AS target
       USING (SELECT @userId AS user_id) AS source
         ON target.user_id = source.user_id
       WHEN MATCHED THEN
         UPDATE SET refresh_token = @refreshToken, scope = @scope, ts_updated = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN
         INSERT (user_id, refresh_token, scope) VALUES (@userId, @refreshToken, @scope);`,
    );
}

export async function deleteGoogleRefreshToken(userId: string): Promise<void> {
  const pool = await getMainConnection();
  await pool
    .request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`DELETE FROM dbo.user_google_tokens WHERE user_id = @userId`);
  accessTokenCache().delete(userId);
}

// One lookup for both halves of a send: the token to authenticate with and the address to put in
// the From header. They come from different tables but a sender needs them together, and the
// users row is the only place the Google account address is recorded.
export async function getGmailSender(userId: string): Promise<GmailSender | null> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<{ email: string; refresh_token: string | null; scope: string | null }>(
      `SELECT u.email, t.refresh_token, t.scope
       FROM dbo.users u
       LEFT JOIN dbo.user_google_tokens t ON t.user_id = u.id
       WHERE u.id = @userId`,
    );
  if (result.recordset.length === 0) {
    console.warn(`No user found for id: '${userId}'`);
    return null;
  }
  const row = result.recordset[0];
  if (!row.refresh_token || !scopeAllowsSend(row.scope)) return null;
  return { userId, address: row.email, refreshToken: row.refresh_token };
}

export async function hasGmailConnection(userId: string): Promise<boolean> {
  return (await getGmailSender(userId)) !== null;
}

// ---------------------------------------------------------------- access tokens

// Cached on globalThis for the same reason the mssql pools and the SMTP transporter are: a
// scheduler tick that sends to several users shouldn't burn a token exchange per message, and
// dev-mode module reloads would otherwise drop the cache on every save.
type GlobalWithTokens = typeof globalThis & {
  __grimoireGmailTokens?: Map<string, { token: string; expiresAt: number }>;
};

function accessTokenCache(): Map<string, { token: string; expiresAt: number }> {
  const g = globalThis as GlobalWithTokens;
  if (!g.__grimoireGmailTokens) g.__grimoireGmailTokens = new Map();
  return g.__grimoireGmailTokens;
}

// Thrown when Google says the refresh token itself is dead (revoked in the user's Google account,
// or the consent was never granted). The stored token is dropped so the UI can offer a reconnect
// instead of retrying a credential that will never work again.
export class GmailAuthError extends Error {}

async function getAccessToken(sender: GmailSender): Promise<string> {
  const cached = accessTokenCache().get(sender.userId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: sender.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !body.access_token) {
    const detail = body.error_description || body.error || `HTTP ${response.status}`;
    // invalid_grant is the terminal case: the user revoked access or changed their password.
    if (body.error === 'invalid_grant') {
      await deleteGoogleRefreshToken(sender.userId);
      throw new GmailAuthError(`Gmail access was revoked — sign in again to reconnect (${detail})`);
    }
    throw new Error(`Gmail token refresh failed: ${detail}`);
  }

  const ttl = body.expires_in ? Math.min(body.expires_in * 1000 - 60_000, ACCESS_TOKEN_TTL_MS) : ACCESS_TOKEN_TTL_MS;
  accessTokenCache().set(sender.userId, { token: body.access_token, expiresAt: Date.now() + ttl });
  return body.access_token;
}

// ---------------------------------------------------------------- send

export interface GmailSendResult {
  messageId: string | null;
}

// Hands a fully-composed RFC 822 message to the Gmail API. The caller builds the MIME (lib/email.ts
// does it with nodemailer) so the SMTP and Gmail paths send byte-identical mail.
export async function sendGmailRawMessage(
  sender: GmailSender,
  rawMessage: Buffer,
): Promise<GmailSendResult> {
  const accessToken = await getAccessToken(sender);
  const response = await fetch(SEND_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ raw: rawMessage.toString('base64url') }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string; status?: string };
  };

  if (!response.ok) {
    const detail = body.error?.message || `HTTP ${response.status}`;
    // A 401/403 here means the grant no longer covers sending — same dead end as invalid_grant.
    if (response.status === 401 || response.status === 403) {
      accessTokenCache().delete(sender.userId);
      throw new GmailAuthError(`Gmail rejected the send — sign in again to reconnect (${detail})`);
    }
    throw new Error(`Gmail send failed: ${detail}`);
  }

  return { messageId: body.id ?? null };
}
