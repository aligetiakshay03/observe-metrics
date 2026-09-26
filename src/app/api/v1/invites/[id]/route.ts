import { prisma } from "@/server/db";
import { clientIp, E, ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { audit } from "@/server/audit";

export const DELETE = route(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const invite = await prisma.invite.findFirst({ where: { id: params.id, workspaceId: ctx.workspace.id } });
  if (!invite) throw E.notFound("Invite");
  await prisma.invite.update({ where: { id: invite.id }, data: { status: "REVOKED" } });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "invite.revoked", targetType: "invite", targetId: invite.id, metadata: { email: invite.email }, ip: clientIp(req) });
  return ok({ revoked: true });
});

export const dynamic = "force-dynamic";
