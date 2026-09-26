import { prisma } from "@/server/db";
import { clientIp, E, ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { enforceRateLimit } from "@/server/rate-limit";
import { adapterForEnum } from "@/server/providers/registry";
import { serializeConnection } from "@/server/providers/serialize";
import { openSecret } from "@/server/secrets";
import { audit } from "@/server/audit";

/** Re-test a stored credential server-side. The secret never leaves the server. */
export const POST = route(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  await enforceRateLimit(`provider-retest:${ctx.user.id}`, 30, 600);
  const c = await prisma.providerConnection.findFirst({ where: { id: params.id, workspaceId: ctx.workspace.id } });
  if (!c) throw E.notFound("Connection");
  const adapter = adapterForEnum(c.provider);
  if (!adapter) throw E.invalid("Unsupported provider.");
  let result;
  try {
    result = await adapter.validateCredentials(openSecret(c.apiKeyCiphertext, c.workspaceId));
  } catch {
    result = { ok: false, code: "invalid_credentials" as const, message: "The stored key couldn't be decrypted. Update the key to reconnect." };
  }
  const updated = await prisma.providerConnection.update({
    where: { id: c.id },
    data: {
      lastTestedAt: new Date(),
      ...(result.ok ? (c.status === "ERROR" ? { status: "ACTIVE" as const } : {}) : result.code === "invalid_credentials" || result.code === "insufficient_permissions" ? { status: "ERROR" as const, lastSyncError: result.message } : {}),
    },
  });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "provider.tested", targetType: "provider_connection", targetId: c.id, metadata: { ok: result.ok }, ip: clientIp(req) });
  return ok({ result, connection: serializeConnection(updated) });
});

export const dynamic = "force-dynamic";
