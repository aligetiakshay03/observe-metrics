import { ok, route } from "@/server/http";
import { clearSessionCookies, readCookie, revokeSessionToken, SESSION_COOKIE } from "@/server/auth/session";

export const POST = route(async (req) => {
  await revokeSessionToken(readCookie(req, SESSION_COOKIE));
  const res = ok({ signedOut: true });
  clearSessionCookies(res);
  return res;
});

export const dynamic = "force-dynamic";
