import "server-only";
import type { Insight, InsightStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { InsightDetail, InsightMetric, InsightSummary, InsightType } from "@/lib/types";

async function names(workspaceId: string) {
  const [teams, apps] = await Promise.all([
    prisma.team.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
    prisma.application.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
  ]);
  return { teams: new Map(teams.map((t) => [t.id, t.name])), apps: new Map(apps.map((a) => [a.id, a.name])) };
}

const SEVERITY_ORDER = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;

function toSummary(i: Insight, n: Awaited<ReturnType<typeof names>>): InsightSummary {
  return {
    id: i.id,
    type: i.type as InsightType,
    severity: i.severity,
    status: i.status,
    title: i.title,
    summary: i.summary,
    provider: i.provider,
    model: i.model,
    teamId: i.teamId,
    applicationId: i.applicationId,
    teamName: i.teamId ? n.teams.get(i.teamId) ?? null : null,
    applicationName: i.applicationId ? n.apps.get(i.applicationId) ?? null : null,
    estimatedImpactUsd: i.estimatedImpactUsd,
    impactKind: (i.impactKind as InsightSummary["impactKind"]) ?? null,
    detectedAt: i.detectedAt.toISOString(),
  };
}

export async function insightSummaries(
  workspaceId: string,
  q: { status?: InsightStatus; type?: string; severity?: string; model?: string; teamId?: string; applicationId?: string; limit?: number } = {},
): Promise<InsightSummary[]> {
  const where: Prisma.InsightWhereInput = { workspaceId };
  if (q.status) where.status = q.status;
  if (q.type) where.type = q.type;
  if (q.severity && ["CRITICAL", "WARNING", "INFO"].includes(q.severity)) where.severity = q.severity as Insight["severity"];
  if (q.model) where.model = q.model;
  if (q.teamId) where.teamId = q.teamId;
  if (q.applicationId) where.applicationId = q.applicationId;
  const [rows, n] = await Promise.all([prisma.insight.findMany({ where, orderBy: { detectedAt: "desc" }, take: 200 }), names(workspaceId)]);
  return rows
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (b.estimatedImpactUsd ?? 0) - (a.estimatedImpactUsd ?? 0))
    .slice(0, q.limit ?? 200)
    .map((i) => toSummary(i, n));
}

export async function insightDetail(workspaceId: string, id: string, isDemo: boolean): Promise<InsightDetail | null> {
  const i = await prisma.insight.findFirst({ where: { id, workspaceId } });
  if (!i) return null;
  const n = await names(workspaceId);
  const trend = i.trend as { label?: string; unit?: InsightMetric["unit"]; points?: { day: string; value: number; baseline?: number }[] } | null;
  const qs = new URLSearchParams();
  if (i.provider) qs.set("provider", i.provider);
  if (i.model) qs.set("model", i.model);
  if (i.applicationId) qs.set("app", i.applicationId);
  else if (i.teamId) qs.set("team", i.teamId);
  if (i.type === "error_spike" || i.type === "provider_outage") qs.set("status", "error");
  if (i.type === "duplicate_requests") qs.set("duplicates", "1");
  qs.set("from", i.windowStart.toISOString().slice(0, 10));
  qs.set("to", i.windowEnd.toISOString().slice(0, 10));
  return {
    ...toSummary(i, n),
    whatHappened: i.whatHappened,
    whyItMatters: i.whyItMatters,
    cause: i.cause,
    recommendation: i.recommendation,
    metrics: i.metrics as unknown as InsightMetric[],
    trend: trend?.points ?? null,
    trendLabel: trend?.label ?? null,
    trendUnit: trend?.unit ?? null,
    windowStart: i.windowStart.toISOString(),
    windowEnd: i.windowEnd.toISOString(),
    relatedRequestsQuery: qs.toString(),
    isDemo,
  };
}
