import { prisma } from "@/server/db";
import { clientIp, E, ok, parseBody, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { slugify } from "@/server/ingest/dimensions";
import { audit } from "@/server/audit";
import { teamSchema } from "@/server/schemas";

export const POST = route(async (req) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const { name } = await parseBody(req, teamSchema);
  const slug = slugify(name);
  if (await prisma.team.findUnique({ where: { workspaceId_slug: { workspaceId: ctx.workspace.id, slug } } })) {
    throw E.conflict("A team with this name already exists.", { name: "A team with this name already exists." });
  }
  const team = await prisma.team.create({ data: { workspaceId: ctx.workspace.id, name, slug } });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "team.created", targetType: "team", targetId: team.id, metadata: { name }, ip: clientIp(req) });
  return ok({ id: team.id, slug }, { status: 201 });
});

export const dynamic = "force-dynamic";
