import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// True for any request that carries an API key (X-API-Key or Authorization: Bearer grm_...).
// Used to bypass the NextAuth session redirect path so the route handler can validate the key.
function hasApiKey(req: { headers: Headers }) {
  if (req.headers.get("x-api-key")) return true;
  const authz = req.headers.get("authorization");
  return !!authz && authz.toLowerCase().startsWith("bearer ");
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // API-key requests skip session redirects entirely — the route handler validates the key.
    if (hasApiKey(req)) {
      return NextResponse.next();
    }

    const authenticated = !!token;
    const authorized = !!token?.id;

    // Redirect authorized users away from auth pages to home
    if (authenticated && authorized &&
      (pathname === "/auth/signin" || pathname === "/auth/unauthorized")) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    // Redirect authenticated but unauthorized users to unauthorized page
    if (authenticated && !authorized && pathname !== "/auth/unauthorized") {
      return NextResponse.redirect(new URL("/auth/unauthorized", req.url));
    }

    // Allow unauthorized users to view unauthorized page
    if (authenticated && !authorized && pathname === "/auth/unauthorized") {
      return NextResponse.next();
    }
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;

        // API-key auth: let the request through and have the route handler validate the
        // key against the DB. Middleware runs at the edge and can't hit the connection pool.
        if (hasApiKey(req)) {
          return true;
        }

        const authenticated = !!token;
        const authorized = !!token?.id;

        // Allow signin page for all requests (middleware handles redirect)
        if (pathname === "/auth/signin") {
          return true;
        }

        // Allow unauthorized page only for authenticated users
        if (pathname === "/auth/unauthorized") {
          return authenticated;
        }

        // All other routes require authenticated + authorized
        return authenticated && authorized;
      },
    },
  }
);

export const config = {
  matcher: [
    // Protect all routes except NextAuth's own endpoints, the MCP endpoint (which does
    // its own bearer-token auth and must return JSON 401 instead of redirecting to signin),
    // the email unsubscribe page + endpoint (authorized by the HMAC token in the link, and
    // useless if it redirected a signed-out recipient to a Google login), static assets, and
    // public files. API-key requests on other routes are handled in-callback above.
    "/((?!api/auth|api/mcp|api/email/unsubscribe|unsubscribe|\\.well-known|_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.ico$).*)",
  ],
};
