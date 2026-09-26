import { prisma } from "@/server/db";
import { clientIp, E, ok, parseBody, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { slugify } from "@/server/ingest/dimensions";
import { audit } from "@/server/audit";
import { appSchema, assertTeam } from "@/server/schemas";

export const POST = route(async (req) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const body = await parseBody(req, appSchema);
  await assertTeam(ctx.workspace.id, body.teamId);
  const slug = slugify(body.name);
  if (await prisma.application.findUnique({ where: { workspaceId_slug: { workspaceId: ctx.workspace.id, slug } } })) {
    throw E.conflict("An application with this name already exists.", { name: "An application with this name already exists." });
  }
  const app = await prisma.application.create({
    data: { workspaceId: ctx.workspace.id, name: body.name, slug, description: body.description ?? null, teamId: body.teamId ?? null },
  });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "application.created", targetType: "application", targetId: app.id, metadata: { name: body.name }, ip: clientIp(req) });
  return ok({ id: app.id, slug }, { status: 201 });
});

export const dynamic = "force-dynamic";
