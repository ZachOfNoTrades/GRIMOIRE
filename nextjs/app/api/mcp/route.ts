import { createMcpHandler } from 'mcp-handler';
import { getAuthorizedUser } from '@/lib/permissions';
import { registerGrimoireTools } from '@/lib/mcp/server';
import { getOAuthConfig } from '@/lib/mcp/oauth/config';
import { resolveAccessToken } from '@/lib/mcp/oauth/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stateless Streamable HTTP MCP endpoint.
//
// Auth precedence (in `getAuthorizedUser`):
//   1. X-API-Key: grm_...                       (legacy)
//   2. Authorization: Bearer mcp_at_...          (OAuth access token, claude.ai)
//   3. Authorization: Bearer grm_...             (long-lived API key, claude desktop)
//   4. NextAuth session cookie                   (browser)
//
// The 401 includes WWW-Authenticate with resource_metadata per MCP spec, so OAuth-aware
// clients can self-discover our authorization server.
function unauthorized() {
  const cfg = getOAuthConfig();
  const resourceMetadata = `${cfg.issuer}/.well-known/oauth-protected-resource`;
  return new Response(
    JSON.stringify({
      error: 'unauthorized',
      error_description:
        'Pass an MCP OAuth access token, a grimoire API key, or sign in via NextAuth. See resource metadata for OAuth flow.',
    }),
    {
      status: 401,
      headers: {
        'content-type': 'application/json',
        'www-authenticate': `Bearer realm="grimoire-mcp", resource_metadata="${resourceMetadata}", scope="${cfg.scope}"`,
      },
    },
  );
}

export async function POST(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return unauthorized();

  // Audience binding (RFC 8707): if the caller authenticated via an OAuth access token,
  // confirm the token was minted for *this* MCP server (resource claim) — not for some
  // other resource attached to a different audience.
  const authzHeader = request.headers.get('authorization');
  const bearer =
    authzHeader && authzHeader.toLowerCase().startsWith('bearer ')
      ? authzHeader.slice(7).trim()
      : null;
  if (bearer?.startsWith('mcp_at_')) {
    const cfg = getOAuthConfig();
    const row = await resolveAccessToken(bearer);
    if (!row || row.resource !== cfg.resource) return unauthorized();
  }

  const ctx = { user: session.user };
  const handler = createMcpHandler(
    (server) => registerGrimoireTools(server, ctx),
    {
      serverInfo: { name: 'grimoire', version: '1.0.0' },
    },
    {
      streamableHttpEndpoint: '/api/mcp',
      disableSse: true,
      maxDuration: 60,
      verboseLogs: false,
    },
  );
  return handler(request);
}
