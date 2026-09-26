import { prisma } from "@/server/db";
import { E, ok, route } from "@/server/http";
import { env } from "@/server/env";
import { safeEqual } from "@/server/secrets";
import { tick } from "@/server/sync/engine";
import { refreshAllActiveWorkspaces } from "@/server/insights/run";

/**
 * Scheduler entry point, called by the worker process (npm run worker) or a
 * platform cron (vercel.json). Requires `Authorization: Bearer $CRON_SECRET`;
 * in development without CRON_SECRET it only accepts loopback callers.
 */
async function handle(req: Request) {
  const secret = env.cronSecret;
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    if (!safeEqual(header, `Bearer ${secret}`)) throw E.unauthorized();
  } else {
    const host = new URL(req.url).hostname;
    if (env.isProd || !["localhost", "127.0.0.1", "::1"].includes(host)) throw E.unauthorized();
  }
  const sync = await tick(10);
  const refreshed = await refreshAllActiveWorkspaces();
  // Housekeeping: expired sessions/tokens and guest demo accounts older than 48h.
  const now = new Date();
  const [sessions, resets, states, guests] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: now } } }),
    (async () => {
      const old = await prisma.user.findMany({ where: { isGuest: true, createdAt: { lt: new Date(now.getTime() - 48 * 3600_000) } }, select: { id: true } });
      for (const u of old) {
        const ws = await prisma.workspaceMember.findMany({ where: { userId: u.id }, select: { workspaceId: true } });
        await prisma.workspace.deleteMany({ where: { id: { in: ws.map((w) => w.workspaceId) }, isDemo: true } });
        await prisma.user.delete({ where: { id: u.id } });
      }
      return { count: old.length };
    })(),
  ]);
  return ok({ sync, refreshedWorkspaces: refreshed, cleaned: { sessions: sessions.count, resetTokens: resets.count, oauthStates: states.count, guests: guests.count } });
}

export const POST = route(handle);
// Vercel Cron issues GET requests.
export const GET = route(handle);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
