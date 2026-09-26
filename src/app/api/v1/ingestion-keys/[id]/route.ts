import { prisma } from "@/server/db";
import { clientIp, E, ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { audit } from "@/server/audit";

export const DELETE = route(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const key = await prisma.ingestionKey.findFirst({ where: { id: params.id, workspaceId: ctx.workspace.id } });
  if (!key) throw E.notFound("Key");
  if (!key.revokedAt) await prisma.ingestionKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "ingestion_key.revoked", targetType: "ingestion_key", targetId: key.id, metadata: { name: key.name, prefix: key.prefix }, ip: clientIp(req) });
  return ok({ revoked: true });
});

export const dynamic = "force-dynamic";
