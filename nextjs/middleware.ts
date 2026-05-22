import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/") || /^\/modules\/[^/]+\/api\//.test(pathname);
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // Bypass the signin/authentication redirect
    if (isApiPath(pathname) && req.headers.get("x-api-key")) {
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

        // Bypass authorization redirect
        if (isApiPath(pathname) && req.headers.get("x-api-key")) {
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
    // Protect all routes except API auth, static assets, and public files
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.ico$).*)",
  ],
};
