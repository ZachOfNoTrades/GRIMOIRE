import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveApiKeyFromToken } from "@/lib/apiKeys";
import { resolveAccessToken } from "@/lib/mcp/oauth/store";
import { getMainConnection } from "@/lib/db";

// Same shape as Session["user"] (see types/next-auth.d.ts) but with id narrowed to non-null,
// since every authorized caller has a resolved user id. Returned by getAuthorizedUser.
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  globalAdmin: boolean;
  generationLimit: number;
}

// Narrow a NextAuth Session (the shape returned by the API-key resolver in @/lib/apiKeys)
// down to AuthUser so the unified getAuthorizedUser path always returns the same type.
function sessionToAuthUser(session: Session): AuthUser {
  return {
    id: session.user.id!,
    email: session.user.email,
    name: session.user.name,
    globalAdmin: session.user.globalAdmin,
    generationLimit: session.user.generationLimit,
  };
}

// Which client channel a write arrived on. Recorded alongside the row it created or
// modified so the UI can attribute it ("Created … via MCP"). Kept here next to
// getAuthorizedUser because the two read the same headers to decide.
export type RequestChannel = 'web' | 'api' | 'mcp';

// Classifies an incoming API-route request as 'web' or 'api'. Mirrors getAuthorizedUser's
// dispatch: a request carrying an X-API-Key or Authorization header authenticated as a
// programmatic caller, anything else fell through to the browser's NextAuth cookie.
//
// 'mcp' is never returned here — MCP tool handlers call the lib functions directly (see
// lib/mcp/tools/*), never through these routes, so they pass 'mcp' themselves. A request
// whose Bearer token is an `mcp_at_` MCP OAuth token only ever reaches /api/mcp.
export function getRequestChannel(request: Request): RequestChannel {
  if (request.headers.get('x-api-key')) return 'api';
  if (request.headers.get('authorization')) return 'api';
  return 'web';
}

// Verifies the current session exists and the user is authorized.
// Returns the session or null if unauthorized. Use this for routes that must be
// browser-only (e.g. API key management itself).
export async function getAuthorizedSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return null;
  }
  return session;
}

// Unified authorization helper. Accepts a NextAuth session, an X-API-Key header,
// OR an `Authorization: Bearer grm_...` header (used by MCP clients) and returns a
// session-shaped { user } object so callers can swap getAuthorizedSession() for
// getAuthorizedUser(request) with no field-access changes. Returns null when no
// auth method validates.
export async function getAuthorizedUser(
  request: Request
): Promise<{ user: AuthUser } | null> {
  const apiKeyHeader = request.headers.get("x-api-key");
  if (apiKeyHeader) {
    const session = await resolveApiKeyFromToken(apiKeyHeader);
    if (!session) return null;
    return { user: sessionToAuthUser(session) };
  }

  const authzHeader = request.headers.get("authorization");
  const bearerToken =
    authzHeader && authzHeader.toLowerCase().startsWith("bearer ")
      ? authzHeader.slice(7).trim()
      : null;
  if (bearerToken) {
    // MCP OAuth access tokens are prefixed `mcp_at_`; long-lived API keys are `grm_`.
    if (bearerToken.startsWith('mcp_at_')) {
      const oauthUser = await resolveOAuthBearer(bearerToken);
      if (!oauthUser) return null;
      return { user: oauthUser };
    }
    const session = await resolveApiKeyFromToken(bearerToken);
    if (!session) return null;
    return { user: sessionToAuthUser(session) };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      globalAdmin: session.user.globalAdmin,
      generationLimit: session.user.generationLimit,
    },
  };
}

// Resolves an MCP OAuth access token → AuthUser. The token row already encodes the
// audience (resource) it was minted for; callers can re-check that against their own
// canonical URL if needed (the MCP route does). We only look up the user row here.
export async function resolveOAuthBearer(token: string): Promise<AuthUser | null> {
  const row = await resolveAccessToken(token);
  if (!row) return null;
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input('id', row.user_id)
    .query<{
      id: string;
      email: string;
      name: string;
      global_admin: boolean;
      generation_limit: number;
    }>(
      `SELECT id, email, name, global_admin, generation_limit
       FROM dbo.users WHERE id = @id AND enabled = 1`,
    );
  const u = result.recordset[0];
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    globalAdmin: !!u.global_admin,
    generationLimit: u.generation_limit ?? 1,
  };
}

// Checks if the current session user has admin privileges.
// Returns true if user is a global admin, false otherwise.
export async function isAdmin(): Promise<boolean> {
  const session = await getAuthorizedSession();
  if (!session) {
    return false;
  }
  return session.user.globalAdmin;
}
