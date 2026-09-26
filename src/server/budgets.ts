import "server-only";
import type { Budget } from "@prisma/client";
import { prisma } from "./db";
import { projection } from "./analytics/views";
import { totals } from "./analytics/query";
import { addDays, toDay, type Filters } from "./analytics/filters";
import type { BudgetItem } from "@/lib/types";

function monthFilters(b: Budget, now: Date): Filters {
  const today = toDay(now);
  return {
    range: "custom",
    from: today.slice(0, 8) + "01",
    to: today,
    days: now.getUTCDate(),
    providers: [],
    teamId: b.scope === "TEAM" ? b.teamId : null,
    applicationId: b.scope === "APPLICATION" ? b.applicationId : null,
    model: null,
  };
}

export async function budgetStatuses(workspaceId: string, now = new Date()): Promise<BudgetItem[]> {
  const [budgets, teams, apps] = await Promise.all([
    prisma.budget.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.team.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
    prisma.application.findMany({ where: { workspaceId }, select: { id: true, name: true } }),
  ]);
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const appNames = new Map(apps.map((a) => [a.id, a.name]));
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const daysLeft = daysInMonth - now.getUTCDate();

  return Promise.all(
    budgets.map(async (b) => {
      const f = monthFilters(b, now);
      const [spent, proj] = await Promise.all([totals(workspaceId, f), projection(workspaceId, { ...f, from: addDays(f.from, 0) }, now)]);
      // Use today's actuals if they exceed the projection basis (e.g. first days of month).
      const projectedUsd = Math.max(proj.projectedUsd, spent.costUsd);
      const percent = b.amountUsd > 0 ? (spent.costUsd / b.amountUsd) * 100 : 0;
      const lowest = Math.min(...(b.thresholds.length ? b.thresholds : [80]));
      return {
        id: b.id,
        name: b.name,
        scope: b.scope,
        teamId: b.teamId,
        applicationId: b.applicationId,
        targetName:
          b.scope === "WORKSPACE" ? "Workspace" : b.scope === "TEAM" ? teamNames.get(b.teamId ?? "") ?? "Deleted team" : appNames.get(b.applicationId ?? "") ?? "Deleted application",
        amountUsd: b.amountUsd,
        thresholds: b.thresholds,
        notify: b.notify,
        spentUsd: Math.round(spent.costUsd * 100) / 100,
        percent: Math.round(percent * 10) / 10,
        projectedUsd: Math.round(projectedUsd * 100) / 100,
        projectedPercent: b.amountUsd > 0 ? Math.round((projectedUsd / b.amountUsd) * 1000) / 10 : 0,
        status: percent >= 100 ? "exceeded" : percent >= lowest ? "warning" : "ok",
        daysLeft,
        period: b.period,
      } satisfies BudgetItem;
    }),
  );
}
