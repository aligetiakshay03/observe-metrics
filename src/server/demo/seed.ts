import "server-only";
import { prisma } from "../db";
import { rebuildDailyUsage } from "../ingest/rollup";
import { refreshWorkspaceIntelligence } from "../insights/run";
import { uniqueWorkspaceSlug } from "../workspaces";
import { addDays, toDay } from "../analytics/filters";
import { projection } from "../analytics/views";
import { DEMO_HISTORY_DAYS, generateDemoDataset } from "./generator";
import { logger } from "../log";

const log = logger("demo");
export const DEMO_WORKSPACE_NAME = "Helix Labs (Demo)";

/**
 * Return the user's demo workspace, creating it (or regenerating stale data)
 * as needed. Each user gets their own demo workspace so that marking alerts
 * read or creating budgets never affects anyone else.
 */
export async function ensureDemoWorkspace(userId: string, now = new Date()) {
  const existing = await prisma.workspaceMember.findFirst({
    where: { userId, workspace: { isDemo: true } },
    include: { workspace: true },
  });
  if (existing) {
    const latest = await prisma.dailyUsage.findFirst({ where: { workspaceId: existing.workspaceId }, orderBy: { day: "desc" }, select: { day: true } });
    const stale = !latest || toDay(latest.day) < addDays(toDay(now), -1);
    if (stale) await seedDemoData(existing.workspaceId, now);
    return existing.workspace;
  }
  const workspace = await prisma.workspace.create({
    data: {
      name: DEMO_WORKSPACE_NAME,
      companyName: "Helix Labs",
      slug: await uniqueWorkspaceSlug("helix-demo"),
      isDemo: true,
      onboardingCompletedAt: now,
      members: { create: { userId, role: "OWNER", jobFunction: "Explorer" } },
    },
  });
  await seedDemoData(workspace.id, now);
  return workspace;
}

/** (Re)generate the demo dataset for a demo workspace. */
export async function seedDemoData(workspaceId: string, now = new Date()) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws?.isDemo) throw new Error("Refusing to seed demo data into a non-demo workspace");
  const t0 = Date.now();

  await prisma.$transaction([
    prisma.alert.deleteMany({ where: { workspaceId } }),
    prisma.insight.deleteMany({ where: { workspaceId } }),
    prisma.notification.deleteMany({ where: { workspaceId } }),
    prisma.dailyUsage.deleteMany({ where: { workspaceId } }),
    prisma.usageEvent.deleteMany({ where: { workspaceId } }),
    prisma.budget.deleteMany({ where: { workspaceId } }),
  ]);

  const data = generateDemoDataset(now);
  const teamIds = new Map<string, string>();
  for (const t of data.teams) {
    const team = await prisma.team.upsert({
      where: { workspaceId_slug: { workspaceId, slug: t.slug } },
      create: { workspaceId, slug: t.slug, name: t.name },
      update: { name: t.name },
    });
    teamIds.set(t.slug, team.id);
  }
  const appIds = new Map<string, string>();
  for (const a of data.apps) {
    const app = await prisma.application.upsert({
      where: { workspaceId_slug: { workspaceId, slug: a.slug } },
      create: { workspaceId, slug: a.slug, name: a.name, description: a.description, teamId: teamIds.get(a.team) ?? null },
      update: { name: a.name, description: a.description, teamId: teamIds.get(a.team) ?? null },
    });
    appIds.set(a.slug, app.id);
  }
  // Put the demo user on the Engineering team so "my team" views have data.
  await prisma.workspaceMember.updateMany({ where: { workspaceId }, data: { teamId: teamIds.get("engineering") ?? null } });

  const rows = data.events.map((e) => ({
    workspaceId,
    source: "DEMO" as const,
    provider: e.provider,
    model: e.model,
    applicationId: appIds.get(e.app) ?? null,
    teamId: teamIds.get(e.team) ?? null,
    userRef: e.userRef,
    timestamp: e.timestamp,
    requestCount: e.requestCount,
    errorCount: e.errorCount,
    inputTokens: BigInt(e.inputTokens),
    outputTokens: BigInt(e.outputTokens),
    costUsd: e.costUsd,
    costSource: "DEMO" as const,
    latencyMsSum: e.latencyMsSum,
    status: e.status,
    errorCode: e.errorCode,
    requestId: e.requestId,
    promptHash: e.promptHash,
    dedupeKey: e.dedupeKey,
  }));
  for (let i = 0; i < rows.length; i += 2000) {
    await prisma.usageEvent.createMany({ data: rows.slice(i, i + 2000), skipDuplicates: true });
  }
  const days: string[] = [];
  for (let d = DEMO_HISTORY_DAYS - 1; d >= 0; d--) days.push(addDays(toDay(now), -d));
  await rebuildDailyUsage(workspaceId, days);

  await createDemoBudgets(workspaceId, teamIds, appIds, now);
  await refreshWorkspaceIntelligence(workspaceId, now);
  log.info(`seeded demo workspace ${workspaceId}: ${rows.length} events in ${Date.now() - t0}ms`);
}

/**
 * Budgets sized relative to the generated run-rate so the demo shows one
 * healthy, one warning and one exceeded budget whatever day it is seeded.
 */
async function createDemoBudgets(workspaceId: string, teams: Map<string, string>, apps: Map<string, string>, now: Date) {
  const base = { range: "custom" as const, from: toDay(now), to: toDay(now), days: 1, providers: [], teamId: null, applicationId: null, model: null };
  const round50 = (v: number) => Math.max(50, Math.round(v / 50) * 50);
  const ws = await projection(workspaceId, base, now);
  const eng = await projection(workspaceId, { ...base, teamId: teams.get("engineering")! }, now);
  const support = await projection(workspaceId, { ...base, applicationId: apps.get("customer-support-agent")! }, now);
  const budgets = [
    { name: "Workspace AI spend", scope: "WORKSPACE" as const, amountUsd: round50(ws.projectedUsd * 1.25) },
    // Sized so month-to-date spend is ~73% of the budget: a warning at 80% is imminent.
    { name: "Engineering", scope: "TEAM" as const, teamId: teams.get("engineering")!, amountUsd: round50(Math.max(eng.mtdUsd / 0.728, eng.projectedUsd * 0.97)) },
    { name: "Customer Support Agent", scope: "APPLICATION" as const, applicationId: apps.get("customer-support-agent")!, amountUsd: round50(support.projectedUsd * 0.82) },
  ];
  for (const b of budgets) {
    await prisma.budget.create({ data: { workspaceId, thresholds: [80, 100], notify: true, ...b } });
  }
}
