import "server-only";
import { Prisma } from "@prisma/client";
import { prisma, num } from "../db";
import { resolvePrice } from "../pricing/service";
import { addDays, pctChange, previousPeriod, toDay, type Filters } from "./filters";
import { aggregate, densify, totals, type Agg, type AggRow } from "./query";
import type {
  BreakdownRow,
  CostsView,
  DataBasis,
  EntityDetailView,
  Kpi,
  Lookups,
  ModelDetailView,
  ModelRow,
  OverviewView,
  SeriesPoint,
  UsageView,
  UserRow,
} from "@/lib/types";
import { insightSummaries } from "../insights/queries";

export async function getLookups(workspaceId: string): Promise<Lookups> {
  const [teams, apps, providers] = await Promise.all([
    prisma.team.findMany({ where: { workspaceId }, select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
    prisma.application.findMany({ where: { workspaceId }, select: { id: true, name: true, slug: true, teamId: true }, orderBy: { name: "asc" } }),
    prisma.dailyUsage.findMany({ where: { workspaceId }, distinct: ["provider"], select: { provider: true } }),
  ]);
  return { teams, apps, providers: providers.map((p) => p.provider).sort() };
}

async function dataBasis(workspaceId: string, isDemo: boolean, cur: Agg): Promise<DataBasis> {
  if (isDemo) return "demo";
  if (cur.costUsd <= 0) return "calculated";
  const share = cur.reportedCostUsd / cur.costUsd;
  void workspaceId;
  if (share > 0.99) return "reported";
  if (share < 0.01) return "calculated";
  return "mixed";
}

const kpi = (value: number, prev: number, spark: number[]): Kpi => ({ value, prev, change: pctChange(value, prev), spark });

function toPoint(p: Agg & { day: string }): SeriesPoint {
  return {
    day: p.day,
    costUsd: round(p.costUsd, 4),
    requests: p.requests,
    tokens: p.tokens,
    inputTokens: p.inputTokens,
    outputTokens: p.outputTokens,
    latencyMs: p.latencyMs,
    errorRate: p.errorRate,
    reportedCostUsd: round(p.reportedCostUsd, 4),
  };
}

const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

function breakdown(rows: AggRow[], prevRows: AggRow[], key: "provider" | "model" | "team" | "app", names: Map<string, string>, total: number): BreakdownRow[] {
  const prev = new Map(prevRows.map((r) => [r.keys[key]!, r]));
  return rows
    .map((r) => {
      const id = r.keys[key]!;
      const p = prev.get(id);
      return {
        id,
        name: id === "" ? "Unattributed" : names.get(id) ?? id,
        costUsd: round(r.costUsd, 4),
        requests: r.requests,
        tokens: r.tokens,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        latencyMs: r.latencyMs,
        errorRate: r.errorRate,
        costPerRequest: r.requests ? r.costUsd / r.requests : null,
        share: total > 0 ? r.costUsd / total : 0,
        change: pctChange(r.costUsd, p?.costUsd ?? 0),
        prevCostUsd: round(p?.costUsd ?? 0, 4),
      };
    })
    .sort((a, b) => b.costUsd - a.costUsd);
}

function modelRows(rows: AggRow[], prevRows: AggRow[]): ModelRow[] {
  const prev = new Map(prevRows.map((r) => [`${r.keys.provider}|${r.keys.model}`, r]));
  return rows
    .map((r) => {
      const p = prev.get(`${r.keys.provider}|${r.keys.model}`);
      return {
        provider: r.keys.provider!,
        model: r.keys.model!,
        requests: r.requests,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        tokens: r.tokens,
        costUsd: round(r.costUsd, 4),
        costPerRequest: r.requests ? r.costUsd / r.requests : null,
        latencyMs: r.latencyMs,
        errorRate: r.errorRate,
        errors: r.errors,
        change: pctChange(r.costUsd, p?.costUsd ?? 0),
        priced: !!resolvePrice(r.keys.provider!, r.keys.model!),
      };
    })
    .sort((a, b) => b.costUsd - a.costUsd);
}

async function nameMaps(workspaceId: string) {
  const l = await getLookups(workspaceId);
  return {
    lookups: l,
    teams: new Map(l.teams.map((t) => [t.id, t.name])),
    apps: new Map(l.apps.map((a) => [a.id, a.name])),
  };
}

/** Month-to-date spend + trailing-7-day average for the remaining days. */
export async function projection(workspaceId: string, f: Filters, now = new Date()) {
  const today = toDay(now);
  const monthStart = today.slice(0, 8) + "01";
  const yesterday = addDays(today, -1);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  const scope = { ...f, from: monthStart, to: yesterday };
  const mtd = dayOfMonth > 1 ? (await totals(workspaceId, scope)).costUsd : 0;
  const last7 = await totals(workspaceId, { ...f, from: addDays(today, -7), to: yesterday });
  const dailyAvg = last7.costUsd / 7;
  const remaining = daysInMonth - (dayOfMonth - 1);
  return { projectedUsd: round(mtd + dailyAvg * remaining), mtdUsd: round(mtd), dailyAvgUsd: round(dailyAvg), daysInMonth };
}

async function potentialSavings(workspaceId: string) {
  const agg = await prisma.insight.aggregate({
    where: { workspaceId, status: "OPEN", impactKind: "savings" },
    _sum: { estimatedImpactUsd: true },
    _count: true,
  });
  return { value: round(num(agg._sum.estimatedImpactUsd)), count: agg._count };
}

// ─── Overview ────────────────────────────────────────────────

export async function overviewView(workspaceId: string, isDemo: boolean, f: Filters): Promise<OverviewView> {
  const pf = previousPeriod(f);
  const [cur, prev, daily, provRows, prevProv, mRows, pmRows, tRows, ptRows, aRows, paRows, names] = await Promise.all([
    totals(workspaceId, f),
    totals(workspaceId, pf),
    aggregate(workspaceId, f, ["day"]),
    aggregate(workspaceId, f, ["provider"]),
    aggregate(workspaceId, pf, ["provider"]),
    aggregate(workspaceId, f, ["provider", "model"]),
    aggregate(workspaceId, pf, ["provider", "model"]),
    aggregate(workspaceId, f, ["team"]),
    aggregate(workspaceId, pf, ["team"]),
    aggregate(workspaceId, f, ["app"]),
    aggregate(workspaceId, pf, ["app"]),
    nameMaps(workspaceId),
  ]);
  const series = densify(daily, f.from, f.to).map(toPoint);
  const spark = <K extends keyof SeriesPoint>(k: K) => series.slice(-14).map((p) => Number(p[k] ?? 0));
  const [proj, savings, insights] = await Promise.all([projection(workspaceId, f), potentialSavings(workspaceId), insightSummaries(workspaceId, { status: "OPEN", limit: 4 })]);
  return {
    filters: f,
    lookups: names.lookups,
    basis: await dataBasis(workspaceId, isDemo, cur),
    empty: cur.requests === 0 && cur.tokens === 0,
    kpis: {
      spend: kpi(round(cur.costUsd), round(prev.costUsd), spark("costUsd")),
      requests: kpi(cur.requests, prev.requests, spark("requests")),
      tokens: kpi(cur.tokens, prev.tokens, spark("tokens")),
      latencyMs: kpi(cur.latencyMs ?? 0, prev.latencyMs ?? 0, series.slice(-14).map((p) => p.latencyMs ?? 0)),
      errorRate: kpi(cur.errorRate, prev.errorRate, spark("errorRate")),
      projectedMonthlyUsd: proj.projectedUsd,
      potentialSavingsUsd: savings.value,
      savingsInsightCount: savings.count,
      latencyMeasured: cur.latencyCount > 0,
    },
    series,
    byProvider: breakdown(provRows, prevProv, "provider", new Map(), cur.costUsd),
    models: modelRows(mRows, pmRows),
    teams: breakdown(tRows, ptRows, "team", names.teams, cur.costUsd),
    apps: breakdown(aRows, paRows, "app", names.apps, cur.costUsd),
    insights,
  };
}

// ─── Usage ───────────────────────────────────────────────────

export async function topUsers(workspaceId: string, f: Filters, limit = 10): Promise<UserRow[]> {
  const from = new Date(f.from + "T00:00:00Z");
  const to = new Date(Date.parse(f.to + "T00:00:00Z") + 86_400_000);
  const conds: Prisma.Sql[] = [
    Prisma.sql`"workspaceId" = ${workspaceId}`,
    Prisma.sql`"timestamp" >= ${from}`,
    Prisma.sql`"timestamp" < ${to}`,
    Prisma.sql`"userRef" IS NOT NULL`,
  ];
  if (f.providers.length) conds.push(Prisma.sql`"provider" IN (${Prisma.join(f.providers)})`);
  if (f.teamId) conds.push(Prisma.sql`"teamId" = ${f.teamId}`);
  if (f.applicationId) conds.push(Prisma.sql`"applicationId" = ${f.applicationId}`);
  if (f.model) conds.push(Prisma.sql`"model" = ${f.model}`);
  const rows = await prisma.$queryRaw<{ user: string; team: string | null; requests: bigint; tokens: bigint; cost: number }[]>`
    SELECT "userRef" AS "user", MAX("teamId") AS team, SUM("requestCount") AS requests,
           SUM("inputTokens" + "outputTokens") AS tokens, SUM("costUsd")::float8 AS cost
    FROM "usage_events" WHERE ${Prisma.join(conds, " AND ")}
    GROUP BY "userRef" ORDER BY cost DESC LIMIT ${limit}`;
  return rows.map((r) => ({ user: r.user, teamId: r.team, requests: num(r.requests), tokens: num(r.tokens), costUsd: round(r.cost, 4) }));
}

export async function usageView(workspaceId: string, isDemo: boolean, f: Filters): Promise<UsageView> {
  const pf = previousPeriod(f);
  const [cur, prev, daily, prov, pprov, models, pmodels, teams, pteams, apps, papps, names, users] = await Promise.all([
    totals(workspaceId, f),
    totals(workspaceId, pf),
    aggregate(workspaceId, f, ["day"]),
    aggregate(workspaceId, f, ["provider"]),
    aggregate(workspaceId, pf, ["provider"]),
    aggregate(workspaceId, f, ["provider", "model"]),
    aggregate(workspaceId, pf, ["provider", "model"]),
    aggregate(workspaceId, f, ["team"]),
    aggregate(workspaceId, pf, ["team"]),
    aggregate(workspaceId, f, ["app"]),
    aggregate(workspaceId, pf, ["app"]),
    nameMaps(workspaceId),
    topUsers(workspaceId, f, 10),
  ]);
  const series = densify(daily, f.from, f.to).map(toPoint);
  const tpr = (a: Agg) => (a.requests ? a.tokens / a.requests : 0);
  return {
    filters: f,
    lookups: names.lookups,
    basis: await dataBasis(workspaceId, isDemo, cur),
    empty: cur.tokens === 0 && cur.requests === 0,
    kpis: {
      tokens: kpi(cur.tokens, prev.tokens, series.slice(-14).map((p) => p.tokens)),
      inputTokens: kpi(cur.inputTokens, prev.inputTokens, series.slice(-14).map((p) => p.inputTokens)),
      outputTokens: kpi(cur.outputTokens, prev.outputTokens, series.slice(-14).map((p) => p.outputTokens)),
      tokensPerRequest: kpi(tpr(cur), tpr(prev), series.slice(-14).map((p) => (p.requests ? p.tokens / p.requests : 0))),
      requests: kpi(cur.requests, prev.requests, series.slice(-14).map((p) => p.requests)),
    },
    series,
    byProvider: breakdown(prov, pprov, "provider", new Map(), cur.costUsd),
    models: modelRows(models, pmodels),
    teams: breakdown(teams, pteams, "team", names.teams, cur.costUsd),
    apps: breakdown(apps, papps, "app", names.apps, cur.costUsd),
    users: users.map((u) => ({ ...u, teamName: u.teamId ? names.teams.get(u.teamId) ?? null : null })),
  };
}

// ─── Costs ───────────────────────────────────────────────────

export async function costsView(workspaceId: string, isDemo: boolean, f: Filters): Promise<CostsView> {
  const pf = previousPeriod(f);
  const [cur, prev, daily, monthly, prov, pprov, models, pmodels, teams, pteams, apps, papps, names, proj, savings] = await Promise.all([
    totals(workspaceId, f),
    totals(workspaceId, pf),
    aggregate(workspaceId, f, ["day"]),
    aggregate(workspaceId, f, ["month"]),
    aggregate(workspaceId, f, ["provider"]),
    aggregate(workspaceId, pf, ["provider"]),
    aggregate(workspaceId, f, ["provider", "model"]),
    aggregate(workspaceId, pf, ["provider", "model"]),
    aggregate(workspaceId, f, ["team"]),
    aggregate(workspaceId, pf, ["team"]),
    aggregate(workspaceId, f, ["app"]),
    aggregate(workspaceId, pf, ["app"]),
    nameMaps(workspaceId),
    projection(workspaceId, f),
    potentialSavings(workspaceId),
  ]);
  const series = densify(daily, f.from, f.to).map(toPoint);
  const appRows = breakdown(apps, papps, "app", names.apps, cur.costUsd);
  // Waterfall: previous period → change per application → current period.
  const allApps = new Set([...apps.map((a) => a.keys.app!), ...papps.map((a) => a.keys.app!)]);
  const prevMap = new Map(papps.map((a) => [a.keys.app!, a.costUsd]));
  const curMap = new Map(apps.map((a) => [a.keys.app!, a.costUsd]));
  const steps = [...allApps]
    .map((id) => ({ id, name: id === "" ? "Unattributed" : names.apps.get(id) ?? id, delta: round((curMap.get(id) ?? 0) - (prevMap.get(id) ?? 0)) }))
    .filter((s) => Math.abs(s.delta) >= 0.01)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return {
    filters: f,
    lookups: names.lookups,
    basis: await dataBasis(workspaceId, isDemo, cur),
    empty: cur.costUsd === 0 && cur.requests === 0,
    kpis: {
      spend: kpi(round(cur.costUsd), round(prev.costUsd), series.slice(-14).map((p) => p.costUsd)),
      projectedMonthlyUsd: proj.projectedUsd,
      mtdUsd: proj.mtdUsd,
      dailyAvg: kpi(round(cur.costUsd / f.days), round(prev.costUsd / f.days), []),
      potentialSavingsUsd: savings.value,
      savingsInsightCount: savings.count,
      reportedShare: cur.costUsd > 0 ? cur.reportedCostUsd / cur.costUsd : 0,
    },
    series,
    monthly: monthly.map((r) => ({ month: r.keys.month!, costUsd: round(r.costUsd) })).sort((a, b) => a.month.localeCompare(b.month)),
    byProvider: breakdown(prov, pprov, "provider", new Map(), cur.costUsd),
    models: modelRows(models, pmodels),
    teams: breakdown(teams, pteams, "team", names.teams, cur.costUsd),
    apps: appRows,
    waterfall: { previous: round(prev.costUsd), current: round(cur.costUsd), steps: steps.slice(0, 8), otherDelta: round(steps.slice(8).reduce((s, x) => s + x.delta, 0)) },
  };
}

// ─── Models ──────────────────────────────────────────────────

export async function modelsView(workspaceId: string, f: Filters) {
  const pf = previousPeriod(f);
  const [rows, prevRows, lookups] = await Promise.all([
    aggregate(workspaceId, f, ["provider", "model"]),
    aggregate(workspaceId, pf, ["provider", "model"]),
    getLookups(workspaceId),
  ]);
  return { filters: f, lookups, models: modelRows(rows, prevRows) };
}

export async function modelCompareSeries(workspaceId: string, f: Filters, models: { provider: string; model: string }[]) {
  const out = [];
  for (const m of models.slice(0, 4)) {
    const scoped = { ...f, providers: [m.provider], model: m.model };
    const [daily, t] = await Promise.all([aggregate(workspaceId, scoped, ["day"]), totals(workspaceId, scoped)]);
    out.push({
      provider: m.provider,
      model: m.model,
      totals: { ...t, costPerRequest: t.requests ? t.costUsd / t.requests : null },
      price: resolvePrice(m.provider, m.model),
      series: densify(daily, f.from, f.to).map(toPoint),
    });
  }
  return out;
}

export async function modelDetailView(workspaceId: string, isDemo: boolean, f: Filters, provider: string, model: string): Promise<ModelDetailView | null> {
  const scoped = { ...f, providers: [provider], model };
  const pf = previousPeriod(scoped);
  const [cur, prev, daily, apps, teams, names, everUsed] = await Promise.all([
    totals(workspaceId, scoped),
    totals(workspaceId, pf),
    aggregate(workspaceId, scoped, ["day"]),
    aggregate(workspaceId, scoped, ["app"]),
    aggregate(workspaceId, scoped, ["team"]),
    nameMaps(workspaceId),
    prisma.dailyUsage.findFirst({ where: { workspaceId, provider, model }, select: { day: true } }),
  ]);
  if (!everUsed) return null;
  const insights = await insightSummaries(workspaceId, { model, limit: 10 });
  return {
    filters: f,
    lookups: names.lookups,
    basis: await dataBasis(workspaceId, isDemo, cur),
    provider,
    model,
    price: resolvePrice(provider, model),
    totals: { ...cur, costPerRequest: cur.requests ? cur.costUsd / cur.requests : null },
    change: {
      costUsd: pctChange(cur.costUsd, prev.costUsd),
      requests: pctChange(cur.requests, prev.requests),
      tokens: pctChange(cur.tokens, prev.tokens),
      latencyMs: cur.latencyMs != null && prev.latencyMs != null ? pctChange(cur.latencyMs, prev.latencyMs) : null,
      errorRate: pctChange(cur.errorRate, prev.errorRate),
    },
    series: densify(daily, f.from, f.to).map(toPoint),
    apps: breakdown(apps, [], "app", names.apps, cur.costUsd),
    teams: breakdown(teams, [], "team", names.teams, cur.costUsd),
    insights,
  };
}

// ─── Teams & applications ───────────────────────────────────

export async function entityListView(workspaceId: string, f: Filters, kind: "team" | "app") {
  const pf = previousPeriod(f);
  const [rows, prevRows, names, cur] = await Promise.all([
    aggregate(workspaceId, f, [kind]),
    aggregate(workspaceId, pf, [kind]),
    nameMaps(workspaceId),
    totals(workspaceId, f),
  ]);
  const map = kind === "team" ? names.teams : names.apps;
  const list = breakdown(rows, prevRows, kind, map, cur.costUsd);
  // Include registered entities with no usage in the window.
  const registered = kind === "team" ? names.lookups.teams : names.lookups.apps;
  for (const e of registered) {
    if (!list.find((r) => r.id === e.id)) {
      list.push({ id: e.id, name: e.name, costUsd: 0, requests: 0, tokens: 0, inputTokens: 0, outputTokens: 0, latencyMs: null, errorRate: 0, costPerRequest: null, share: 0, change: null, prevCostUsd: 0 });
    }
  }
  let memberCounts: Record<string, number> = {};
  if (kind === "team") {
    const counts = await prisma.workspaceMember.groupBy({ by: ["teamId"], where: { workspaceId, teamId: { not: null } }, _count: true });
    memberCounts = Object.fromEntries(counts.map((c) => [c.teamId!, c._count]));
  }
  const appTeams = new Map(names.lookups.apps.map((a) => [a.id, a.teamId]));
  return {
    filters: f,
    lookups: names.lookups,
    rows: list.map((r) => ({
      ...r,
      members: memberCounts[r.id] ?? 0,
      teamId: kind === "app" ? appTeams.get(r.id) ?? null : null,
      teamName: kind === "app" ? names.teams.get(appTeams.get(r.id) ?? "") ?? null : null,
    })),
  };
}

export async function entityDetailView(workspaceId: string, isDemo: boolean, f: Filters, kind: "team" | "app", id: string): Promise<EntityDetailView | null> {
  const entity =
    kind === "team"
      ? await prisma.team.findFirst({ where: { id, workspaceId }, select: { id: true, name: true, slug: true, createdAt: true } })
      : await prisma.application.findFirst({
          where: { id, workspaceId },
          select: { id: true, name: true, slug: true, description: true, createdAt: true, team: { select: { id: true, name: true } } },
        });
  if (!entity) return null;
  const scoped: Filters = kind === "team" ? { ...f, teamId: id } : { ...f, applicationId: id };
  const pf = previousPeriod(scoped);
  const [cur, prev, daily, models, pmodels, other, names, users, insights, errorCodes] = await Promise.all([
    totals(workspaceId, scoped),
    totals(workspaceId, pf),
    aggregate(workspaceId, scoped, ["day"]),
    aggregate(workspaceId, scoped, ["provider", "model"]),
    aggregate(workspaceId, pf, ["provider", "model"]),
    aggregate(workspaceId, scoped, [kind === "team" ? "app" : "team"]),
    nameMaps(workspaceId),
    topUsers(workspaceId, scoped, 8),
    insightSummaries(workspaceId, kind === "team" ? { teamId: id, limit: 10 } : { applicationId: id, limit: 10 }),
    kind === "app" ? topErrorCodes(workspaceId, scoped) : Promise.resolve([]),
  ]);
  const series = densify(daily, f.from, f.to).map(toPoint);
  return {
    kind,
    entity: {
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      description: "description" in entity ? ((entity.description as string | null) ?? null) : null,
      team: "team" in entity ? ((entity.team as { id: string; name: string } | null) ?? null) : null,
    },
    filters: f,
    lookups: names.lookups,
    basis: await dataBasis(workspaceId, isDemo, cur),
    totals: { ...cur, costPerRequest: cur.requests ? cur.costUsd / cur.requests : null },
    change: {
      costUsd: pctChange(cur.costUsd, prev.costUsd),
      requests: pctChange(cur.requests, prev.requests),
      tokens: pctChange(cur.tokens, prev.tokens),
      latencyMs: cur.latencyMs != null && prev.latencyMs != null ? pctChange(cur.latencyMs, prev.latencyMs) : null,
      errorRate: pctChange(cur.errorRate, prev.errorRate),
    },
    series,
    models: modelRows(models, pmodels),
    related: breakdown(other, [], kind === "team" ? "app" : "team", kind === "team" ? names.apps : names.teams, cur.costUsd),
    users: users.map((u) => ({ ...u, teamName: u.teamId ? names.teams.get(u.teamId) ?? null : null })),
    insights,
    errorCodes,
  };
}

async function topErrorCodes(workspaceId: string, f: Filters) {
  const from = new Date(f.from + "T00:00:00Z");
  const to = new Date(Date.parse(f.to + "T00:00:00Z") + 86_400_000);
  const rows = await prisma.usageEvent.groupBy({
    by: ["errorCode"],
    where: { workspaceId, timestamp: { gte: from, lt: to }, errorCount: { gt: 0 }, ...(f.applicationId ? { applicationId: f.applicationId } : {}) },
    _sum: { errorCount: true },
    orderBy: { _sum: { errorCount: "desc" } },
    take: 5,
  });
  return rows.map((r) => ({ code: r.errorCode ?? "unknown", count: num(r._sum.errorCount) }));
}
