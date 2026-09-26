import { z } from "zod";
import { prisma } from "@/server/db";
import { ApiError, clientIp, E, ok, parseBody, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { adapterForEnum } from "@/server/providers/registry";
import { serializeConnection } from "@/server/providers/serialize";
import { sealSecret } from "@/server/secrets";
import { audit } from "@/server/audit";
import { enqueueSync } from "@/server/sync/engine";

type P = { params: { id: string } };

async function load(workspaceId: string, id: string) {
  const c = await prisma.providerConnection.findFirst({ where: { id, workspaceId } });
  if (!c) throw E.notFound("Connection");
  return c;
}

const schema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  apiKey: z.string().trim().min(8, "Paste the full API key.").max(10_000).optional(),
  enabled: z.boolean().optional(),
});

/** Rename, rotate the key (re-validated), or pause/resume syncing. */
export const PATCH = route(async (req, { params }: P) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const c = await load(ctx.workspace.id, params.id);
  const body = await parseBody(req, schema);
  const data: Record<string, unknown> = {};
  if (body.name) data.name = body.name;
  if (body.enabled !== undefined) data.status = body.enabled ? "ACTIVE" : "DISABLED";
  if (body.apiKey) {
    const adapter = adapterForEnum(c.provider);
    if (!adapter) throw E.invalid("Unsupported provider.");
    const result = await adapter.validateCredentials(body.apiKey);
    if (!result.ok) throw new ApiError(result.code === "invalid_credentials" ? "provider_auth_failed" : "provider_permission", result.message);
    const sealed = sealSecret(body.apiKey, ctx.workspace.id);
    Object.assign(data, { apiKeyCiphertext: sealed.ciphertext, keyLast4: sealed.last4, status: "ACTIVE", lastSyncError: null, lastTestedAt: new Date() });
  }
  const updated = await prisma.providerConnection.update({ where: { id: c.id }, data });
  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: "provider.updated",
    targetType: "provider_connection",
    targetId: c.id,
    metadata: { keyRotated: !!body.apiKey, enabled: body.enabled ?? null, name: body.name ?? null },
    ip: clientIp(req),
  });
  if (body.apiKey) await enqueueSync(updated, "manual");
  return ok({ connection: serializeConnection(updated) });
});

/** Disconnect: deletes the stored credential. Synced history is kept. */
export const DELETE = route(async (req, { params }: P) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const c = await load(ctx.workspace.id, params.id);
  await prisma.providerConnection.delete({ where: { id: c.id } });
  await prisma.alert.updateMany({ where: { workspaceId: ctx.workspace.id, connectionId: c.id, resolvedAt: null }, data: { resolvedAt: new Date() } });
  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: "provider.disconnected",
    targetType: "provider_connection",
    targetId: c.id,
    metadata: { provider: c.provider.toLowerCase(), name: c.name },
    ip: clientIp(req),
  });
  return ok({ deleted: true });
});

export const dynamic = "force-dynamic";
