import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "om_session";
const PROTECTED = ["/dashboard", "/onboarding"];
// Bearer-authenticated endpoints: no ambient cookies, so no CSRF exposure.
const CSRF_EXEMPT = ["/api/v1/events", "/api/v1/cron/"];

/**
 * Edge guard:
 *  1. App pages require a session cookie (full validation happens server-side).
 *  2. State-changing API requests must be same-origin (CSRF defence in depth on
 *     top of SameSite=Lax cookies).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    const method = req.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && !CSRF_EXEMPT.some((p) => pathname.startsWith(p))) {
      const origin = req.headers.get("origin");
      const site = req.headers.get("sec-fetch-site");
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      const sameOrigin = origin ? safeHost(origin) === host : site === "same-origin" || site === "none";
      if (!sameOrigin) {
        return NextResponse.json({ ok: false, error: { code: "forbidden", message: "Cross-site request blocked." } }, { status: 403 });
      }
    }
    return NextResponse.next();
  }

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/")) && !req.cookies.get(SESSION_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

function safeHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/onboarding", "/dashboard", "/api/:path*"],
};
