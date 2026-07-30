import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOAuthConfig, isRedirectUriAllowed } from '@/lib/mcp/oauth/config';
import { createAuthCode } from '@/lib/mcp/oauth/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Builds an error redirect when we already trust redirect_uri + state. Otherwise renders an HTML page.
function redirectWithError(redirectUri: string, state: string | null, code: string, description: string) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', code);
  url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  return NextResponse.redirect(url, 302);
}

function htmlError(status: number, message: string) {
  return new NextResponse(
    `<!doctype html><html><body style="font-family:system-ui;max-width:540px;margin:80px auto;color:#222"><h1>OAuth error</h1><p>${message}</p></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

// Authorization Code + PKCE entrypoint. Validates client/redirect/PKCE, ensures the user
// is signed in (chains through NextAuth Google sign-in if not), then mints a short-lived
// auth code and redirects back to Claude's callback with the code + iss params.
//
// Resource Indicators (RFC 8707): we require the `resource` param and validate it matches
// our canonical MCP URI. Tokens minted from this code will be audience-bound to that resource.
export async function GET(request: Request) {
  const cfg = getOAuthConfig();
  const url = new URL(request.url);
  const params = url.searchParams;

  const responseType = params.get('response_type');
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const state = params.get('state');
  const codeChallenge = params.get('code_challenge');
  const codeChallengeMethod = params.get('code_challenge_method');
  const resource = params.get('resource');
  const scope = params.get('scope') ?? cfg.scope;

  // Pre-validate redirect_uri + client_id before we ever redirect anywhere.
  if (!redirectUri) return htmlError(400, 'Missing redirect_uri');
  if (!clientId || clientId !== cfg.clientId) {
    return htmlError(400, 'Unknown client_id');
  }
  if (!isRedirectUriAllowed(redirectUri, cfg)) {
    return htmlError(400, 'redirect_uri is not allowlisted for this client');
  }

  // From here on, errors can safely redirect to the (now-trusted) redirect_uri.
  if (responseType !== 'code') {
    return redirectWithError(redirectUri, state, 'unsupported_response_type', 'Only response_type=code is supported');
  }
  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    return redirectWithError(redirectUri, state, 'invalid_request', 'PKCE S256 is required');
  }
  if (!resource || resource !== cfg.resource) {
    return redirectWithError(
      redirectUri,
      state,
      'invalid_target',
      `resource parameter must equal ${cfg.resource}`,
    );
  }

  // Require a signed-in grimoire session — bounce to NextAuth signin if not, with callbackUrl
  // pointing back here so we re-enter with the same params after the user authenticates.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const callbackUrl = `/api/mcp/oauth/authorize?${params.toString()}`;
    const signinUrl = new URL('/api/auth/signin', cfg.issuer);
    signinUrl.searchParams.set('callbackUrl', callbackUrl);
    return NextResponse.redirect(signinUrl, 302);
  }

  // V1: auto-approve. Single-user grimoire — if you're signed in, you're authorizing yourself.
  // Future: insert a consent screen here.
  const code = await createAuthCode({
    userId: session.user.id,
    clientId: cfg.clientId,
    scope,
    resource,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    ttlSeconds: cfg.authCodeTtlSeconds,
  });

  // RFC 9207: include iss in the callback so the client can mix-up-check.
  const callback = new URL(redirectUri);
  callback.searchParams.set('code', code);
  if (state) callback.searchParams.set('state', state);
  callback.searchParams.set('iss', cfg.issuer);
  return NextResponse.redirect(callback, 302);
}
