import { prisma } from "@/server/db";
import { clientIp, E, ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { enforceRateLimit } from "@/server/rate-limit";
import { serializeConnection } from "@/server/providers/serialize";
import { enqueueSync, runJobNow } from "@/server/sync/engine";
import { audit } from "@/server/audit";

/**
 * "Sync now": enqueue a job and run it immediately in this request. If a
 * worker already claimed it, the job keeps running there and the client
 * polls GET /providers/:id/jobs.
 */
export const POST = route(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  await enforceRateLimit(`sync-now:${params.id}`, 6, 600, "This connection was synced recently. Please wait a few minutes.");
  const c = await prisma.providerConnection.findFirst({ where: { id: params.id, workspaceId: ctx.workspace.id } });
  if (!c) throw E.notFound("Connection");
  if (c.status === "DISABLED") throw E.invalid("Syncing is paused for this connection. Resume it first.");
  const job = await enqueueSync(c, "manual");
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "provider.sync_requested", targetType: "provider_connection", targetId: c.id, ip: clientIp(req) });
  const outcome = await runJobNow(job.id);
  const fresh = await prisma.providerConnection.findUnique({ where: { id: c.id } });
  return ok({ jobId: job.id, outcome, connection: fresh ? serializeConnection(fresh) : null });
});

export const dynamic = "force-dynamic";
