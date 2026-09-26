import { z } from "zod";
import { prisma } from "@/server/db";
import { clientIp, E, ok, parseBody, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { audit } from "@/server/audit";

export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req);
  const ws = ctx.workspace.id;
  const [events, first, last, bySource] = await Promise.all([
    prisma.usageEvent.count({ where: { workspaceId: ws } }),
    prisma.usageEvent.findFirst({ where: { workspaceId: ws }, orderBy: { timestamp: "asc" }, select: { timestamp: true } }),
    prisma.usageEvent.findFirst({ where: { workspaceId: ws }, orderBy: { timestamp: "desc" }, select: { timestamp: true } }),
    prisma.usageEvent.groupBy({ by: ["source"], where: { workspaceId: ws }, _count: true }),
  ]);
  return ok({
    events,
    firstEventAt: first?.timestamp ?? null,
    lastEventAt: last?.timestamp ?? null,
    bySource: Object.fromEntries(bySource.map((s) => [s.source, s._count])),
  });
});

const schema = z.object({ confirm: z.literal("DELETE") });

/** Admin: delete all usage data (events, aggregates, insights, alerts). Settings are kept. */
export const DELETE = route(async (req) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const parsed = await parseBody(req, schema).catch(() => {
    throw E.invalid('Type "DELETE" to confirm.', { confirm: 'Type "DELETE" to confirm.' });
  });
  void parsed;
  const ws = ctx.workspace.id;
  const [events] = await prisma.$transaction([
    prisma.usageEvent.deleteMany({ where: { workspaceId: ws } }),
    prisma.dailyUsage.deleteMany({ where: { workspaceId: ws } }),
    prisma.alert.deleteMany({ where: { workspaceId: ws } }),
    prisma.insight.deleteMany({ where: { workspaceId: ws } }),
  ]);
  await audit({ workspaceId: ws, actorId: ctx.user.id, action: "data.deleted", metadata: { events: events.count }, ip: clientIp(req) });
  return ok({ deleted: events.count });
});

export const dynamic = "force-dynamic";
