import { prisma } from "@/server/db";
import { E, ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { serializeConnection } from "@/server/providers/serialize";

/** Sync status + recent job history for one connection. */
export const GET = route(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireWorkspace(req);
  const c = await prisma.providerConnection.findFirst({ where: { id: params.id, workspaceId: ctx.workspace.id } });
  if (!c) throw E.notFound("Connection");
  const jobs = await prisma.syncJob.findMany({
    where: { connectionId: c.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, status: true, trigger: true, attempts: true, startedAt: true, finishedAt: true, recordsIngested: true, error: true, createdAt: true },
  });
  return ok({ connection: serializeConnection(c), jobs });
});

export const dynamic = "force-dynamic";
