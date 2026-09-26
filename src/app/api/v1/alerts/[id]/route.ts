import { z } from "zod";
import { prisma } from "@/server/db";
import { E, ok, parseBody, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";

const schema = z.object({ read: z.boolean().optional(), resolved: z.boolean().optional() });

export const PATCH = route(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireWorkspace(req, "MEMBER");
  const body = await parseBody(req, schema);
  const data: { readAt?: Date | null; resolvedAt?: Date | null } = {};
  if (body.read !== undefined) data.readAt = body.read ? new Date() : null;
  if (body.resolved !== undefined) {
    data.resolvedAt = body.resolved ? new Date() : null;
    if (body.resolved) data.readAt = new Date();
  }
  const res = await prisma.alert.updateMany({ where: { id: params.id, workspaceId: ctx.workspace.id }, data });
  if (!res.count) throw E.notFound("Alert");
  return ok({ updated: true });
});

export const dynamic = "force-dynamic";
