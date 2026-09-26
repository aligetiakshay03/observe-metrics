/**
 * Deterministic insight rules. Each rule is a pure function over daily usage
 * aggregates (and a few precomputed facts) that returns zero or more drafts.
 * No ML is involved: every number in an insight can be traced back to
 * daily_usage / usage_events with the evidence metrics attached.
 *
 * Windows (UTC, complete days only):
 *   current  = the 7 days ending yesterday
 *   baseline = the 14 days before that, normalized to a 7-day equivalent
 */
import { fmtChange, fmtCompact, fmtMs, fmtRate, fmtUsd0, prettyModel, providerLabel } from "../../lib/format";
import type { InsightMetric, InsightType, Severity } from "../../lib/types";
import { cheaperAlternatives, resolvePrice } from "../pricing/service";
import { addDays } from "../analytics/filters";

export interface DayRow {
  day: string;
  provider: string;
  model: string;
  applicationId: string; // "" = unattributed
  teamId: string;
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMsSum: number;
  latencyCount: number;
}

export interface DuplicateGroup {
  provider: string;
  model: string;
  applicationId: string;
  promptHash: string;
  count: number;
  costUsd: number;
  firstCostUsd: number;
}

export interface BudgetFact {
  id: string;
  name: string;
  targetName: string;
  teamId: string | null;
  applicationId: string | null;
  amountUsd: number;
  spentUsd: number;
  projectedUsd: number;
  thresholds: number[];
}

export interface RuleContext {
  today: string; // YYYY-MM-DD (UTC)
  rows: DayRow[];
  apps: Map<string, { name: string; teamId: string | null }>;
  teams: Map<string, string>;
  duplicates: DuplicateGroup[];
  budgets: BudgetFact[];
}

export interface InsightDraft {
  type: InsightType;
  subject: string; // stable fingerprint component
  severity: Severity;
  title: string;
  summary: string;
  whatHappened: string;
  whyItMatters: string;
  cause: string;
  recommendation: string;
  provider?: string | null;
  model?: string | null;
  teamId?: string | null;
  applicationId?: string | null;
  metrics: InsightMetric[];
  trend: { day: string; value: number; baseline?: number }[] | null;
  trendLabel: string | null;
  trendUnit: InsightMetric["unit"] | null;
  estimatedImpactUsd: number | null;
  impactKind: "cost_increase" | "savings" | "risk" | null;
  windowStart: string;
  windowEnd: string;
}

// ── helpers ──────────────────────────────────────────────────

interface Sum {
  requests: number;
  errors: number;
  input: number;
  output: number;
  cost: number;
  latSum: number;
  latCount: number;
}
const zero = (): Sum => ({ requests: 0, errors: 0, input: 0, output: 0, cost: 0, latSum: 0, latCount: 0 });

function sum(rows: DayRow[], from: string, to: string, pred: (r: DayRow) => boolean = () => true): Sum {
  const s = zero();
  for (const r of rows) {
    if (r.day < from || r.day > to || !pred(r)) continue;
    s.requests += r.requests;
    s.errors += r.errors;
    s.input += r.inputTokens;
    s.output += r.outputTokens;
    s.cost += r.costUsd;
    s.latSum += r.latencyMsSum;
    s.latCount += r.latencyCount;
  }
  return s;
}

const scale = (s: Sum, k: number): Sum => ({
  requests: s.requests * k,
  errors: s.errors * k,
  input: s.input * k,
  output: s.output * k,
  cost: s.cost * k,
  latSum: s.latSum,
  latCount: s.latCount,
});

const pct = (cur: number, base: number) => (base > 0 ? ((cur - base) / base) * 100 : null);
const lat = (s: Sum) => (s.latCount > 0 ? s.latSum / s.latCount : null);
const perReq = (v: number, s: Sum) => (s.requests > 0 ? v / s.requests : 0);

function metric(label: string, current: number, baseline: number, unit: InsightMetric["unit"]): InsightMetric {
  return { label, current, baseline, unit, change: pct(current, baseline) };
}

function dailySeries(rows: DayRow[], from: string, to: string, pred: (r: DayRow) => boolean, pick: (s: Sum) => number | null) {
  const out: { day: string; value: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const v = pick(sum(rows, d, d, pred));
    out.push({ day: d, value: v == null ? 0 : Math.round(v * 10000) / 10000 });
  }
  return out;
}

function groups<K extends string>(rows: DayRow[], key: (r: DayRow) => K | null): Map<K, DayRow[]> {
  const m = new Map<K, DayRow[]>();
  for (const r of rows) {
    const k = key(r);
    if (k == null) continue;
    let arr = m.get(k);
    if (!arr) m.set(k, (arr = []));
    arr.push(r);
  }
  return m;
}

interface Windows {
  curFrom: string;
  curTo: string;
  baseFrom: string;
  baseTo: string;
  trendFrom: string;
}
function windows(today: string): Windows {
  const curTo = addDays(today, -1);
  return { curTo, curFrom: addDays(curTo, -6), baseTo: addDays(curTo, -7), baseFrom: addDays(curTo, -20), trendFrom: addDays(curTo, -27) };
}

const appName = (ctx: RuleContext, id: string) => (id ? ctx.apps.get(id)?.name ?? "an application" : "unattributed traffic");
const teamName = (ctx: RuleContext, id: string | null | undefined) => (id ? ctx.teams.get(id) ?? "a team" : null);

// ── cost_anomaly ─────────────────────────────────────────────

export function costAnomalies(ctx: RuleContext): InsightDraft[] {
  const w = windows(ctx.today);
  const weeklyTotal = sum(ctx.rows, w.curFrom, w.curTo).cost;
  const minDelta = Math.max(25, weeklyTotal * 0.02);
  const out: InsightDraft[] = [];
  const byKey = groups(ctx.rows, (r) => `${r.provider}|${r.model}|${r.applicationId}`);
  for (const [key, rows] of byKey) {
    const [provider, model, applicationId] = key.split("|") as [string, string, string];
    const cur = sum(rows, w.curFrom, w.curTo);
    const base = scale(sum(rows, w.baseFrom, w.baseTo), 0.5);
    if (base.cost <= 0 || cur.cost < base.cost * 1.25 || cur.cost - base.cost < minDelta) continue;

    const spendChange = pct(cur.cost, base.cost)!;
    const reqChange = pct(cur.requests, base.requests);
    const ctxCur = perReq(cur.input, cur);
    const ctxBase = perReq(base.input, base);
    const ctxChange = pct(ctxCur, ctxBase);
    const monthly = ((cur.cost - base.cost) / 7) * 30;
    const app = appName(ctx, applicationId);
    const contextDriven = ctxChange != null && reqChange != null && ctxChange > Math.max(10, reqChange);
    const teamId = applicationId ? ctx.apps.get(applicationId)?.teamId ?? null : null;

    out.push({
      type: "cost_anomaly",
      subject: key,
      severity: monthly >= 500 || spendChange >= 75 ? "CRITICAL" : "WARNING",
      title: `${prettyModel(model)} spend up ${Math.round(spendChange)}% in ${app}`,
      summary: `${fmtUsd0(cur.cost)} over the last 7 days vs a ${fmtUsd0(base.cost)} weekly baseline.`,
      whatHappened: `Spend on ${prettyModel(model)} (${providerLabel(provider)}) from ${app} rose ${fmtChange(spendChange)} compared with its previous two-week baseline — from ${fmtUsd0(base.cost)} to ${fmtUsd0(cur.cost)} per week.`,
      whyItMatters: `At the current rate this adds roughly ${fmtUsd0(monthly)} per month. Left unchecked, it will push the ${app} line item well above its historical run-rate.`,
      cause: contextDriven
        ? `Average input tokens per request increased ${fmtChange(ctxChange)} (from ${fmtCompact(ctxBase)} to ${fmtCompact(ctxCur)}) while request volume changed ${fmtChange(reqChange)}. Each request is carrying more context — typically longer retained conversation history or larger retrieved documents.`
        : `Request volume changed ${fmtChange(reqChange)} while average context size changed ${fmtChange(ctxChange)}. The increase is driven mainly by more traffic rather than larger requests.`,
      recommendation: contextDriven
        ? `Review how much conversation history and retrieved context ${app} sends per request. Trim or summarize older turns for routine requests and cap retrieved documents; consider prompt caching for the stable part of the prompt.`
        : `Confirm the traffic increase is expected (launch, new customers, batch jobs). If not, check for retry loops or runaway automation calling ${prettyModel(model)}.`,
      provider,
      model,
      teamId,
      applicationId: applicationId || null,
      metrics: [
        metric("Spend (7 days)", cur.cost, base.cost, "usd"),
        metric("Input tokens", cur.input, base.input, "tokens"),
        metric("Requests", cur.requests, base.requests, "count"),
        metric("Avg input tokens / request", ctxCur, ctxBase, "tokens"),
        metric("Avg output tokens / request", perReq(cur.output, cur), perReq(base.output, base), "tokens"),
      ],
      trend: dailySeries(rows, w.trendFrom, w.curTo, () => true, (s) => s.cost).map((p) => ({ ...p, baseline: Math.round((base.cost / 7) * 100) / 100 })),
      trendLabel: "Daily spend",
      trendUnit: "usd",
      estimatedImpactUsd: Math.round(monthly),
      impactKind: "cost_increase",
      windowStart: w.curFrom,
      windowEnd: w.curTo,
    });
  }
  return out;
}

// ── usage_spike (per team) ───────────────────────────────────

export function usageSpikes(ctx: RuleContext, covered: Set<string>): InsightDraft[] {
  const w = windows(ctx.today);
  const out: InsightDraft[] = [];
  for (const [teamId, rows] of groups(ctx.rows, (r) => (r.teamId ? r.teamId : null))) {
    if (covered.has(teamId)) continue; // already explained by a cost anomaly in this team
    const cur = sum(rows, w.curFrom, w.curTo);
    const base = scale(sum(rows, w.baseFrom, w.baseTo), 0.5);
    const curTok = cur.input + cur.output;
    const baseTok = base.input + base.output;
    if (baseTok <= 0 || curTok < baseTok * 1.4 || curTok - baseTok < 2_000_000) continue;
    const change = pct(curTok, baseTok)!;
    const name = teamName(ctx, teamId)!;
    out.push({
      type: "usage_spike",
      subject: teamId,
      severity: change >= 100 ? "WARNING" : "INFO",
      title: `${name} token usage up ${Math.round(change)}%`,
      summary: `${fmtCompact(curTok)} tokens in the last 7 days vs ${fmtCompact(baseTok)} per week before.`,
      whatHappened: `The ${name} team consumed ${fmtCompact(curTok)} tokens over the last 7 days, ${fmtChange(change)} above its weekly baseline.`,
      whyItMatters: `Spend attributed to ${name} moved from ${fmtUsd0(base.cost)} to ${fmtUsd0(cur.cost)} per week. Sustained, that is about ${fmtUsd0(((cur.cost - base.cost) / 7) * 30)} per month more.`,
      cause: `Requests changed ${fmtChange(pct(cur.requests, base.requests))} and tokens per request changed ${fmtChange(pct(perReq(curTok, cur), perReq(baseTok, base)))}.`,
      recommendation: `Check which applications and users drive the increase on the ${name} team page, and confirm it matches planned work.`,
      teamId,
      metrics: [
        metric("Tokens (7 days)", curTok, baseTok, "tokens"),
        metric("Requests", cur.requests, base.requests, "count"),
        metric("Spend", cur.cost, base.cost, "usd"),
      ],
      trend: dailySeries(rows, w.trendFrom, w.curTo, () => true, (s) => s.input + s.output),
      trendLabel: "Daily tokens",
      trendUnit: "tokens",
      estimatedImpactUsd: Math.round(((cur.cost - base.cost) / 7) * 30),
      impactKind: "cost_increase",
      windowStart: w.curFrom,
      windowEnd: w.curTo,
    });
  }
  return out;
}

// ── latency_regression (per model) ───────────────────────────

export function latencyRegressions(ctx: RuleContext): InsightDraft[] {
  const w = windows(ctx.today);
  const out: InsightDraft[] = [];
  for (const [key, rows] of groups(ctx.rows, (r) => `${r.provider}|${r.model}`)) {
    const [provider, model] = key.split("|") as [string, string];
    const cur = sum(rows, w.curFrom, w.curTo);
    const base = sum(rows, w.baseFrom, w.baseTo);
    const lc = lat(cur);
    const lb = lat(base);
    if (lc == null || lb == null || cur.latCount < 300 || base.latCount < 300) continue;
    if (lc < lb * 1.2 || lc - lb < 250) continue;
    const change = pct(lc, lb)!;
    // Which application is most affected?
    let worst: { app: string; change: number } | null = null;
    for (const [appId, appRows] of groups(rows, (r) => r.applicationId)) {
      const a = lat(sum(appRows, w.curFrom, w.curTo));
      const b = lat(sum(appRows, w.baseFrom, w.baseTo));
      if (a != null && b != null && b > 0) {
        const c = ((a - b) / b) * 100;
        if (!worst || c > worst.change) worst = { app: appId, change: c };
      }
    }
    out.push({
      type: "latency_regression",
      subject: key,
      severity: change >= 50 ? "CRITICAL" : "WARNING",
      title: `${prettyModel(model)} latency up ${Math.round(change)}%`,
      summary: `Average latency ${fmtMs(lc)} over the last 7 days vs ${fmtMs(lb)} before.`,
      whatHappened: `Measured average latency for ${prettyModel(model)} increased from ${fmtMs(lb)} to ${fmtMs(lc)} (${fmtChange(change)}) across ${fmtCompact(cur.requests)} requests.`,
      whyItMatters: `Slower responses degrade user-facing experiences and can trigger client timeouts and retries, which also add cost.`,
      cause: `Output tokens per request changed ${fmtChange(pct(perReq(cur.output, cur), perReq(base.output, base)))} — ${
        (pct(perReq(cur.output, cur), perReq(base.output, base)) ?? 0) > 15 ? "longer generations explain part of the slowdown." : "generation length is roughly flat, which points to provider-side slowdown or queueing."
      }${worst ? ` The largest regression is in ${appName(ctx, worst.app)} (${fmtChange(worst.change)}).` : ""}`,
      recommendation: `Compare against other models on the Models page. For latency-sensitive routes, consider streaming, lowering max output tokens, or routing to a faster model and validating quality on your own evaluation set.`,
      provider,
      model,
      applicationId: worst?.app || null,
      teamId: worst?.app ? ctx.apps.get(worst.app)?.teamId ?? null : null,
      metrics: [
        metric("Avg latency", lc, lb, "ms"),
        metric("Requests", cur.requests, base.requests / 2, "count"),
        metric("Avg output tokens / request", perReq(cur.output, cur), perReq(base.output, base), "tokens"),
      ],
      trend: dailySeries(rows, w.trendFrom, w.curTo, () => true, lat).map((p) => ({ ...p, baseline: Math.round(lb) })),
      trendLabel: "Daily average latency",
      trendUnit: "ms",
      estimatedImpactUsd: null,
      impactKind: "risk",
      windowStart: w.curFrom,
      windowEnd: w.curTo,
    });
  }
  return out;
}

// ── error_spike + provider_outage ────────────────────────────

export function errorSpikes(ctx: RuleContext): InsightDraft[] {
  const curTo = addDays(ctx.today, -1);
  const curFrom = addDays(curTo, -2); // last 3 complete days
  const baseTo = addDays(curFrom, -1);
  const baseFrom = addDays(baseTo, -13);
  const out: InsightDraft[] = [];
  for (const [key, rows] of groups(ctx.rows, (r) => `${r.provider}|${r.model}`)) {
    const [provider, model] = key.split("|") as [string, string];
    const cur = sum(rows, curFrom, curTo);
    const base = sum(rows, baseFrom, baseTo);
    if (cur.requests < 200) continue;
    const rc = cur.errors / cur.requests;
    const rb = base.requests ? base.errors / base.requests : 0;
    if (rc < 0.02 || rc < Math.max(rb * 3, 0.005)) continue;
    const affected = [...groups(rows, (r) => r.applicationId)]
      .map(([id, rs]) => ({ id, s: sum(rs, curFrom, curTo) }))
      .filter((x) => x.s.errors > 0)
      .sort((a, b) => b.s.errors - a.s.errors)[0];
    out.push({
      type: "error_spike",
      subject: key,
      severity: rc >= 0.05 ? "CRITICAL" : "WARNING",
      title: `${prettyModel(model)} error rate at ${fmtRate(rc, 1)}`,
      summary: `${fmtCompact(cur.errors)} failed requests in the last 3 days (baseline ${fmtRate(rb)}).`,
      whatHappened: `${fmtCompact(cur.errors)} of ${fmtCompact(cur.requests)} requests to ${prettyModel(model)} failed over the last 3 days — an error rate of ${fmtRate(rc)} against a ${fmtRate(rb)} baseline.`,
      whyItMatters: `Failed requests break user flows and are frequently retried, which multiplies token spend without producing results.`,
      cause: affected
        ? `Most failures come from ${appName(ctx, affected.id)} (${fmtCompact(affected.s.errors)} errors). Check the error codes on the application page — 429s point to rate limits, 5xx to provider issues.`
        : `Failures are spread across callers. Check error codes for rate limiting (429) versus provider errors (5xx).`,
      recommendation: `If errors are 429s, add client-side backoff and request a rate-limit increase. For 5xx errors, add a fallback model for critical paths.`,
      provider,
      model,
      applicationId: affected?.id || null,
      teamId: affected?.id ? ctx.apps.get(affected.id)?.teamId ?? null : null,
      metrics: [metric("Error rate", rc * 100, rb * 100, "pct"), metric("Failed requests", cur.errors, (base.errors / 14) * 3, "count"), metric("Requests", cur.requests, (base.requests / 14) * 3, "count")],
      trend: dailySeries(rows, addDays(curTo, -20), curTo, () => true, (s) => (s.requests ? (s.errors / s.requests) * 100 : 0)),
      trendLabel: "Daily error rate",
      trendUnit: "pct",
      estimatedImpactUsd: null,
      impactKind: "risk",
      windowStart: curFrom,
      windowEnd: curTo,
    });
  }
  return out;
}

export function providerOutages(ctx: RuleContext): InsightDraft[] {
  const curTo = addDays(ctx.today, -1);
  const from = addDays(curTo, -6);
  const out: InsightDraft[] = [];
  for (const [provider, rows] of groups(ctx.rows, (r) => r.provider)) {
    const base = sum(rows, addDays(from, -21), addDays(from, -1));
    const rb = base.requests ? base.errors / base.requests : 0;
    let peak: { day: string; s: Sum } | null = null;
    for (let d = from; d <= curTo; d = addDays(d, 1)) {
      const s = sum(rows, d, d);
      if (s.requests < 300) continue;
      const r = s.errors / s.requests;
      if (r >= 0.05 && r >= rb * 5 && (!peak || r > peak.s.errors / peak.s.requests)) peak = { day: d, s };
    }
    if (!peak) continue;
    const rate = peak.s.errors / peak.s.requests;
    const models = [...new Set(rows.filter((r) => r.day === peak!.day && r.errors > 0).map((r) => r.model))];
    out.push({
      type: "provider_outage",
      subject: `${provider}|${peak.day}`,
      severity: "WARNING",
      title: `${providerLabel(provider)} errors spiked to ${fmtRate(rate, 1)} on ${peak.day}`,
      summary: `Elevated failures across ${models.length} ${providerLabel(provider)} model${models.length === 1 ? "" : "s"} on the same day.`,
      whatHappened: `On ${peak.day}, ${fmtCompact(peak.s.errors)} of ${fmtCompact(peak.s.requests)} requests to ${providerLabel(provider)} failed (${fmtRate(rate)}), compared with a ${fmtRate(rb)} baseline.`,
      whyItMatters: `Errors across several models at once usually indicate a provider-side incident rather than an application bug. Every workload on this provider was affected.`,
      cause: `Affected models: ${models.map(prettyModel).join(", ")}. The simultaneous increase across models points to provider availability.`,
      recommendation: `Check the provider's status page for an incident on that date. For critical paths, configure a fallback provider so requests can be retried elsewhere during outages.`,
      provider,
      metrics: [metric("Error rate (peak day)", rate * 100, rb * 100, "pct"), metric("Failed requests", peak.s.errors, 0, "count")],
      trend: dailySeries(rows, addDays(curTo, -20), curTo, () => true, (s) => (s.requests ? (s.errors / s.requests) * 100 : 0)),
      trendLabel: "Daily error rate",
      trendUnit: "pct",
      estimatedImpactUsd: null,
      impactKind: "risk",
      windowStart: peak.day,
      windowEnd: peak.day,
    });
  }
  return out;
}

// ── oversized_context ────────────────────────────────────────

export function oversizedContext(ctx: RuleContext): InsightDraft[] {
  const w = windows(ctx.today);
  const out: InsightDraft[] = [];
  for (const [key, rows] of groups(ctx.rows, (r) => (r.applicationId ? `${r.provider}|${r.model}|${r.applicationId}` : null))) {
    const [provider, model, applicationId] = key.split("|") as [string, string, string];
    const cur = sum(rows, w.curFrom, w.curTo);
    if (cur.requests < 500) continue;
    const inPer = perReq(cur.input, cur);
    const outPer = perReq(cur.output, cur);
    if (inPer < 6000 || outPer <= 0 || inPer / outPer < 12 || cur.cost < 50) continue;
    const price = resolvePrice(provider, model);
    if (!price) continue;
    const inputCost = (cur.input / 1e6) * price.inputPer1M;
    const monthlySavings = (inputCost * 0.3 * 30) / 7;
    if (monthlySavings < 25) continue;
    const app = appName(ctx, applicationId);
    out.push({
      type: "oversized_context",
      subject: key,
      severity: "INFO",
      title: `${app} sends ${fmtCompact(inPer)} input tokens per request`,
      summary: `Input outweighs output ${Math.round(inPer / outPer)}:1 on ${prettyModel(model)}.`,
      whatHappened: `Requests from ${app} to ${prettyModel(model)} averaged ${fmtCompact(inPer)} input tokens and ${fmtCompact(outPer)} output tokens over the last 7 days.`,
      whyItMatters: `Input tokens account for ${fmtUsd0(inputCost)} of ${fmtUsd0(cur.cost)} spent on this route this week. Large, repeated context is the most common source of avoidable AI spend.`,
      cause: `A ${Math.round(inPer / outPer)}:1 input-to-output ratio usually means full conversation history, long system prompts or many retrieved documents are resent on every call.`,
      recommendation: `Summarize or truncate older conversation turns, retrieve fewer and shorter chunks, and cache the stable prompt prefix. Reducing input by 30% would save about ${fmtUsd0(monthlySavings)} per month.`,
      provider,
      model,
      applicationId,
      teamId: ctx.apps.get(applicationId)?.teamId ?? null,
      metrics: [
        metric("Avg input tokens / request", inPer, perReq(sum(rows, w.baseFrom, w.baseTo).input, sum(rows, w.baseFrom, w.baseTo)), "tokens"),
        { label: "Input : output ratio", current: inPer / outPer, baseline: 0, unit: "ratio", change: null },
        { label: "Input token spend (7 days)", current: inputCost, baseline: 0, unit: "usd", change: null },
      ],
      trend: dailySeries(rows, w.trendFrom, w.curTo, () => true, (s) => perReq(s.input, s)),
      trendLabel: "Avg input tokens per request",
      trendUnit: "tokens",
      estimatedImpactUsd: Math.round(monthlySavings),
      impactKind: "savings",
      windowStart: w.curFrom,
      windowEnd: w.curTo,
    });
  }
  return out;
}

// ── high_cost_model ──────────────────────────────────────────

export function highCostModels(ctx: RuleContext): InsightDraft[] {
  const curTo = addDays(ctx.today, -1);
  const from = addDays(curTo, -29);
  const out: InsightDraft[] = [];
  for (const [key, rows] of groups(ctx.rows, (r) => (r.applicationId ? `${r.provider}|${r.model}|${r.applicationId}` : null))) {
    const [provider, model, applicationId] = key.split("|") as [string, string, string];
    const cur = sum(rows, from, curTo);
    if (cur.requests < 1000 || cur.cost < 100) continue;
    const outPer = perReq(cur.output, cur);
    if (outPer > 600) continue; // short outputs → likely simpler tasks (classification, extraction, routing)
    const alt = cheaperAlternatives(provider, model)[0];
    if (!alt) continue;
    const cached = 0;
    const altCost = (cur.input / 1e6) * alt.inputPer1M + (cur.output / 1e6) * alt.outputPer1M + cached;
    const savings30 = (cur.cost - altCost) * 0.5; // assume half of traffic can move
    if (savings30 < 50) continue;
    const app = appName(ctx, applicationId);
    out.push({
      type: "high_cost_model",
      subject: key,
      severity: "INFO",
      title: `Route short ${app} requests to ${prettyModel(alt.model)}`,
      summary: `${prettyModel(model)} averages ${Math.round(outPer)} output tokens per request here.`,
      whatHappened: `${app} spent ${fmtUsd0(cur.cost)} on ${prettyModel(model)} in the last 30 days across ${fmtCompact(cur.requests)} requests, with short responses (${Math.round(outPer)} output tokens on average).`,
      whyItMatters: `${prettyModel(alt.model)} lists at ${fmtUsdRate(alt.inputPer1M)}/${fmtUsdRate(alt.outputPer1M)} per 1M input/output tokens versus ${fmtUsdRate(
        resolvePrice(provider, model)?.inputPer1M ?? 0,
      )}/${fmtUsdRate(resolvePrice(provider, model)?.outputPer1M ?? 0)}. Short-output workloads such as classification, extraction and routing often don't need the larger model.`,
      cause: `All of this traffic goes to ${prettyModel(model)} regardless of task complexity.`,
      recommendation: `Test ${prettyModel(alt.model)} on a sample of these requests using your own evaluation set. ObserveMetrics measures cost and latency, not output quality — validate quality before switching. Moving half of the traffic would save about ${fmtUsd0(savings30)} per month.`,
      provider,
      model,
      applicationId,
      teamId: ctx.apps.get(applicationId)?.teamId ?? null,
      metrics: [
        { label: "Spend (30 days)", current: cur.cost, baseline: 0, unit: "usd", change: null },
        { label: `Same traffic on ${prettyModel(alt.model)} (est.)`, current: altCost, baseline: 0, unit: "usd", change: null },
        { label: "Avg output tokens / request", current: outPer, baseline: 0, unit: "tokens", change: null },
      ],
      trend: dailySeries(rows, from, curTo, () => true, (s) => s.cost),
      trendLabel: "Daily spend",
      trendUnit: "usd",
      estimatedImpactUsd: Math.round(savings30),
      impactKind: "savings",
      windowStart: from,
      windowEnd: curTo,
    });
  }
  return out;
}

const fmtUsdRate = (v: number) => "$" + (v < 1 ? v.toFixed(2) : v.toFixed(v % 1 ? 2 : 0));

// ── duplicate_requests ───────────────────────────────────────

export function duplicateRequests(ctx: RuleContext): InsightDraft[] {
  const curTo = addDays(ctx.today, -1);
  const from = addDays(curTo, -6);
  const byRoute = new Map<string, DuplicateGroup[]>();
  for (const g of ctx.duplicates) {
    const k = `${g.provider}|${g.model}|${g.applicationId}`;
    const arr = byRoute.get(k) ?? [];
    arr.push(g);
    byRoute.set(k, arr);
  }
  const out: InsightDraft[] = [];
  for (const [key, list] of byRoute) {
    const [provider, model, applicationId] = key.split("|") as [string, string, string];
    const dupRequests = list.reduce((s, g) => s + (g.count - 1), 0);
    const dupCost = list.reduce((s, g) => s + Math.max(0, g.costUsd - g.firstCostUsd), 0);
    if (dupRequests < 50 || dupCost < 2) continue;
    const monthly = (dupCost / 7) * 30;
    const app = appName(ctx, applicationId);
    const top = [...list].sort((a, b) => b.count - a.count)[0]!;
    out.push({
      type: "duplicate_requests",
      subject: key,
      severity: "INFO",
      title: `${fmtCompact(dupRequests)} duplicate prompts in ${app}`,
      summary: `Identical prompts were sent to ${prettyModel(model)} repeatedly in the last 7 days.`,
      whatHappened: `${app} sent ${fmtCompact(dupRequests)} requests whose prompt hash exactly matched an earlier request in the same week, across ${list.length} distinct prompts. The most repeated prompt was sent ${top.count} times.`,
      whyItMatters: `Repeated identical prompts cost ${fmtUsd0(dupCost)} this week (about ${fmtUsd0(monthly)} per month) for answers the application already had.`,
      cause: `Frequently asked questions or retried calls reach the model without a response cache in front of it.`,
      recommendation: `Add a response cache keyed on the prompt hash (with a TTL appropriate for how often the answer changes) and deduplicate client retries with a request id.`,
      provider,
      model,
      applicationId: applicationId || null,
      teamId: applicationId ? ctx.apps.get(applicationId)?.teamId ?? null : null,
      metrics: [
        { label: "Duplicate requests (7 days)", current: dupRequests, baseline: 0, unit: "count", change: null },
        { label: "Distinct repeated prompts", current: list.length, baseline: 0, unit: "count", change: null },
        { label: "Cost of duplicates (7 days)", current: dupCost, baseline: 0, unit: "usd", change: null },
      ],
      trend: null,
      trendLabel: null,
      trendUnit: null,
      estimatedImpactUsd: Math.round(monthly),
      impactKind: "savings",
      windowStart: from,
      windowEnd: curTo,
    });
  }
  return out;
}

// ── budget_threshold ─────────────────────────────────────────

export function budgetThresholds(ctx: RuleContext): InsightDraft[] {
  const out: InsightDraft[] = [];
  const month = ctx.today.slice(0, 7);
  for (const raw of ctx.budgets) {
    // "Engineering" → "Engineering budget"; "QA budget" stays as is.
    const b = { ...raw, name: /budget$/i.test(raw.name.trim()) ? raw.name.trim().replace(/\s*budget$/i, "") : raw.name };
    if (b.amountUsd <= 0) continue;
    const pctUsed = (b.spentUsd / b.amountUsd) * 100;
    const pctProjected = (b.projectedUsd / b.amountUsd) * 100;
    const lowest = Math.min(...(b.thresholds.length ? b.thresholds : [80]));
    if (pctUsed < lowest && pctProjected < 100) continue;
    const exceeded = pctUsed >= 100;
    const over = b.projectedUsd - b.amountUsd;
    out.push({
      type: "budget_threshold",
      subject: `${b.id}|${month}`,
      severity: exceeded ? "CRITICAL" : pctUsed >= lowest ? "WARNING" : "INFO",
      title: exceeded
        ? `${b.name} budget exceeded (${Math.round(pctUsed)}%)`
        : pctUsed >= lowest
          ? `${b.name} budget at ${Math.round(pctUsed)}%`
          : `${b.name} budget projected to reach ${Math.round(pctProjected)}%`,
      summary: `${fmtUsd0(b.spentUsd)} of ${fmtUsd0(b.amountUsd)} spent this month; projected ${fmtUsd0(b.projectedUsd)}.`,
      whatHappened: `${b.targetName} has spent ${fmtUsd0(b.spentUsd)} of its ${fmtUsd0(b.amountUsd)} monthly budget (${Math.round(pctUsed)}%).`,
      whyItMatters:
        over > 0
          ? `At the current daily run-rate it will finish the month around ${fmtUsd0(b.projectedUsd)} — ${fmtUsd0(over)} over budget.`
          : `It is on track to stay within budget, finishing near ${fmtUsd0(b.projectedUsd)}.`,
      cause: `Month-to-date spend plus the trailing 7-day daily average for the remaining days.`,
      recommendation:
        over > 0
          ? `Review the largest cost drivers for ${b.targetName} and the open optimization insights, or adjust the budget if the increase is planned.`
          : `No action needed yet; ObserveMetrics will alert again at the next threshold.`,
      teamId: b.teamId,
      applicationId: b.applicationId,
      metrics: [
        { label: "Spent this month", current: b.spentUsd, baseline: b.amountUsd, unit: "usd", change: null },
        { label: "Projected month-end", current: b.projectedUsd, baseline: b.amountUsd, unit: "usd", change: null },
        { label: "Budget used", current: pctUsed, baseline: 100, unit: "pct", change: null },
      ],
      trend: null,
      trendLabel: null,
      trendUnit: null,
      estimatedImpactUsd: over > 0 ? Math.round(over) : null,
      impactKind: "risk",
      windowStart: month + "-01",
      windowEnd: addDays(ctx.today, -1),
    });
  }
  return out;
}

/** Run every rule. Order matters only for usage_spike de-duplication. */
export function runRules(ctx: RuleContext): InsightDraft[] {
  const anomalies = costAnomalies(ctx);
  const coveredTeams = new Set(anomalies.map((a) => a.teamId).filter((t): t is string => !!t));
  return [
    ...anomalies,
    ...usageSpikes(ctx, coveredTeams),
    ...latencyRegressions(ctx),
    ...errorSpikes(ctx),
    ...providerOutages(ctx),
    ...oversizedContext(ctx),
    ...highCostModels(ctx),
    ...duplicateRequests(ctx),
    ...budgetThresholds(ctx),
  ];
}
