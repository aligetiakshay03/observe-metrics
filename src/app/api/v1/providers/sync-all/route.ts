import { prisma } from "@/server/db";
import { clientIp, ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { enforceRateLimit } from "@/server/rate-limit";
import { enqueueSync, runJobNow } from "@/server/sync/engine";
import { audit } from "@/server/audit";

/** Sync every active connection in the workspace. */
export const POST = route(async (req) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  await enforceRateLimit(`sync-all:${ctx.workspace.id}`, 4, 600, "Workspace was synced recently. Please wait a few minutes.");
  const connections = await prisma.providerConnection.findMany({ where: { workspaceId: ctx.workspace.id, status: { not: "DISABLED" } } });
  const results = [];
  for (const c of connections) {
    const job = await enqueueSync(c, "manual");
    results.push({ connectionId: c.id, outcome: await runJobNow(job.id) });
  }
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "provider.sync_requested", metadata: { all: true, count: connections.length }, ip: clientIp(req) });
  return ok({ results });
});

export const dynamic = "force-dynamic";
