import { prisma } from "@/server/db";
import { ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";

const PAGE = 50;

export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const cursor = new URL(req.url).searchParams.get("cursor");
  const rows = await prisma.auditLog.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { actor: { select: { name: true, email: true, isGuest: true } } },
  });
  const page = rows.slice(0, PAGE);
  return ok({
    entries: page.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      metadata: r.metadata,
      ip: r.ip,
      createdAt: r.createdAt,
      actor: r.actor ? (r.actor.isGuest ? "Guest" : r.actor.name ?? r.actor.email) : "System",
    })),
    nextCursor: rows.length > PAGE ? page[page.length - 1]!.id : null,
  });
});

export const dynamic = "force-dynamic";
