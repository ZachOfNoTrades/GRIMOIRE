import { NextResponse } from 'next/server';
import { getOAuthConfig } from '@/lib/mcp/oauth/config';
import { verifyPkceS256 } from '@/lib/mcp/oauth/pkce';
import {
  consumeAuthCode,
  mintAccessAndRefresh,
  rotateRefreshToken,
} from '@/lib/mcp/oauth/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, code: string, description?: string) {
  return NextResponse.json(
    { error: code, ...(description ? { error_description: description } : {}) },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json',
        ...(status === 401 ? { 'www-authenticate': 'Basic realm="grimoire-mcp-oauth"' } : {}),
      },
    },
  );
}

// Validates the client_id + client_secret presented either in HTTP Basic auth or in the form body.
function authenticateClient(headers: Headers, body: URLSearchParams, clientId: string, clientSecret: string): boolean {
  // RFC 6749 prefers Basic; we also accept client_secret_post for tolerance.
  const authz = headers.get('authorization');
  if (authz && authz.toLowerCase().startsWith('basic ')) {
    try {
      const decoded = Buffer.from(authz.slice(6).trim(), 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      if (idx < 0) return false;
      const cid = decodeURIComponent(decoded.slice(0, idx));
      const csec = decodeURIComponent(decoded.slice(idx + 1));
      return cid === clientId && csec === clientSecret;
    } catch {
      return false;
    }
  }
  const cid = body.get('client_id');
  const csec = body.get('client_secret');
  return cid === clientId && csec === clientSecret;
}

// OAuth 2.1 token endpoint. Accepts:
//  - grant_type=authorization_code  (initial exchange)
//  - grant_type=refresh_token       (rotation)
// Body is application/x-www-form-urlencoded per spec.
export async function POST(request: Request) {
  const cfg = getOAuthConfig();

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/x-www-form-urlencoded')) {
    return jsonError(400, 'invalid_request', 'Content-Type must be application/x-www-form-urlencoded');
  }

  const raw = await request.text();
  const body = new URLSearchParams(raw);

  if (!authenticateClient(request.headers, body, cfg.clientId, cfg.clientSecret)) {
    return jsonError(401, 'invalid_client', 'client_id or client_secret invalid');
  }

  const grantType = body.get('grant_type');

  if (grantType === 'authorization_code') {
    const code = body.get('code');
    const redirectUri = body.get('redirect_uri');
    const codeVerifier = body.get('code_verifier');
    const resource = body.get('resource');

    if (!code) return jsonError(400, 'invalid_request', 'code is required');
    if (!codeVerifier) return jsonError(400, 'invalid_request', 'code_verifier is required');
    if (!redirectUri) return jsonError(400, 'invalid_request', 'redirect_uri is required');
    if (!resource) return jsonError(400, 'invalid_target', 'resource parameter is required');
    if (resource !== cfg.resource) {
      return jsonError(400, 'invalid_target', `resource must equal ${cfg.resource}`);
    }

    const authCode = await consumeAuthCode(code);
    if (!authCode) return jsonError(400, 'invalid_grant', 'code is unknown, expired, or already used');
    if (authCode.redirect_uri !== redirectUri) {
      return jsonError(400, 'invalid_grant', 'redirect_uri does not match the authorization request');
    }
    if (authCode.resource !== resource) {
      return jsonError(400, 'invalid_target', 'resource does not match the authorization request');
    }
    if (!verifyPkceS256(codeVerifier, authCode.code_challenge)) {
      return jsonError(400, 'invalid_grant', 'PKCE verification failed');
    }

    const tokens = await mintAccessAndRefresh({
      userId: authCode.user_id,
      clientId: cfg.clientId,
      scope: authCode.scope ?? cfg.scope,
      resource: authCode.resource ?? cfg.resource,
      accessTtlSeconds: cfg.accessTokenTtlSeconds,
      refreshTtlSeconds: cfg.refreshTokenTtlSeconds,
      parentGrantId: authCode.id,
    });

    return NextResponse.json(
      {
        access_token: tokens.accessToken,
        token_type: 'Bearer',
        expires_in: cfg.accessTokenTtlSeconds,
        refresh_token: tokens.refreshToken,
        scope: authCode.scope ?? cfg.scope,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  if (grantType === 'refresh_token') {
    const refreshToken = body.get('refresh_token');
    const resource = body.get('resource');
    if (!refreshToken) return jsonError(400, 'invalid_request', 'refresh_token is required');
    // resource is optional on refresh per RFC 8707, but if provided must match.
    if (resource && resource !== cfg.resource) {
      return jsonError(400, 'invalid_target', `resource must equal ${cfg.resource}`);
    }

    const rotated = await rotateRefreshToken(refreshToken);
    if (!rotated) return jsonError(400, 'invalid_grant', 'refresh_token is unknown, expired, or already used');

    const tokens = await mintAccessAndRefresh({
      userId: rotated.user.id,
      clientId: cfg.clientId,
      scope: rotated.scope,
      resource: rotated.resource || cfg.resource,
      accessTtlSeconds: cfg.accessTokenTtlSeconds,
      refreshTtlSeconds: cfg.refreshTokenTtlSeconds,
    });

    return NextResponse.json(
      {
        access_token: tokens.accessToken,
        token_type: 'Bearer',
        expires_in: cfg.accessTokenTtlSeconds,
        refresh_token: tokens.refreshToken,
        scope: rotated.scope,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  return jsonError(400, 'unsupported_grant_type', `grant_type ${grantType} not supported`);
}
