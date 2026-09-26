import { z } from "zod";
import { prisma } from "@/server/db";
import { clientIp, E, ok, parseBody, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { WORKSPACE_COOKIE } from "@/server/auth/session";
import { audit } from "@/server/audit";

export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req);
  const w = ctx.workspace;
  const [members, connections, apps, teams] = await Promise.all([
    prisma.workspaceMember.count({ where: { workspaceId: w.id } }),
    prisma.providerConnection.count({ where: { workspaceId: w.id } }),
    prisma.application.count({ where: { workspaceId: w.id } }),
    prisma.team.count({ where: { workspaceId: w.id } }),
  ]);
  return ok({
    workspace: { id: w.id, name: w.name, slug: w.slug, companyName: w.companyName, currency: w.currency, isDemo: w.isDemo, createdAt: w.createdAt },
    counts: { members, connections, apps, teams },
    role: ctx.role,
  });
});

const schema = z.object({
  name: z.string().trim().min(2, "Workspace name must be at least 2 characters.").max(60),
  companyName: z.string().trim().max(100).nullable().optional(),
});

export const PATCH = route(async (req) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const body = await parseBody(req, schema);
  await prisma.workspace.update({ where: { id: ctx.workspace.id }, data: { name: body.name, companyName: body.companyName ?? null } });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "workspace.updated", metadata: { name: body.name }, ip: clientIp(req) });
  return ok({ updated: true });
});

const del = z.object({ confirm: z.string() });

/** Owner-only: permanently delete the workspace and all of its data. */
export const DELETE = route(async (req) => {
  const ctx = await requireWorkspace(req, "OWNER");
  const { confirm } = await parseBody(req, del);
  if (confirm !== ctx.workspace.name) throw E.invalid("Type the workspace name exactly to confirm.", { confirm: "Doesn't match the workspace name." });
  await prisma.workspace.delete({ where: { id: ctx.workspace.id } });
  const res = ok({ deleted: true });
  // Drop only the workspace cookie; the session stays valid.
  res.cookies.set({ name: WORKSPACE_COOKIE, value: "", path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" });
  return res;
});

export const dynamic = "force-dynamic";
