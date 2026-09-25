/**
 * Analytics engine — all dashboard queries read from the pre-aggregated
 * daily/monthly rollup tables (never raw usage records) so charts load fast.
 * Every query is scoped by organizationId: multi-tenant isolation at the
 * query layer.
 */
import { prisma } from "@/lib/db";
import { Prisma, Provider } from "@prisma/client";

export interface DateRange {
  from: Date;
  to: Date;
}

export function lastNDays(n: number): DateRange {
  const to = new Date();
  to.setUTCHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (n - 1));
  from.setUTCHours(0, 0, 0, 0);
  return { from, to };
}

export function parseRange(searchParams: URLSearchParams): DateRange {
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  if (fromStr && toStr) {
    const from = new Date(`${fromStr}T00:00:00.000Z`);
    const to = new Date(`${toStr}T23:59:59.999Z`);
    if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && from <= to) {
      return { from, to };
    }
  }
  return lastNDays(30);
}

function num(v: bigint | number | null | undefined): number {
  return typeof v === "bigint" ? Number(v) : Number(v ?? 0);
}

/** Retention cutoff for the current plan — older data is filtered out. */
export function retentionCutoff(retentionDays: number): Date {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  return cutoff;
}

async function fetchRollups(orgId: string, range: DateRange, provider?: string | null) {
  const where: Prisma.DailyRollupWhereInput = {
    organizationId: orgId,
    day: { gte: range.from, lte: range.to },
    ...(provider ? { provider: provider as Provider } : {}),
  };
  return prisma.dailyRollup.findMany({ where, orderBy: { day: "asc" } });
}

// ─── Overview ─────────────────────────────────────────────────

export interface OverviewData {
  totals: {
    spendUsd: number;
    inputTokens: number;
    outputTokens: number;
    requests: number;
    prevSpendUsd: number;
    deltaPct: number | null;
  };
  trend: { day: string; spendUsd: number; tokens: number }[];
  byProvider: { provider: string; spendUsd: number; tokens: number }[];
  byModel: { model: string; provider: string; spendUsd: number; tokens: number }[];
}

export async function getOverview(
  orgId: string,
  range: DateRange,
  provider?: string | null,
): Promise<OverviewData> {
  const rows = await fetchRollups(orgId, range, provider);

  const spanMs = range.to.getTime() - range.from.getTime();
  const prevTo = new Date(range.from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  const prevRows = await fetchRollups(orgId, { from: prevFrom, to: prevTo }, provider);

  const sum = (rs: typeof rows) => {
    let cost = 0, inTok = 0, outTok = 0, req = 0;
    for (const r of rs) {
      cost += r.costCents / 100;
      inTok += num(r.inputTokens);
      outTok += num(r.outputTokens);
      req += r.requests;
    }
    return { cost, inTok, outTok, req };
  };

  const cur = sum(rows);
  const prev = sum(prevRows);

  // Daily trend
  const byDay = new Map<string, { spendUsd: number; tokens: number }>();
  for (const r of rows) {
    const key = r.day.toISOString().slice(0, 10);
    const e = byDay.get(key) ?? { spendUsd: 0, tokens: 0 };
    e.spendUsd += r.costCents / 100;
    e.tokens += num(r.inputTokens) + num(r.outputTokens);
    byDay.set(key, e);
  }
  const trend = Array.from(byDay.entries())
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // By provider
  const provMap = new Map<string, { spendUsd: number; tokens: number }>();
  for (const r of rows) {
    const e = provMap.get(r.provider) ?? { spendUsd: 0, tokens: 0 };
    e.spendUsd += r.costCents / 100;
    e.tokens += num(r.inputTokens) + num(r.outputTokens);
    provMap.set(r.provider, e);
  }
  const byProvider = Array.from(provMap.entries())
    .map(([provider, v]) => ({ provider, ...v }))
    .sort((a, b) => b.spendUsd - a.spendUsd);

  // By model
  const modelMap = new Map<string, { model: string; provider: string; spendUsd: number; tokens: number }>();
  for (const r of rows) {
    const e = modelMap.get(r.model) ?? { model: r.model, provider: r.provider, spendUsd: 0, tokens: 0 };
    e.spendUsd += r.costCents / 100;
    e.tokens += num(r.inputTokens) + num(r.outputTokens);
    modelMap.set(r.model, e);
  }
  const byModel = Array.from(modelMap.values()).sort((a, b) => b.spendUsd - a.spendUsd);

  const deltaPct = prev.cost > 0 ? ((cur.cost - prev.cost) / prev.cost) * 100 : null;

  return {
    totals: {
      spendUsd: cur.cost,
      inputTokens: cur.inTok,
      outputTokens: cur.outTok,
      requests: cur.req,
      prevSpendUsd: prev.cost,
      deltaPct,
    },
    trend,
    byProvider,
    byModel,
  };
}

// ─── Token analytics ──────────────────────────────────────────

export interface TokenAnalytics {
  byModel: { model: string; provider: string; inputTokens: number; outputTokens: number; total: number }[];
  series: { day: string; inputTokens: number; outputTokens: number }[];
  byProvider: { provider: string; inputTokens: number; outputTokens: number }[];
  totals: { inputTokens: number; outputTokens: number; total: number };
}

export async function getTokenAnalytics(
  orgId: string,
  range: DateRange,
  provider?: string | null,
): Promise<TokenAnalytics> {
  const rows = await fetchRollups(orgId, range, provider);

  const modelMap = new Map<string, { model: string; provider: string; inputTokens: number; outputTokens: number }>();
  const dayMap = new Map<string, { inputTokens: number; outputTokens: number }>();
  const provMap = new Map<string, { inputTokens: number; outputTokens: number }>();

  for (const r of rows) {
    const inTok = num(r.inputTokens);
    const outTok = num(r.outputTokens);

    const m = modelMap.get(r.model) ?? { model: r.model, provider: r.provider, inputTokens: 0, outputTokens: 0 };
    m.inputTokens += inTok;
    m.outputTokens += outTok;
    modelMap.set(r.model, m);

    const dayKey = r.day.toISOString().slice(0, 10);
    const d = dayMap.get(dayKey) ?? { inputTokens: 0, outputTokens: 0 };
    d.inputTokens += inTok;
    d.outputTokens += outTok;
    dayMap.set(dayKey, d);

    const p = provMap.get(r.provider) ?? { inputTokens: 0, outputTokens: 0 };
    p.inputTokens += inTok;
    p.outputTokens += outTok;
    provMap.set(r.provider, p);
  }

  const totals = { inputTokens: 0, outputTokens: 0, total: 0 };
  const byModel = Array.from(modelMap.values())
    .map((m) => ({ ...m, total: m.inputTokens + m.outputTokens }))
    .sort((a, b) => b.total - a.total);
  for (const m of byModel) totals.inputTokens += m.inputTokens, totals.outputTokens += m.outputTokens, (totals.total += m.total);

  return {
    byModel,
    series: Array.from(dayMap.entries())
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    byProvider: Array.from(provMap.entries())
      .map(([provider, v]) => ({ provider, ...v }))
      .sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens)),
    totals,
  };
}

// ─── Cost analytics ───────────────────────────────────────────

export interface CostAnalytics {
  byModel: { model: string; provider: string; spendUsd: number }[];
  byTeam: { team: string; spendUsd: number }[];
  monthly: { month: string; spendUsd: number }[];
  forecast: { month: string; spendUsd: number; projected: boolean }[];
  totals: { spendUsd: number; avgCostPerRequest: number };
}

/**
 * Simple month-over-month forecast: linear regression over the last up-to-6
 * complete months, projected 3 months forward.
 */
export async function getCostAnalytics(
  orgId: string,
  range: DateRange,
  provider?: string | null,
): Promise<CostAnalytics> {
  const rows = await fetchRollups(orgId, range, provider);

  const modelMap = new Map<string, { model: string; provider: string; spendUsd: number }>();
  const teamMap = new Map<string, { spendUsd: number }>();
  const monthMap = new Map<string, number>();
  let total = 0, requests = 0;

  for (const r of rows) {
    const usd = r.costCents / 100;
    total += usd;
    requests += r.requests;

    const m = modelMap.get(r.model) ?? { model: r.model, provider: r.provider, spendUsd: 0 };
    m.spendUsd += usd;
    modelMap.set(r.model, m);

    const t = teamMap.get(r.team ?? "Unassigned") ?? { spendUsd: 0 };
    t.spendUsd += usd;
    teamMap.set(r.team ?? "Unassigned", t);

    const monthKey = r.day.toISOString().slice(0, 7);
    monthMap.set(monthKey, (monthMap.get(monthKey) ?? 0) + usd);
  }

  const monthly = Array.from(monthMap.entries())
    .map(([month, spendUsd]) => ({ month, spendUsd }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Linear regression on monthly spend (index-based) for the forecast.
  const forecast: { month: string; spendUsd: number; projected: boolean }[] = monthly.map((m) => ({
    ...m,
    projected: false,
  }));
  if (monthly.length >= 2) {
    const n = monthly.length;
    const xs = monthly.map((_, i) => i);
    const ys = monthly.map((m) => m.spendUsd);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = ys.reduce((a, b) => a + b, 0) / n;
    const slope =
      xs.reduce((acc, x, i) => acc + (x - xMean) * (ys[i]! - yMean), 0) /
      (xs.reduce((acc, x) => acc + (x - xMean) ** 2, 0) || 1);
    const intercept = yMean - slope * xMean;

    const last = new Date(`${monthly[n - 1]!.month}-01T00:00:00Z`);
    for (let k = 1; k <= 3; k++) {
      const d = new Date(last);
      d.setUTCMonth(d.getUTCMonth() + k);
      const projectedUsd = Math.max(0, intercept + slope * (n - 1 + k));
      forecast.push({
        month: d.toISOString().slice(0, 7),
        spendUsd: Math.round(projectedUsd * 100) / 100,
        projected: true,
      });
    }
  }

  return {
    byModel: Array.from(modelMap.values()).sort((a, b) => b.spendUsd - a.spendUsd),
    byTeam: Array.from(teamMap.entries())
      .map(([team, v]) => ({ team, ...v }))
      .sort((a, b) => b.spendUsd - a.spendUsd),
    monthly,
    forecast,
    totals: { spendUsd: total, avgCostPerRequest: requests > 0 ? total / requests : 0 },
  };
}

// ─── Budget progress ──────────────────────────────────────────

export interface BudgetProgress {
  budgetCents: number;
  team: string | null;
  spentUsd: number;
  percent: number;
  daysLeft: number;
}

export async function getBudgetProgress(
  orgId: string,
  team: string | null,
  budgetCents: number,
): Promise<BudgetProgress> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const agg = await prisma.dailyRollup.aggregate({
    where: {
      organizationId: orgId,
      day: { gte: monthStart, lte: now },
      ...(team ? { team } : {}),
    },
    _sum: { costCents: true },
  });

  const spentUsd = num(agg._sum.costCents) / 100;
  const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const daysLeft = Math.max(0, Math.ceil((endOfMonth.getTime() - now.getTime()) / 86_400_000));

  return {
    budgetCents,
    team,
    spentUsd,
    percent: budgetCents > 0 ? Math.min(999, Math.round((spentUsd / (budgetCents / 100)) * 100)) : 0,
    daysLeft,
  };
}
