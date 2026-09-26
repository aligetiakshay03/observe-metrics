import { prisma } from "@/server/db";
import { ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";

export const POST = route(async (req) => {
  const ctx = await requireWorkspace(req, "MEMBER");
  const res = await prisma.alert.updateMany({ where: { workspaceId: ctx.workspace.id, readAt: null }, data: { readAt: new Date() } });
  return ok({ updated: res.count });
});

export const dynamic = "force-dynamic";
