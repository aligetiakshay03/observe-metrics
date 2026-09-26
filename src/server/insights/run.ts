import "server-only";
import { Prisma } from "@prisma/client";
import { prisma, num } from "../db";
import { addDays, toDay } from "../analytics/filters";
import { budgetStatuses } from "../budgets";
import { alertForInsight, upsertAlert } from "../alerts";
import { logger } from "../log";
import { runRules, type DayRow, type DuplicateGroup, type InsightDraft, type RuleContext } from "./rules";

const log = logger("insights");

/** ISO week key (e.g. 2026-W39) so a recurring condition maps to one insight per week. */
function isoWeek(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function fingerprintFor(d: Pick<InsightDraft, "type" | "subject" | "windowEnd">): string {
  const periodic = d.type === "budget_threshold" || d.type === "provider_outage";
  return periodic ? `${d.type}:${d.subject}` : `${d.type}:${d.subject}:${isoWeek(d.windowEnd)}`;
}

export async function buildRuleContext(workspaceId: string, now = new Date()): Promise<RuleContext> {
  const today = toDay(now);
  const since = addDays(today, -36);
  const [daily, apps, teams, budgets, dupRows] = await Promise.all([
    prisma.dailyUsage.findMany({ where: { workspaceId, day: { gte: new Date(since + "T00:00:00Z") } } }),
    prisma.application.findMany({ where: { workspaceId }, select: { id: true, name: true, teamId: true } }),
    prisma.team.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
    budgetStatuses(workspaceId, now),
    prisma.$queryRaw<{ provider: string; model: string; app: string | null; hash: string; n: bigint; cost: number }[]>`
      SELECT "provider", "model", "applicationId" AS app, "promptHash" AS hash, COUNT(*) AS n, SUM("costUsd")::float8 AS cost
      FROM "usage_events"
      WHERE "workspaceId" = ${workspaceId} AND "promptHash" IS NOT NULL
        AND "timestamp" >= ${new Date(addDays(today, -7) + "T00:00:00Z")} AND "timestamp" < ${new Date(today + "T00:00:00Z")}
      GROUP BY 1, 2, 3, 4 HAVING COUNT(*) >= 2`,
  ]);
  const rows: DayRow[] = daily.map((r) => ({
    day: toDay(r.day),
    provider: r.provider,
    model: r.model,
    applicationId: r.applicationId,
    teamId: r.teamId,
    requests: r.requests,
    errors: r.errors,
    inputTokens: num(r.inputTokens),
    outputTokens: num(r.outputTokens),
    costUsd: r.costUsd,
    latencyMsSum: r.latencyMsSum,
    latencyCount: r.latencyCount,
  }));
  const duplicates: DuplicateGroup[] = dupRows.map((d) => ({
    provider: d.provider,
    model: d.model,
    applicationId: d.app ?? "",
    promptHash: d.hash,
    count: num(d.n),
    costUsd: d.cost,
    firstCostUsd: d.cost / num(d.n),
  }));
  return {
    today,
    rows,
    apps: new Map(apps.map((a) => [a.id, { name: a.name, teamId: a.teamId }])),
    teams: new Map(teams.map((t) => [t.id, t.name])),
    duplicates,
    budgets: budgets.map((b) => ({
      id: b.id,
      name: b.name,
      targetName: b.targetName,
      teamId: b.teamId,
      applicationId: b.applicationId,
      amountUsd: b.amountUsd,
      spentUsd: b.spentUsd,
      projectedUsd: b.projectedUsd,
      thresholds: b.thresholds,
    })),
  };
}

/**
 * Recompute insights for a workspace and raise alerts/notifications for new
 * findings. Idempotent: fingerprints dedupe repeated runs, and user status
 * changes (dismissed/resolved) are preserved.
 */
export async function refreshWorkspaceIntelligence(workspaceId: string, now = new Date()): Promise<{ insights: number; created: number }> {
  try {
    const ctx = await buildRuleContext(workspaceId, now);
    const drafts = runRules(ctx);
    let created = 0;
    for (const d of drafts) {
      const fingerprint = fingerprintFor(d);
      const data = {
        type: d.type,
        severity: d.severity,
        title: d.title,
        summary: d.summary,
        whatHappened: d.whatHappened,
        whyItMatters: d.whyItMatters,
        cause: d.cause,
        recommendation: d.recommendation,
        provider: d.provider ?? null,
        model: d.model ?? null,
        teamId: d.teamId ?? null,
        applicationId: d.applicationId ?? null,
        metrics: d.metrics as unknown as Prisma.InputJsonValue,
        trend: d.trend ? ({ label: d.trendLabel, unit: d.trendUnit, points: d.trend } as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        estimatedImpactUsd: d.estimatedImpactUsd,
        impactKind: d.impactKind,
        windowStart: new Date(d.windowStart + "T00:00:00Z"),
        windowEnd: new Date(d.windowEnd + "T23:59:59Z"),
      };
      const existing = await prisma.insight.findUnique({ where: { workspaceId_fingerprint: { workspaceId, fingerprint } }, select: { id: true } });
      const insight = existing
        ? await prisma.insight.update({ where: { id: existing.id }, data })
        : await prisma.insight.create({ data: { ...data, workspaceId, fingerprint, detectedAt: now } });
      if (!existing) created++;
      if (insight.status === "OPEN") await alertForInsight(insight, !existing);
    }
    await budgetAlerts(workspaceId, ctx, now);
    return { insights: drafts.length, created };
  } catch (e) {
    log.error(`refresh failed for workspace ${workspaceId}`, e);
    return { insights: 0, created: 0 };
  }
}

/** One alert per budget threshold crossed per month. */
async function budgetAlerts(workspaceId: string, ctx: RuleContext, now: Date) {
  const period = toDay(now).slice(0, 7);
  for (const b of ctx.budgets) {
    if (b.amountUsd <= 0) continue;
    const used = (b.spentUsd / b.amountUsd) * 100;
    const crossed = [...b.thresholds].sort((x, y) => y - x).find((t) => used >= t);
    if (crossed == null) continue;
    const budget = await prisma.budget.findUnique({ where: { id: b.id } });
    if (!budget) continue;
    if (budget.alertedPeriod === period && (budget.alertedThreshold ?? 0) >= crossed) continue;
    const insight = await prisma.insight.findUnique({
      where: { workspaceId_fingerprint: { workspaceId, fingerprint: `budget_threshold:${b.id}|${period}` } },
      select: { id: true },
    });
    await upsertAlert({
      workspaceId,
      fingerprint: `budget:${b.id}:${period}:${crossed}`,
      category: "BUDGET",
      severity: crossed >= 100 ? "CRITICAL" : "WARNING",
      title: `${/budget$/i.test(b.name.trim()) ? b.name.trim() : `${b.name} budget`} ${crossed >= 100 ? "exceeded" : `reached ${crossed}%`}`,
      message: `${b.targetName} has spent $${b.spentUsd.toFixed(2)} of its $${b.amountUsd.toFixed(2)} monthly budget (${Math.round(used)}%).`,
      href: insight ? `/dashboard/insights/${insight.id}` : "/dashboard/budgets",
      insightId: insight?.id ?? null,
      budgetId: b.id,
      notify: budget.notify,
    });
    await prisma.budget.update({ where: { id: b.id }, data: { alertedPeriod: period, alertedThreshold: crossed } });
  }
}

/** Refresh every workspace with recent usage (cron tick). */
export async function refreshAllActiveWorkspaces(now = new Date()) {
  const since = new Date(addDays(toDay(now), -2) + "T00:00:00Z");
  const active = await prisma.dailyUsage.findMany({ where: { day: { gte: since } }, distinct: ["workspaceId"], select: { workspaceId: true } });
  for (const { workspaceId } of active) await refreshWorkspaceIntelligence(workspaceId, now);
  return active.length;
}
