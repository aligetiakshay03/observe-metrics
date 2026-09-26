import { z } from "zod";
import { prisma } from "@/server/db";
import { clientIp, ok, parseBody, route } from "@/server/http";
import { assertNotDemo, assertNotGuest, requireWorkspace } from "@/server/auth/context";
import { enforceRateLimit } from "@/server/rate-limit";
import { generateIngestionKey } from "@/server/ingest/events";
import { audit } from "@/server/audit";

export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const keys = await prisma.ingestionKey.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true },
  });
  return ok({ keys });
});

const schema = z.object({ name: z.string().trim().min(1, "Name the key (e.g. production).").max(60) });

/** Creates a key. The raw value is returned exactly once and never stored. */
export const POST = route(async (req) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  assertNotGuest(ctx, "create ingestion keys");
  assertNotDemo(ctx, "create ingestion keys");
  await enforceRateLimit(`ingest-key:${ctx.user.id}`, 20, 3600);
  const { name } = await parseBody(req, schema);
  const { raw, hash, prefix } = generateIngestionKey();
  const key = await prisma.ingestionKey.create({ data: { workspaceId: ctx.workspace.id, name, keyHash: hash, prefix, createdById: ctx.user.id } });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "ingestion_key.created", targetType: "ingestion_key", targetId: key.id, metadata: { name, prefix }, ip: clientIp(req) });
  return ok({ id: key.id, name, prefix, key: raw }, { status: 201, headers: { "Cache-Control": "no-store" } });
});

export const dynamic = "force-dynamic";
