import { prisma } from "@/server/db";
import { clientIp, E, ok, parseBody, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { audit } from "@/server/audit";
import { teamSchema } from "@/server/schemas";

type P = { params: { id: string } };

export const PATCH = route(async (req, { params }: P) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const { name } = await parseBody(req, teamSchema);
  const res = await prisma.team.updateMany({ where: { id: params.id, workspaceId: ctx.workspace.id }, data: { name } });
  if (!res.count) throw E.notFound("Team");
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "team.updated", targetType: "team", targetId: params.id, metadata: { name }, ip: clientIp(req) });
  return ok({ updated: true });
});

/** Historical usage keeps its team id and shows as unattributed after deletion. */
export const DELETE = route(async (req, { params }: P) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const team = await prisma.team.findFirst({ where: { id: params.id, workspaceId: ctx.workspace.id } });
  if (!team) throw E.notFound("Team");
  await prisma.team.delete({ where: { id: team.id } });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "team.deleted", targetType: "team", targetId: team.id, metadata: { name: team.name }, ip: clientIp(req) });
  return ok({ deleted: true });
});

export const dynamic = "force-dynamic";
