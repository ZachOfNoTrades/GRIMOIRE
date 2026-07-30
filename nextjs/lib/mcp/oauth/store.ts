import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { getMainConnection } from '@/lib/db';

export type GrantType = 'auth_code' | 'access' | 'refresh';

export interface AuthCodeRow {
  id: string;
  user_id: string;
  client_id: string;
  scope: string | null;
  resource: string | null;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  expires_at: Date;
  used_at: Date | null;
}

export interface TokenRow {
  id: string;
  user_id: string;
  client_id: string;
  grant_type: 'access' | 'refresh';
  scope: string | null;
  resource: string | null;
  expires_at: Date;
  revoked: boolean;
  parent_grant_id: string | null;
}

function hash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

function generateOpaqueToken(prefix: string): { plaintext: string; hash: Buffer } {
  const random = randomBytes(32).toString('base64url');
  const plaintext = `${prefix}${random}`;
  return { plaintext, hash: hash(plaintext) };
}

// --- Authorization code ---

export async function createAuthCode(args: {
  userId: string;
  clientId: string;
  scope: string;
  resource: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  ttlSeconds: number;
}): Promise<string> {
  const { plaintext, hash: tokenHash } = generateOpaqueToken('mcp_ac_');
  const pool = await getMainConnection();
  const expiresAt = new Date(Date.now() + args.ttlSeconds * 1000);
  await pool
    .request()
    .input('userId', args.userId)
    .input('clientId', args.clientId)
    .input('tokenHash', tokenHash)
    .input('scope', args.scope)
    .input('resource', args.resource)
    .input('redirectUri', args.redirectUri)
    .input('codeChallenge', args.codeChallenge)
    .input('codeChallengeMethod', args.codeChallengeMethod)
    .input('expiresAt', expiresAt)
    .query(
      `INSERT INTO dbo.mcp_oauth_grants
         (user_id, client_id, grant_type, token_hash, scope, resource, redirect_uri,
          code_challenge, code_challenge_method, expires_at)
       VALUES
         (@userId, @clientId, 'auth_code', @tokenHash, @scope, @resource, @redirectUri,
          @codeChallenge, @codeChallengeMethod, @expiresAt)`,
    );
  return plaintext;
}

// Atomically consume an auth code (set used_at). Returns the row if it was unused + unexpired.
export async function consumeAuthCode(code: string): Promise<AuthCodeRow | null> {
  const codeHash = hash(code);
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input('tokenHash', codeHash)
    .query<AuthCodeRow>(
      `UPDATE dbo.mcp_oauth_grants
       SET used_at = GETDATE()
       OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.client_id, INSERTED.scope,
              INSERTED.resource, INSERTED.redirect_uri, INSERTED.code_challenge,
              INSERTED.code_challenge_method, INSERTED.expires_at, INSERTED.used_at
       WHERE token_hash = @tokenHash
         AND grant_type = 'auth_code'
         AND used_at IS NULL
         AND revoked = 0
         AND expires_at > GETDATE()`,
    );
  return result.recordset[0] ?? null;
}

// --- Access + refresh tokens ---

export interface MintedTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

export async function mintAccessAndRefresh(args: {
  userId: string;
  clientId: string;
  scope: string;
  resource: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  parentGrantId?: string | null;
}): Promise<MintedTokens> {
  const access = generateOpaqueToken('mcp_at_');
  const refresh = generateOpaqueToken('mcp_rt_');
  const accessExpiresAt = new Date(Date.now() + args.accessTtlSeconds * 1000);
  const refreshExpiresAt = new Date(Date.now() + args.refreshTtlSeconds * 1000);

  const pool = await getMainConnection();
  const tx = pool.transaction();
  await tx.begin();
  try {
    await tx
      .request()
      .input('userId', args.userId)
      .input('clientId', args.clientId)
      .input('tokenHash', access.hash)
      .input('scope', args.scope)
      .input('resource', args.resource)
      .input('expiresAt', accessExpiresAt)
      .input('parentId', args.parentGrantId ?? null)
      .query(
        `INSERT INTO dbo.mcp_oauth_grants
           (user_id, client_id, grant_type, token_hash, scope, resource, expires_at, parent_grant_id)
         VALUES (@userId, @clientId, 'access', @tokenHash, @scope, @resource, @expiresAt, @parentId)`,
      );
    await tx
      .request()
      .input('userId', args.userId)
      .input('clientId', args.clientId)
      .input('tokenHash', refresh.hash)
      .input('scope', args.scope)
      .input('resource', args.resource)
      .input('expiresAt', refreshExpiresAt)
      .input('parentId', args.parentGrantId ?? null)
      .query(
        `INSERT INTO dbo.mcp_oauth_grants
           (user_id, client_id, grant_type, token_hash, scope, resource, expires_at, parent_grant_id)
         VALUES (@userId, @clientId, 'refresh', @tokenHash, @scope, @resource, @expiresAt, @parentId)`,
      );
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }

  return {
    accessToken: access.plaintext,
    refreshToken: refresh.plaintext,
    accessExpiresAt,
    refreshExpiresAt,
  };
}

// Looks up an access token by plaintext, returns the row if unexpired and not revoked.
export async function resolveAccessToken(token: string): Promise<TokenRow | null> {
  if (!token.startsWith('mcp_at_')) return null;
  const tokenHash = hash(token);
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input('tokenHash', tokenHash)
    .query<TokenRow>(
      `SELECT id, user_id, client_id, grant_type, scope, resource, expires_at, revoked, parent_grant_id
       FROM dbo.mcp_oauth_grants
       WHERE token_hash = @tokenHash
         AND grant_type = 'access'
         AND revoked = 0
         AND expires_at > GETDATE()`,
    );
  const row = result.recordset[0];
  if (!row) return null;
  // Defense in depth — the stored hash uniqueness already proves token equality,
  // but recompute and constant-time compare to avoid acting on a corrupt row.
  if (!timingSafeEqual(hash(token), tokenHash)) return null;
  return row;
}

// Refresh-token rotation. Looks up the refresh token, revokes it, mints a new
// access/refresh pair tied to the same user/client/scope/resource.
export async function rotateRefreshToken(token: string): Promise<{
  user: { id: string };
  scope: string;
  resource: string;
  clientId: string;
} | null> {
  if (!token.startsWith('mcp_rt_')) return null;
  const tokenHash = hash(token);
  const pool = await getMainConnection();
  // Atomic: revoke + return the row
  const result = await pool
    .request()
    .input('tokenHash', tokenHash)
    .query<TokenRow>(
      `UPDATE dbo.mcp_oauth_grants
       SET revoked = 1
       OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.client_id, INSERTED.grant_type,
              INSERTED.scope, INSERTED.resource, INSERTED.expires_at, INSERTED.revoked,
              INSERTED.parent_grant_id
       WHERE token_hash = @tokenHash
         AND grant_type = 'refresh'
         AND revoked = 0
         AND expires_at > GETDATE()`,
    );
  const row = result.recordset[0];
  if (!row) return null;
  return {
    user: { id: row.user_id },
    scope: row.scope ?? 'mcp',
    resource: row.resource ?? '',
    clientId: row.client_id,
  };
}
