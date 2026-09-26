import type { Prisma } from "@prisma/client";
import { prisma, num } from "@/server/db";
import { ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { parseFilters } from "@/server/analytics/filters";
import type { EventRow } from "@/lib/types";

const PAGE = 50;

/** Paginated usage-event explorer (server-side filtering, keyset pagination). */
export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req);
  const sp = new URL(req.url).searchParams;
  const f = parseFilters(sp);
  const where: Prisma.UsageEventWhereInput = {
    workspaceId: ctx.workspace.id,
    timestamp: { gte: new Date(f.from + "T00:00:00Z"), lt: new Date(Date.parse(f.to + "T00:00:00Z") + 86_400_000) },
  };
  if (f.providers.length) where.provider = { in: f.providers };
  if (f.model) where.model = f.model;
  if (f.teamId) where.teamId = f.teamId;
  if (f.applicationId) where.applicationId = f.applicationId;
  const status = sp.get("status");
  if (status === "error") where.errorCount = { gt: 0 };
  const user = sp.get("user");
  if (user) where.userRef = user.slice(0, 120);
  if (sp.get("duplicates") === "1") where.promptHash = { not: null };
  const source = sp.get("source");
  if (source === "ingest") where.source = "INGEST_API";
  if (source === "sync") where.source = "PROVIDER_SYNC";

  const cursor = sp.get("cursor");
  const rows = await prisma.usageEvent.findMany({
    where,
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    take: PAGE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const [teams, apps] = await Promise.all([
    prisma.team.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }),
    prisma.application.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }),
  ]);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const appName = new Map(apps.map((a) => [a.id, a.name]));
  const page = rows.slice(0, PAGE);
  const events: EventRow[] = page.map((e) => ({
    id: e.id,
    timestamp: e.timestamp.toISOString(),
    source: e.source,
    provider: e.provider,
    model: e.model,
    applicationId: e.applicationId,
    applicationName: e.applicationId ? appName.get(e.applicationId) ?? null : null,
    teamId: e.teamId,
    teamName: e.teamId ? teamName.get(e.teamId) ?? null : null,
    userRef: e.userRef,
    requestCount: e.requestCount,
    errorCount: e.errorCount,
    inputTokens: num(e.inputTokens),
    outputTokens: num(e.outputTokens),
    costUsd: e.costUsd,
    costSource: e.costSource,
    latencyMs: e.latencyMsSum != null && e.requestCount > 0 ? e.latencyMsSum / e.requestCount : null,
    status: e.status,
    errorCode: e.errorCode,
    requestId: e.requestId,
    promptHash: e.promptHash,
  }));
  return ok({ events, nextCursor: rows.length > PAGE ? page[page.length - 1]!.id : null, filters: f });
});

export const dynamic = "force-dynamic";
