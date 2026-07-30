// Single pre-registered "claude-web" OAuth client. The client_id + secret are loaded
// from env (.env.local in dev, Infisical later) and pasted into Claude.ai's
// custom-connector Advanced settings. Single confidential client — no DCR in v1.

const SCOPE = 'mcp';
const ACCESS_TOKEN_TTL_SECONDS = 3600;          // 1 hour
const REFRESH_TOKEN_TTL_SECONDS = 30 * 86400;   // 30 days
const AUTH_CODE_TTL_SECONDS = 600;              // 10 minutes

export interface OAuthConfig {
  issuer: string;            // https://grimoire-dev.zachsmith.app
  resource: string;          // https://grimoire-dev.zachsmith.app/api/mcp
  clientId: string;
  clientSecret: string;
  allowedRedirectUris: string[];
  scope: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  authCodeTtlSeconds: number;
}

let cached: OAuthConfig | null = null;

export function getOAuthConfig(): OAuthConfig {
  if (cached) return cached;

  const clientId = process.env.MCP_OAUTH_CLIENT_ID;
  const clientSecret = process.env.MCP_OAUTH_CLIENT_SECRET;
  const issuer = process.env.MCP_OAUTH_ISSUER;
  const resource = process.env.MCP_OAUTH_RESOURCE;

  if (!clientId || !clientSecret || !issuer || !resource) {
    throw new Error(
      'MCP OAuth config missing — need MCP_OAUTH_CLIENT_ID, MCP_OAUTH_CLIENT_SECRET, MCP_OAUTH_ISSUER, MCP_OAUTH_RESOURCE',
    );
  }

  cached = {
    issuer,
    resource,
    clientId,
    clientSecret,
    // Hosted Claude surfaces (web/desktop/mobile/Cowork) use this single callback.
    // Localhost variants are for Claude Code / MCP Inspector during local testing.
    allowedRedirectUris: [
      'https://claude.ai/api/mcp/auth_callback',
      'https://claude.com/api/mcp/auth_callback',
      'http://localhost/callback',
      'http://127.0.0.1/callback',
      'http://localhost:6274/oauth/callback', // MCP Inspector default
    ],
    scope: SCOPE,
    accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: REFRESH_TOKEN_TTL_SECONDS,
    authCodeTtlSeconds: AUTH_CODE_TTL_SECONDS,
  };
  return cached;
}

// Localhost callbacks ignore the port per MCP spec — desktop/CLI clients pick ephemeral ports.
export function isRedirectUriAllowed(redirectUri: string, config: OAuthConfig): boolean {
  if (config.allowedRedirectUris.includes(redirectUri)) return true;
  try {
    const url = new URL(redirectUri);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      // Spec: "with the port component ignored" — accept any port on loopback /callback.
      return url.pathname === '/callback' || url.pathname.startsWith('/oauth/callback');
    }
  } catch {
    return false;
  }
  return false;
}
