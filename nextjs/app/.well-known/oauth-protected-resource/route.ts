import { NextResponse } from 'next/server';
import { getOAuthConfig } from '@/lib/mcp/oauth/config';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

// RFC 9728 Protected Resource Metadata. Public, unauthenticated. Cached.
export function GET() {
  const cfg = getOAuthConfig();
  return NextResponse.json(
    {
      resource: cfg.resource,
      authorization_servers: [cfg.issuer],
      bearer_methods_supported: ['header'],
      scopes_supported: [cfg.scope],
      resource_name: 'grimoire MCP',
      resource_documentation: `${cfg.issuer}/account/api-keys`,
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
