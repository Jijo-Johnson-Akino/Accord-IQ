import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { safeNextPath } from "./lib/safe-path";

const PUBLIC_PAGES = new Set(["/", "/login", "/signup", "/forgot-password", "/reset-password"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PAGES.has(pathname)) return true;
  if (pathname.startsWith("/reset-password/")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname === "/api/health") return true;
  return false;
}

/**
 * Optimistic cookie check only. Pages and API handlers load the session and enforce policy.
 * A hidden UI or a forged cookie is not a security boundary.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request, { cookiePrefix: "accordiq" });

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (!isPublicPath(pathname) && !sessionCookie) {
    const login = new URL("/login", request.url);
    const next = safeNextPath(`${pathname}${request.nextUrl.search}`);
    if (next !== "/dashboard") login.searchParams.set("next", next);
    return NextResponse.redirect(login);
  }

  if (
    sessionCookie &&
    (pathname === "/login" ||
      pathname === "/signup" ||
      pathname === "/forgot-password" ||
      pathname === "/reset-password" ||
      pathname.startsWith("/reset-password/"))
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
