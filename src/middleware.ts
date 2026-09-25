import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Lightweight edge guard: dashboard pages require a session cookie.
 * Full JWT verification happens in the API layer and server components.
 */
export function middleware(req: NextRequest) {
  const hasSession = Boolean(req.cookies.get("om_session")?.value);
  if (!hasSession) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
