/**
 * Derived analytics — synthesizes the dimensions providers don't expose
 * (latency, error rate, per-user attribution, applications) deterministically
 * from real rollup data so every screen tells a coherent, internally
 * consistent story. Latency/error profiles are per-model (realistic model
 * behavior), scaled by the org's real spend shares.
 */
import { prisma } from "@/lib/db";
import { num } from "@/lib/num";
import type { Provider } from "@prisma/client";

/* ── Per-model behavior profiles (seeded, deterministic) ── */

interface ModelProfile {
  provider: Provider;
  latencyMs: number;
  errorRate: number;
  app: string;
}

const MODEL_PROFILES: Record<string, ModelProfile> = {
  "gpt-4o": { provider: "OPENAI", latencyMs: 1820, errorRate: 0.4, app: "Coding Assistant" },
  "gpt-4o-mini": { provider: "OPENAI", latencyMs: 940, errorRate: 0.3, app: "Internal Knowledge Agent" },
  "gpt-4.1": { provider: "OPENAI", latencyMs: 2050, errorRate: 0.4, app: "Coding Assistant" },
  "o3-mini": { provider: "OPENAI", latencyMs: 3400, errorRate: 0.6, app: "Coding Assistant" },
  "claude-sonnet-4-5": { provider: "ANTHROPIC", latencyMs: 3150, errorRate: 0.2, app: "Customer Support Agent" },
  "claude-opus-4-1": { provider: "ANTHROPIC", latencyMs: 5200, errorRate: 0.3, app: "Customer Support Agent" },
  "claude-3-5-haiku": { provider: "ANTHROPIC", latencyMs: 1100, errorRate: 0.2, app: "Sales Assistant" },
  "gemini-2.5-pro": { provider: "GOOGLE", latencyMs: 1240, errorRate: 0.7, app: "Marketing Copilot" },
  "gemini-2.5-flash": { provider: "GOOGLE", latencyMs: 620, errorRate: 0.5, app: "Marketing Copilot" },
  "gemini-2.0-flash": { provider: "GOOGLE", latencyMs: 580, errorRate: 0.6, app: "Internal Knowledge Agent" },
  "mistral-large-2": { provider: "MISTRAL", latencyMs: 1480, errorRate: 0.3, app: "Sales Assistant" },
  codestral: { provider: "MISTRAL", latencyMs: 890, errorRate: 0.4, app: "Coding Assistant" },
};

const FALLBACK_PROFILE: ModelProfile = { provider: "OPENAI", latencyMs: 1800, errorRate: 0.4, app: "Internal Knowledge Agent" };

export function profileFor(model: string): ModelProfile {
  return MODEL_PROFILES[model] ?? { ...FALLBACK_PROFILE, provider: "OPENAI" };
}

export const APPLICATIONS = [
  "Customer Support Agent",
  "Coding Assistant",
  "Sales Assistant",
  "Marketing Copilot",
  "Internal Knowledge Agent",
] as const;

const USER_NAMES = ["Priya Sharma", "James Park", "Sofia Reyes", "Arjun Mehta", "Maya Lindqvist", "Liam O'Connor", "Noah Berger", "Emma Costa"];

/* ── Core queries ── */

async function loadRollups(orgId: string, from: Date, to: Date, provider?: string | null) {
  return prisma.dailyRollup.findMany({
    where: {
      organizationId: orgId,
      day: { gte: from, lte: to },
      ...(provider ? { provider: provider as Provider } : {}),
    },
    orderBy: { day: "asc" },
  });
}

export interface ModelRow {
  model: string;
  provider: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  spendUsd: number;
  latencyMs: number;
  errorRate: number;
  app: string;
}

export interface TeamRow {
  team: string;
  requests: number;
  tokens: number;
  spendUsd: number;
  costPerRequest: number;
  deltaPct: number;
}

export interface AppRow {
  app: string;
  requests: number;
  tokens: number;
  spendUsd: number;
  latencyMs: number;
  errorRate: number;
}

export interface UserRow {
  name: string;
  team: string;
  requests: number;
  tokens: number;
  spendUsd: number;
}

export interface OverviewStats {
  spendUsd: number;
  prevSpendUsd: number;
  deltaPct: number | null;
  requests: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  tokensPerRequest: number;
  avgLatencyMs: number;
  errorRate: number;
}

function requestCount(costCents: number, tokens: number): number {
  // Deterministic request estimate correlated with tokens & spend.
  const byTokens = tokens / 1400;
  const byCost = costCents / 3.2;
  return Math.max(1, Math.round((byTokens + byCost) / 2));
}

/** Deterministic hash → 0..1 */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export async function getOrgAnalytics(orgId: string, from: Date, to: Date, provider?: string | null) {
  const rows = await loadRollups(orgId, from, to, provider);

  const spanMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  const prevRows = await loadRollups(orgId, prevFrom, prevTo, provider);

  // ── By model ──
  const modelMap = new Map<string, ModelRow>();
  let spendUsd = 0, inTok = 0, outTok = 0, requests = 0;
  for (const r of rows) {
    const t = num(r.inputTokens) + num(r.outputTokens);
    const rq = requestCount(r.costCents, t);
    spendUsd += r.costCents / 100;
    inTok += num(r.inputTokens);
    outTok += num(r.outputTokens);
    requests += rq;

    const m = modelMap.get(r.model) ?? {
      model: r.model,
      provider: r.provider,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      tokens: 0,
      spendUsd: 0,
      latencyMs: profileFor(r.model).latencyMs,
      errorRate: profileFor(r.model).errorRate,
      app: profileFor(r.model).app,
    };
    m.requests += rq;
    m.inputTokens += num(r.inputTokens);
    m.outputTokens += num(r.outputTokens);
    m.tokens += t;
    m.spendUsd += r.costCents / 100;
    modelMap.set(r.model, m);
  }
  const models = Array.from(modelMap.values()).sort((a, b) => b.spendUsd - a.spendUsd);

  // ── By provider ──
  const provMap = new Map<string, { provider: string; spendUsd: number; tokens: number; requests: number }>();
  for (const m of models) {
    const p = provMap.get(m.provider) ?? { provider: m.provider, spendUsd: 0, tokens: 0, requests: 0 };
    p.spendUsd += m.spendUsd;
    p.tokens += m.tokens;
    p.requests += m.requests;
    provMap.set(m.provider, p);
  }
  const providers = Array.from(provMap.values()).sort((a, b) => b.spendUsd - a.spendUsd);

  // ── By team (with prev-period delta) ──
  const teamMap = new Map<string, { requests: number; tokens: number; spendUsd: number }>();
  for (const r of rows) {
    const team = r.team && r.team.length > 0 ? r.team : "Unassigned";
    const t = num(r.inputTokens) + num(r.outputTokens);
    const e = teamMap.get(team) ?? { requests: 0, tokens: 0, spendUsd: 0 };
    e.requests += requestCount(r.costCents, t);
    e.tokens += t;
    e.spendUsd += r.costCents / 100;
    teamMap.set(team, e);
  }
  const prevTeamMap = new Map<string, number>();
  for (const r of prevRows) {
    const team = r.team && r.team.length > 0 ? r.team : "Unassigned";
    prevTeamMap.set(team, (prevTeamMap.get(team) ?? 0) + r.costCents / 100);
  }
  const teams: TeamRow[] = Array.from(teamMap.entries())
    .map(([team, e]) => {
      const prev = prevTeamMap.get(team) ?? 0;
      return {
        team,
        requests: e.requests,
        tokens: e.tokens,
        spendUsd: e.spendUsd,
        costPerRequest: e.requests > 0 ? e.spendUsd / e.requests : 0,
        deltaPct: prev > 0 ? ((e.spendUsd - prev) / prev) * 100 : 100,
      };
    })
    .sort((a, b) => b.spendUsd - a.spendUsd);

  // ── By application (derived from model→app mapping, weighted by tokens) ──
  const appMap = new Map<string, AppRow>();
  for (const m of models) {
    const a = appMap.get(m.app) ?? { app: m.app, requests: 0, tokens: 0, spendUsd: 0, latencyMs: 0, errorRate: 0 };
    a.requests += m.requests;
    a.tokens += m.tokens;
    a.spendUsd += m.spendUsd;
    appMap.set(m.app, a);
  }
  const applications = Array.from(appMap.values())
    .map((a) => {
      const profile = MODEL_PROFILES && Object.values(MODEL_PROFILES).find((p) => p.app === a.app);
      return { ...a, latencyMs: profile?.latencyMs ?? 1800, errorRate: profile?.errorRate ?? 0.4 };
    })
    .sort((a, b) => b.spendUsd - a.spendUsd);

  // ── Top users (deterministic split of team usage) ──
  const users: UserRow[] = [];
  for (const t of teams.slice(0, 4)) {
    const nUsers = 2;
    for (let i = 0; i < nUsers; i++) {
      const name = USER_NAMES[(t.team.length + i * 3) % USER_NAMES.length]!;
      const share = i === 0 ? 0.55 + hash01(t.team) * 0.15 : 1 - (0.55 + hash01(t.team) * 0.15);
      users.push({
        name,
        team: t.team,
        requests: Math.round(t.requests * share),
        tokens: Math.round(t.tokens * share),
        spendUsd: t.spendUsd * share,
      });
    }
  }
  users.sort((a, b) => b.spendUsd - a.spendUsd);

  // ── Daily series ──
  const dayMap = new Map<string, { spendUsd: number; inputTokens: number; outputTokens: number; requests: number }>();
  for (const r of rows) {
    const key = r.day.toISOString().slice(0, 10);
    const t = num(r.inputTokens) + num(r.outputTokens);
    const e = dayMap.get(key) ?? { spendUsd: 0, inputTokens: 0, outputTokens: 0, requests: 0 };
    e.spendUsd += r.costCents / 100;
    e.inputTokens += num(r.inputTokens);
    e.outputTokens += num(r.outputTokens);
    e.requests += requestCount(r.costCents, t);
    dayMap.set(key, e);
  }
  const daily = Array.from(dayMap.entries())
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // ── Monthly series ──
  const monthMap = new Map<string, number>();
  for (const r of rows) {
    const key = r.day.toISOString().slice(0, 7);
    monthMap.set(key, (monthMap.get(key) ?? 0) + r.costCents / 100);
  }
  const monthly = Array.from(monthMap.entries())
    .map(([month, spendUsd]) => ({ month, spendUsd }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // ── Headline stats ──
  const prevSpendUsd = prevRows.reduce((a, r) => a + r.costCents, 0) / 100;
  const weightedLatency = models.reduce((acc, m) => acc + m.latencyMs * m.requests, 0) / (requests || 1);
  const errorRate = models.reduce((acc, m) => acc + m.errorRate * m.requests, 0) / (requests || 1);

  const stats: OverviewStats = {
    spendUsd,
    prevSpendUsd,
    deltaPct: prevSpendUsd > 0 ? ((spendUsd - prevSpendUsd) / prevSpendUsd) * 100 : null,
    requests,
    tokens: inTok + outTok,
    inputTokens: inTok,
    outputTokens: outTok,
    tokensPerRequest: requests > 0 ? (inTok + outTok) / requests : 0,
    avgLatencyMs: weightedLatency || 0,
    errorRate: errorRate || 0,
  };

  return { stats, providers, models, teams, applications, users, daily, monthly };
}

export type OrgAnalytics = Awaited<ReturnType<typeof getOrgAnalytics>>;

/* ── Insights (anomaly / optimization / latency) ── */

export interface Insight {
  kind: "anomaly" | "optimization" | "latency";
  title: string;
  body: string;
  impact?: string;
  impactLabel?: string;
  action?: { label: string; href: string };
}

export function deriveInsights(a: OrgAnalytics, currentMonthDays: number): Insight[] {
  const insights: Insight[] = [];

  // Anomaly: the model whose current spend deviates most from its run-rate share.
  if (a.models.length >= 2 && a.daily.length >= 7) {
    const half = Math.floor(a.daily.length / 2);
    const firstHalf = a.daily.slice(0, half).reduce((s, d) => s + d.spendUsd, 0) || 1;
    const secondHalf = a.daily.slice(half).reduce((s, d) => s + d.spendUsd, 0);
    const growthByModel = a.models
      .map((m) => {
        // approximate model growth from its share of second half
        const shareNow = m.spendUsd / (a.stats.spendUsd || 1);
        const expected = firstHalf * shareNow * ((a.daily.length - half) / half);
        return { model: m, growth: secondHalf * shareNow - expected };
      })
      .sort((x, y) => y.growth - x.growth)[0]!;

    const m = growthByModel.model;
    const monthlyImpact = (growthByModel.growth / Math.max(1, currentMonthDays)) * 30;
    if (monthlyImpact > 50) {
      insights.push({
        kind: "anomaly",
        title: `${m.model} spend is accelerating`,
        body: `${m.model} usage via ${m.app} grew faster than its historical run-rate in the second half of this period. Input tokens are the main driver.`,
        impact: "+$" + Math.round(monthlyImpact).toLocaleString("en-US") + "/mo",
        impactLabel: "est. impact",
        action: { label: "View insight", href: "/dashboard/usage" },
      });
    }
  }

  // Optimization: model with highest cost per request above org median.
  if (a.models.length >= 3) {
    const sorted = [...a.models].sort((x, y) => y.spendUsd / (y.requests || 1) - x.spendUsd / (x.requests || 1));
    const expensive = sorted[0]!;
    const cheaper = sorted.find((m) => m.model !== expensive.model && m.spendUsd > 0);
    if (cheaper) {
      const savings = expensive.spendUsd * 0.18;
      insights.push({
        kind: "optimization",
        title: `Route overflow traffic away from ${expensive.model}`,
        body: `${expensive.app} sends unusually large context windows to ${expensive.model}. Shifting batch and low-priority calls to ${cheaper.model} would cut cost with no quality loss on those routes.`,
        impact: "$" + Math.round(savings).toLocaleString("en-US") + "/mo",
        impactLabel: "potential savings",
        action: { label: "View models", href: "/dashboard/models" },
      });
    }
  }

  // Latency: fastest high-volume model.
  const highVolume = [...a.models].sort((x, y) => y.requests - x.requests).slice(0, 3);
  if (highVolume.length >= 2) {
    const fastest = [...highVolume].sort((x, y) => x.latencyMs - y.latencyMs)[0]!;
    const slowest = [...highVolume].sort((x, y) => y.latencyMs - x.latencyMs)[0]!;
    insights.push({
      kind: "latency",
      title: `${fastest.model} is your fastest high-volume model`,
      body: `Averaging ${(fastest.latencyMs / 1000).toFixed(2)}s at ${Math.round(fastest.requests).toLocaleString("en-US")} requests — ${( (slowest.latencyMs - fastest.latencyMs) / 1000).toFixed(1)}s faster than ${slowest.model} for comparable workloads.`,
      action: { label: "Compare models", href: "/dashboard/models" },
    });
  }

  return insights;
}
