import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { addDays, toDay } from "./analytics/filters";
import type { BudgetItem } from "@/lib/types";

interface DayDim {
  day: string;
  key: string;
  costUsd: number;
}

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Every budget needs the same three sums (month-to-date, last 7 days, and
 * month-to-date including today) over the same table, differing only by a
 * team/app filter. Reading each dimension once as a per-day breakdown turns
 * 3 aggregate queries per budget into 2 for the whole workspace, which matters
 * because this runs for every workspace inside the insight refresh.
 *
 * Days are grouped with to_char("day") so the bucketing matches aggregate()
 * everywhere else rather than re-deriving the calendar date in JS.
 */
async function dailyCost(workspaceId: string, from: string, to: string, column: "teamId" | "applicationId"): Promise<DayDim[]> {
  const rows = await prisma.$queryRaw<DayDim[]>`
    SELECT to_char("day", 'YYYY-MM-DD') AS "day", ${Prisma.raw(`"${column}"`)} AS "key",
           COALESCE(SUM("costUsd"),0)::float8 AS "costUsd"
    FROM "daily_usage"
    WHERE "workspaceId" = ${workspaceId} AND "day" >= ${from}::date AND "day" <= ${to}::date
    GROUP BY 1, 2`;
  return rows;
}

function windowSum(rows: DayDim[], key: string | null, from: string, to: string): number {
  let total = 0;
  for (const r of rows) {
    if (key !== null && r.key !== key) continue;
    if (r.day < from || r.day > to) continue;
    total += r.costUsd;
  }
  return total;
}

export async function budgetStatuses(workspaceId: string, now = new Date()): Promise<BudgetItem[]> {
  const today = toDay(now);
  const monthStart = today.slice(0, 8) + "01";
  const yesterday = addDays(today, -1);
  const last7From = addDays(today, -7);
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const daysLeft = daysInMonth - dayOfMonth;
  // The last-7 window can start before the month, so read from the earlier bound.
  const windowFrom = last7From < monthStart ? last7From : monthStart;

  const [budgets, teams, apps, byTeam, byApp] = await Promise.all([
    prisma.budget.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.team.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
    prisma.application.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
    dailyCost(workspaceId, windowFrom, today, "teamId"),
    dailyCost(workspaceId, windowFrom, today, "applicationId"),
  ]);
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const appNames = new Map(apps.map((a) => [a.id, a.name]));

  return budgets.map((b) => {
    // A team/app-scoped budget reads the matching breakdown; a workspace budget
    // sums every row, which either breakdown reproduces.
    const isTeam = b.scope === "TEAM";
    const isApp = b.scope === "APPLICATION";
    const rows = isApp ? byApp : byTeam;
    const key = isApp ? b.applicationId : isTeam ? b.teamId : null;

    const spentUsd = windowSum(rows, key, monthStart, today);
    const mtdUsd = dayOfMonth > 1 ? windowSum(rows, key, monthStart, yesterday) : 0;
    const dailyAvgUsd = windowSum(rows, key, last7From, yesterday) / 7;
    // Use today's actuals if they exceed the projection basis (e.g. first days of month).
    const projectedUsd = Math.max(round(mtdUsd + dailyAvgUsd * (daysInMonth - (dayOfMonth - 1))), spentUsd);
    const percent = b.amountUsd > 0 ? (spentUsd / b.amountUsd) * 100 : 0;
    const lowest = Math.min(...(b.thresholds.length ? b.thresholds : [80]));
    return {
      id: b.id,
      name: b.name,
      scope: b.scope,
      teamId: b.teamId,
      applicationId: b.applicationId,
      targetName: isApp ? appNames.get(b.applicationId ?? "") ?? "Deleted application" : isTeam ? teamNames.get(b.teamId ?? "") ?? "Deleted team" : "Workspace",
      amountUsd: b.amountUsd,
      thresholds: b.thresholds,
      notify: b.notify,
      spentUsd: round(spentUsd),
      percent: Math.round(percent * 10) / 10,
      projectedUsd: round(projectedUsd),
      projectedPercent: b.amountUsd > 0 ? Math.round((projectedUsd / b.amountUsd) * 1000) / 10 : 0,
      status: percent >= 100 ? "exceeded" : percent >= lowest ? "warning" : "ok",
      daysLeft,
      period: b.period,
    } satisfies BudgetItem;
  });
}
