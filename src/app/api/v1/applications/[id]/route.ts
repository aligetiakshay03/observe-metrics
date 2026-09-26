import { prisma } from "@/server/db";
import { clientIp, E, ok, parseBody, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { audit } from "@/server/audit";
import { appSchema, assertTeam } from "@/server/schemas";

type P = { params: { id: string } };

export const PATCH = route(async (req, { params }: P) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const body = await parseBody(req, appSchema);
  await assertTeam(ctx.workspace.id, body.teamId);
  const res = await prisma.application.updateMany({
    where: { id: params.id, workspaceId: ctx.workspace.id },
    data: { name: body.name, description: body.description ?? null, teamId: body.teamId ?? null },
  });
  if (!res.count) throw E.notFound("Application");
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "application.updated", targetType: "application", targetId: params.id, metadata: { name: body.name }, ip: clientIp(req) });
  return ok({ updated: true });
});

export const DELETE = route(async (req, { params }: P) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const app = await prisma.application.findFirst({ where: { id: params.id, workspaceId: ctx.workspace.id } });
  if (!app) throw E.notFound("Application");
  await prisma.application.delete({ where: { id: app.id } });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "application.deleted", targetType: "application", targetId: app.id, metadata: { name: app.name }, ip: clientIp(req) });
  return ok({ deleted: true });
});

export const dynamic = "force-dynamic";
