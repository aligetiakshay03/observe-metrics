import { z } from "zod";
import { prisma } from "@/server/db";
import { ok, parseBody, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";

const schema = z.object({ ids: z.array(z.string().max(64)).max(100).optional(), read: z.boolean().default(true) });

export const POST = route(async (req) => {
  const ctx = await requireWorkspace(req);
  const body = await parseBody(req, schema);
  const res = await prisma.notification.updateMany({
    where: { workspaceId: ctx.workspace.id, userId: ctx.user.id, ...(body.ids ? { id: { in: body.ids } } : {}) },
    data: { readAt: body.read ? new Date() : null },
  });
  return ok({ updated: res.count });
});

export const dynamic = "force-dynamic";
