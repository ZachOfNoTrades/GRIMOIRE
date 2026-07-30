import { NextResponse } from 'next/server';
import { getOAuthConfig } from '@/lib/mcp/oauth/config';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

// RFC 8414 Authorization Server Metadata. Public, unauthenticated. Cached.
// `authorization_response_iss_parameter_supported: true` lets RFC 9207-aware
// clients (Claude.ai, MCP Inspector) validate the issuer on the callback.
export function GET() {
  const cfg = getOAuthConfig();
  return NextResponse.json(
    {
      issuer: cfg.issuer,
      authorization_endpoint: `${cfg.issuer}/api/mcp/oauth/authorize`,
      token_endpoint: `${cfg.issuer}/api/mcp/oauth/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      scopes_supported: [cfg.scope],
      authorization_response_iss_parameter_supported: true,
      service_documentation: `${cfg.issuer}/account/api-keys`,
    },
    {
      headers: {
        'cache-control': 'public, max-age=3600',
        'access-control-allow-origin': '*',
      },
    },
  );
}

export function OPTIONS() {
  return new Response(null, {
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': '*',
    },
  });
}
