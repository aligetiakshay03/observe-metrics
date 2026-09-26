import { z } from "zod";
import { prisma } from "@/server/db";
import { clientIp, E, ok, parseBody, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { audit } from "@/server/audit";

type P = { params: { id: string } };

const schema = z.object({
  role: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]).optional(),
  teamId: z.string().max(64).nullable().optional(),
});

async function ownerCount(workspaceId: string) {
  return prisma.workspaceMember.count({ where: { workspaceId, role: "OWNER" } });
}

/**
 * Role changes: admins may manage members/viewers; only owners can grant or
 * revoke admin/owner. The last owner can't be demoted.
 */
export const PATCH = route(async (req, { params }: P) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const target = await prisma.workspaceMember.findFirst({ where: { id: params.id, workspaceId: ctx.workspace.id } });
  if (!target) throw E.notFound("Member");
  const body = await parseBody(req, schema);
  const data: { role?: typeof target.role; teamId?: string | null } = {};

  if (body.role && body.role !== target.role) {
    const privileged = (r: string) => r === "OWNER" || r === "ADMIN";
    if ((privileged(body.role) || privileged(target.role)) && ctx.role !== "OWNER") throw E.forbidden("Only owners can change admin or owner roles.");
    if (target.role === "OWNER" && body.role !== "OWNER" && (await ownerCount(ctx.workspace.id)) <= 1) {
      throw E.invalid("A workspace needs at least one owner. Promote someone else first.");
    }
    data.role = body.role;
  }
  if (body.teamId !== undefined) {
    if (body.teamId && !(await prisma.team.findFirst({ where: { id: body.teamId, workspaceId: ctx.workspace.id } }))) throw E.invalid("Team not found.");
    data.teamId = body.teamId;
  }
  await prisma.workspaceMember.update({ where: { id: target.id }, data });
  if (data.role) {
    await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "member.role_changed", targetType: "member", targetId: target.id, metadata: { from: target.role, to: data.role }, ip: clientIp(req) });
  }
  return ok({ updated: true });
});

export const DELETE = route(async (req, { params }: P) => {
  const ctx = await requireWorkspace(req);
  const target = await prisma.workspaceMember.findFirst({ where: { id: params.id, workspaceId: ctx.workspace.id }, include: { user: { select: { email: true } } } });
  if (!target) throw E.notFound("Member");
  const self = target.userId === ctx.user.id;
  // Anyone can leave; removing others needs admin (and owner to remove admins/owners).
  if (!self) {
    if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") throw E.forbidden();
    if ((target.role === "OWNER" || target.role === "ADMIN") && ctx.role !== "OWNER") throw E.forbidden("Only owners can remove admins or owners.");
  }
  if (target.role === "OWNER" && (await ownerCount(ctx.workspace.id)) <= 1) throw E.invalid("The last owner can't leave. Transfer ownership or delete the workspace.");
  await prisma.workspaceMember.delete({ where: { id: target.id } });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "member.removed", targetType: "member", targetId: target.id, metadata: { email: target.user.email, self }, ip: clientIp(req) });
  return ok({ removed: true });
});

export const dynamic = "force-dynamic";
