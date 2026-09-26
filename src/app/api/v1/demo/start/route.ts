import { prisma } from "@/server/db";
import { clientIp, E, ok, route } from "@/server/http";
import { getAuth } from "@/server/auth/context";
import { createSession, setSessionCookie, setWorkspaceCookie } from "@/server/auth/session";
import { enforceRateLimit } from "@/server/rate-limit";
import { ensureDemoWorkspace } from "@/server/demo/seed";
import { env } from "@/server/env";
import { randomToken } from "@/server/secrets";

/**
 * Open the demo workspace. Signed-in users get (or refresh) their own demo
 * workspace. Anonymous visitors get a short-lived guest account so "View
 * demo" works without signing up; guests can't connect providers and are
 * deleted after 48 hours.
 */
export const POST = route(async (req) => {
  if (!env.demoEnabled) throw E.notFound("Demo");
  const ip = clientIp(req);
  const auth = await getAuth(req);
  if (auth) {
    await enforceRateLimit(`demo:user:${auth.user.id}`, 10, 3600);
    const ws = await ensureDemoWorkspace(auth.user.id);
    const res = ok({ workspaceId: ws.id, guest: auth.user.isGuest });
    setWorkspaceCookie(res, ws.id);
    return res;
  }
  await enforceRateLimit(`demo:guest:${ip}`, 5, 3600, "Too many demo sessions from this network. Please try again later.");
  const guest = await prisma.user.create({
    data: { email: `guest-${randomToken(9).toLowerCase()}@guest.observemetrics.invalid`, name: "Guest", isGuest: true },
  });
  const ws = await ensureDemoWorkspace(guest.id);
  const { token } = await createSession(guest.id, { remember: false, guest: true, userAgent: req.headers.get("user-agent"), ip });
  const res = ok({ workspaceId: ws.id, guest: true }, { status: 201 });
  setSessionCookie(res, token, false, true);
  setWorkspaceCookie(res, ws.id);
  return res;
});

export const dynamic = "force-dynamic";
