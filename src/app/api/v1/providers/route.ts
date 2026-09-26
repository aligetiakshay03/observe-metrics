import { z } from "zod";
import { prisma } from "@/server/db";
import { ApiError, clientIp, E, ok, parseBody, route } from "@/server/http";
import { assertNotDemo, assertNotGuest, requireWorkspace } from "@/server/auth/context";
import { enforceRateLimit } from "@/server/rate-limit";
import { getAdapter, PROVIDER_IDS, providerCatalog } from "@/server/providers/registry";
import { PROVIDER_ENUM, type ProviderId } from "@/server/providers/types";
import { serializeConnection } from "@/server/providers/serialize";
import { sealSecret } from "@/server/secrets";
import { audit } from "@/server/audit";
import { enqueueSync } from "@/server/sync/engine";

export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req);
  const connections = await prisma.providerConnection.findMany({
    where: { workspaceId: ctx.workspace.id, provider: { not: "DEMO" } },
    orderBy: { createdAt: "asc" },
  });
  return ok({
    catalog: providerCatalog(),
    connections: connections.map(serializeConnection),
    canManage: ctx.role === "OWNER" || ctx.role === "ADMIN",
    isDemo: ctx.workspace.isDemo,
  });
});

const schema = z.object({
  provider: z.enum(PROVIDER_IDS as [ProviderId, ...ProviderId[]]),
  name: z.string().trim().max(60).optional(),
  apiKey: z.string().trim().min(8, "Paste the full API key.").max(10_000),
});

/** Validate the credential with the provider, then store it sealed. */
export const POST = route(async (req) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  assertNotGuest(ctx, "connect a provider");
  assertNotDemo(ctx, "connect a provider");
  await enforceRateLimit(`provider-connect:${ctx.user.id}`, 20, 3600);
  const body = await parseBody(req, schema);
  const name = body.name || "Primary";

  const existing = await prisma.providerConnection.findUnique({
    where: { workspaceId_provider_name: { workspaceId: ctx.workspace.id, provider: PROVIDER_ENUM[body.provider], name } },
  });
  if (existing) throw E.conflict(`A ${getAdapter(body.provider).label} connection named "${name}" already exists. Update its key instead.`);

  const adapter = getAdapter(body.provider);
  const result = await adapter.validateCredentials(body.apiKey);
  if (!result.ok) {
    await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "provider.tested", metadata: { provider: body.provider, ok: false, code: result.code ?? null }, ip: clientIp(req) });
    throw new ApiError(result.code === "invalid_credentials" ? "provider_auth_failed" : result.code === "insufficient_permissions" ? "provider_permission" : result.code === "rate_limited" ? "provider_rate_limited" : "provider_unavailable", result.message);
  }

  const sealed = sealSecret(body.apiKey, ctx.workspace.id);
  const connection = await prisma.providerConnection.create({
    data: {
      workspaceId: ctx.workspace.id,
      provider: PROVIDER_ENUM[body.provider],
      name,
      apiKeyCiphertext: sealed.ciphertext,
      keyLast4: sealed.last4,
      lastTestedAt: new Date(),
    },
  });
  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: "provider.connected",
    targetType: "provider_connection",
    targetId: connection.id,
    metadata: { provider: body.provider, name, key: "…" + sealed.last4 },
    ip: clientIp(req),
  });
  const job = await enqueueSync(connection, "connect");
  return ok({ connection: serializeConnection(connection), message: result.message, jobId: job.id }, { status: 201 });
});

export const dynamic = "force-dynamic";
