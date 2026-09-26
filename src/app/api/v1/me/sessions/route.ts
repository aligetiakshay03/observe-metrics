import { prisma } from "@/server/db";
import { clientIp, ok, route } from "@/server/http";
import { requireUser } from "@/server/auth/context";
import { revokeAllSessions } from "@/server/auth/session";
import { audit } from "@/server/audit";

export const GET = route(async (req) => {
  const auth = await requireUser(req);
  const sessions = await prisma.session.findMany({
    where: { userId: auth.user.id, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, userAgent: true, ip: true, createdAt: true, lastSeenAt: true, remember: true },
  });
  return ok({ sessions: sessions.map((s) => ({ ...s, current: s.id === auth.session.id })) });
});

/** Sign out every other session. */
export const DELETE = route(async (req) => {
  const auth = await requireUser(req);
  await revokeAllSessions(auth.user.id, auth.session.id);
  const ms = await prisma.workspaceMember.findMany({ where: { userId: auth.user.id }, select: { workspaceId: true } });
  for (const m of ms) await audit({ workspaceId: m.workspaceId, actorId: auth.user.id, action: "security.sessions_revoked", ip: clientIp(req) });
  return ok({ revoked: true });
});

export const dynamic = "force-dynamic";
