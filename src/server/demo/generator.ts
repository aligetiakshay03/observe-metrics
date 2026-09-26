/**
 * Deterministic demo dataset for "Helix Labs", a fictional company.
 *
 * The data is generated from a small behavioural model — apps, the models
 * they call, per-request token profiles, weekday seasonality and a year of
 * adoption growth — and then calibrated so the trailing 30 days total
 * exactly the headline figures below. Anomalies are injected into the raw
 * data (not into insights): the insight engine discovers them the same way
 * it would for a real workspace.
 *
 * Everything produced here is stored with source = DEMO and shown with a
 * "Demo data" label. It never mixes with a real workspace.
 */
import { calculateCost } from "../pricing/service";

export const DEMO_TARGETS = { spendUsd: 4182.5, requests: 128_902, avgLatencyMs: 1840, days: 30 };
export const DEMO_HISTORY_DAYS = 365;
export const DEMO_DOMAIN = "helixlabs.example";

export interface DemoTeam {
  slug: string;
  name: string;
}
export interface DemoApp {
  slug: string;
  name: string;
  team: string;
  description: string;
}

export const DEMO_TEAMS: DemoTeam[] = [
  { slug: "engineering", name: "Engineering" },
  { slug: "support", name: "Support" },
  { slug: "sales", name: "Sales" },
  { slug: "marketing", name: "Marketing" },
];

const USERS: Record<string, string[]> = {
  engineering: ["alex.kim", "priya.nair", "marco.rossi", "sara.lee", "dev.patel"],
  support: ["maya.chen", "jonas.berg", "lina.haddad"],
  sales: ["tom.walsh", "ana.silva"],
  marketing: ["chloe.martin", "ravi.shah"],
};

interface ModelProfile {
  provider: string;
  /** model id as a function of days-ago (models change over the year) */
  model: (d: number) => string;
  share: number; // of the app's requests
  inTok: number; // avg input tokens / request
  outTok: number; // avg output tokens / request
  latencyMs: number;
  errorRate: number;
  errorCode: string;
}

interface AppProfile extends DemoApp {
  weekdayRequests: number;
  weekendFactor: number;
  users: string[];
  models: ModelProfile[];
}

const APPS: AppProfile[] = [
  {
    slug: "customer-support-agent",
    name: "Customer Support Agent",
    team: "support",
    description: "Answers customer tickets in the help center and drafts replies for agents.",
    weekdayRequests: 1250,
    weekendFactor: 0.72,
    users: USERS.support!,
    models: [
      { provider: "anthropic", model: (d) => (d > 120 ? "claude-sonnet-4-5" : "claude-sonnet-4-6"), share: 0.74, inTok: 4800, outTok: 540, latencyMs: 2300, errorRate: 0.004, errorCode: "overloaded_error" },
      { provider: "anthropic", model: () => "claude-haiku-4-5", share: 0.2, inTok: 1600, outTok: 150, latencyMs: 760, errorRate: 0.0035, errorCode: "overloaded_error" },
      { provider: "anthropic", model: () => "claude-opus-4-8", share: 0.06, inTok: 9000, outTok: 900, latencyMs: 4600, errorRate: 0.005, errorCode: "overloaded_error" },
    ],
  },
  {
    slug: "coding-assistant",
    name: "Coding Assistant",
    team: "engineering",
    description: "IDE assistant for code review, generation and refactoring.",
    weekdayRequests: 1150,
    weekendFactor: 0.3,
    users: USERS.engineering!,
    models: [
      { provider: "anthropic", model: () => "claude-fable-5-1", share: 0.06, inTok: 11000, outTok: 2400, latencyMs: 4700, errorRate: 0.0045, errorCode: "overloaded_error" },
      { provider: "openai", model: (d) => (d > 150 ? "gpt-4o" : "gpt-4.1"), share: 0.5, inTok: 5200, outTok: 1100, latencyMs: 2150, errorRate: 0.005, errorCode: "server_error" },
      { provider: "openai", model: () => "gpt-5", share: 0.16, inTok: 9000, outTok: 4000, latencyMs: 3900, errorRate: 0.004, errorCode: "server_error" },
      { provider: "mistral", model: () => "codestral-latest", share: 0.28, inTok: 2000, outTok: 320, latencyMs: 640, errorRate: 0.005, errorCode: "server_error" },
    ],
  },
  {
    slug: "sales-assistant",
    name: "Sales Assistant",
    team: "sales",
    description: "Summarizes calls, researches accounts and drafts outreach.",
    weekdayRequests: 680,
    weekendFactor: 0.45,
    users: USERS.sales!,
    models: [
      { provider: "openai", model: () => "gpt-4o-mini", share: 0.4, inTok: 1900, outTok: 420, latencyMs: 820, errorRate: 0.004, errorCode: "server_error" },
      { provider: "mistral", model: () => "mistral-large-latest", share: 0.6, inTok: 3100, outTok: 680, latencyMs: 1480, errorRate: 0.005, errorCode: "server_error" },
    ],
  },
  {
    slug: "marketing-copilot",
    name: "Marketing Copilot",
    team: "marketing",
    description: "Generates campaign copy, subject lines and content briefs.",
    weekdayRequests: 720,
    weekendFactor: 0.3,
    users: USERS.marketing!,
    models: [
      { provider: "google", model: () => "gemini-2.5-pro", share: 0.56, inTok: 6200, outTok: 290, latencyMs: 2450, errorRate: 0.005, errorCode: "unavailable" },
      { provider: "google", model: () => "gemini-2.5-flash", share: 0.44, inTok: 2300, outTok: 950, latencyMs: 930, errorRate: 0.005, errorCode: "unavailable" },
    ],
  },
  {
    slug: "internal-knowledge-agent",
    name: "Internal Knowledge Agent",
    team: "engineering",
    description: "Answers employee questions over internal docs (RAG).",
    weekdayRequests: 820,
    weekendFactor: 0.25,
    users: [...USERS.engineering!, ...USERS.sales!, ...USERS.marketing!, ...USERS.support!],
    models: [
      { provider: "openai", model: () => "gpt-4.1", share: 0.8, inTok: 3000, outTok: 330, latencyMs: 1120, errorRate: 0.0035, errorCode: "server_error" },
      { provider: "openai", model: () => "text-embedding-3-small", share: 0.2, inTok: 420, outTok: 0, latencyMs: 140, errorRate: 0.001, errorCode: "server_error" },
    ],
  },
];

export const DEMO_APPS: DemoApp[] = APPS.map(({ slug, name, team, description }) => ({ slug, name, team, description }));

// ── deterministic randomness ──

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: string) {
  let a = hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const noise = (seed: string, amp: number) => 1 + (rng(seed)() * 2 - 1) * amp;

// ── injected anomalies (d = days ago; 0 = today) ──

const anomalies = {
  /** A conversation-history change shipped 8 days ago makes support requests carry more context. */
  supportContext: (app: string, model: string, d: number) => (app === "customer-support-agent" && model.startsWith("claude-sonnet") && d <= 7 ? 1.36 : 1),
  supportVolume: (app: string, d: number) => (app === "customer-support-agent" && d <= 7 ? 1.08 : 1),
  /** GPT-4.1 slowed down for the last 6 days. */
  latency: (model: string, d: number) => (model === "gpt-4.1" && d <= 6 ? 1.42 : 1),
  /** Mistral incident four days ago; Gemini Flash rate limiting over the last 2 days. */
  errorRate: (provider: string, model: string, d: number, base: number) => {
    if (provider === "mistral" && d === 4) return 0.091;
    if (model === "gemini-2.5-flash" && d <= 2) return 0.046;
    return base;
  },
  errorCode: (provider: string, model: string, d: number, base: string) => {
    if (provider === "mistral" && d === 4) return "service_unavailable";
    if (model === "gemini-2.5-flash" && d <= 2) return "rate_limit_exceeded";
    return base;
  },
};

export interface DemoEvent {
  timestamp: Date;
  provider: string;
  model: string;
  app: string; // slug
  team: string; // slug
  userRef: string;
  requestCount: number;
  errorCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMsSum: number;
  status: "success" | "error";
  errorCode: string | null;
  requestId: string | null;
  promptHash: string | null;
  dedupeKey: string;
}

const DAY_MS = 86_400_000;

function dayStart(now: Date, d: number): Date {
  const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - d * DAY_MS;
  return new Date(t);
}

function weekdayFactor(date: Date, weekend: number): number {
  const dow = date.getUTCDay();
  if (dow === 0 || dow === 6) return weekend;
  return [1, 1.04, 1.08, 1.07, 1.05, 0.94, 1][dow]!;
}

/** Adoption growth: ~45% of today's volume a year ago. */
const growth = (d: number) => 0.45 + 0.55 * Math.pow(1 - d / DEMO_HISTORY_DAYS, 1.25);

interface GenOptions {
  volume: number; // request multiplier
  tokens: number; // per-request token multiplier
  latency: number; // latency multiplier
}

function email(u: string) {
  return `${u}@${DEMO_DOMAIN}`;
}

function generate(now: Date, opts: GenOptions): DemoEvent[] {
  const out: DemoEvent[] = [];
  const dayFraction = (now.getTime() - dayStart(now, 0).getTime()) / DAY_MS;

  for (let d = DEMO_HISTORY_DAYS - 1; d >= 0; d--) {
    const date = dayStart(now, d);
    const partial = d === 0 ? Math.max(0.05, dayFraction) : 1;
    for (const app of APPS) {
      const appReq =
        app.weekdayRequests * opts.volume * growth(d) * weekdayFactor(date, app.weekendFactor) * anomalies.supportVolume(app.slug, d) * noise(`${app.slug}:${d}`, 0.07) * partial;
      for (const m of app.models) {
        const model = m.model(d);
        let requests = Math.round(appReq * m.share);
        if (requests <= 0) continue;
        const ctxMul = anomalies.supportContext(app.slug, model, d);
        const inPer = m.inTok * opts.tokens * ctxMul * noise(`in:${app.slug}:${model}:${d}`, 0.05);
        const outPer = m.outTok * opts.tokens * noise(`out:${app.slug}:${model}:${d}`, 0.06);
        const lat = m.latencyMs * opts.latency * anomalies.latency(model, d) * noise(`lat:${model}:${d}`, 0.05);
        const errRate = anomalies.errorRate(m.provider, model, d, m.errorRate);
        const errCode = anomalies.errorCode(m.provider, model, d, m.errorCode);

        // Individual request events (last 7 days) for request drill-down,
        // including repeated prompts in the knowledge agent.
        const individual = individualEvents(now, d, app, m, model, requests, inPer, outPer, lat, errRate, errCode, partial);
        out.push(...individual);
        requests -= individual.length;
        if (requests <= 0) continue;

        // Split the remaining volume across the app's users as daily buckets.
        const users = app.users.slice(0, Math.min(app.users.length, 3 + (hashString(app.slug) % 3)));
        const weights = users.map((u) => 0.4 + rng(`w:${app.slug}:${u}`)());
        const wsum = weights.reduce((a, b) => a + b, 0);
        let assigned = 0;
        users.forEach((u, i) => {
          const n = i === users.length - 1 ? requests - assigned : Math.round((requests * weights[i]!) / wsum);
          assigned += n;
          if (n <= 0) return;
          const inputTokens = Math.round(n * inPer);
          const outputTokens = Math.round(n * outPer);
          const errors = Math.round(n * errRate * noise(`e:${app.slug}:${model}:${d}:${u}`, 0.3));
          const ts = new Date(date.getTime() + (d === 0 ? Math.floor(dayFraction * DAY_MS * 0.5) : 12 * 3600_000));
          out.push({
            timestamp: ts,
            provider: m.provider,
            model,
            app: app.slug,
            team: app.team,
            userRef: email(u),
            requestCount: n,
            errorCount: Math.min(errors, n),
            inputTokens,
            outputTokens,
            costUsd: calculateCost({ provider: m.provider, model, inputTokens, outputTokens, at: ts }).costUsd,
            latencyMsSum: Math.round(n * lat),
            status: "success",
            errorCode: errors > 0 ? errCode : null,
            requestId: null,
            promptHash: null,
            dedupeKey: `demo:${d}:${app.slug}:${model}:${u}`,
          });
        });
      }
    }
  }
  return out;
}

const KNOWLEDGE_FAQ = 48;

function individualEvents(
  now: Date,
  d: number,
  app: AppProfile,
  m: ModelProfile,
  model: string,
  requests: number,
  inPer: number,
  outPer: number,
  lat: number,
  errRate: number,
  errCode: string,
  partial: number,
): DemoEvent[] {
  if (d > 6) return [];
  let count = 0;
  let duplicates = false;
  if (app.slug === "internal-knowledge-agent" && model === "gpt-4.1") {
    count = Math.round(170 * partial);
    duplicates = true;
  } else if (app.slug === "customer-support-agent" && model.startsWith("claude-sonnet")) count = Math.round(45 * partial);
  else if (model === "gemini-2.5-flash" || model === "gpt-4.1" || (m.provider === "mistral" && d === 4)) count = Math.round(25 * partial);
  count = Math.min(count, Math.floor(requests * 0.5));
  const out: DemoEvent[] = [];
  const r = rng(`ind:${app.slug}:${model}:${d}`);
  const date = dayStart(now, d);
  const maxOffset = d === 0 ? Math.max(1, (now.getTime() - date.getTime()) * 0.95) : DAY_MS - 60_000;
  for (let i = 0; i < count; i++) {
    const ts = new Date(date.getTime() + Math.floor(r() * maxOffset));
    const inputTokens = Math.max(50, Math.round(inPer * (0.55 + r() * 0.9)));
    const outputTokens = Math.round(outPer * (0.5 + r() * 1.0));
    const isError = r() < errRate * 1.5;
    const user = app.users[Math.floor(r() * app.users.length)]!;
    // Zipf-like popularity over a fixed FAQ set → realistic repeated prompts.
    const faq = duplicates ? Math.floor(Math.pow(r(), 2.2) * KNOWLEDGE_FAQ) : -1;
    const promptHash = duplicates ? "ph_" + hashString(`faq:${faq}`).toString(16).padStart(8, "0") + hashString(`faq2:${faq}`).toString(16).padStart(8, "0") : null;
    const requestId = `req_${hashString(`${app.slug}:${model}:${d}:${i}`).toString(36)}${hashString(`${i}:${d}`).toString(36)}`;
    out.push({
      timestamp: ts,
      provider: m.provider,
      model,
      app: app.slug,
      team: app.team,
      userRef: email(user),
      requestCount: 1,
      errorCount: isError ? 1 : 0,
      inputTokens: isError ? Math.round(inputTokens * 0.3) : inputTokens,
      outputTokens: isError ? 0 : outputTokens,
      costUsd: calculateCost({ provider: m.provider, model, inputTokens: isError ? Math.round(inputTokens * 0.3) : inputTokens, outputTokens: isError ? 0 : outputTokens, at: ts }).costUsd,
      latencyMsSum: Math.round(lat * (0.6 + r() * 0.9)),
      status: isError ? "error" : "success",
      errorCode: isError ? errCode : null,
      requestId,
      promptHash,
      dedupeKey: `demo-req:${requestId}`,
    });
  }
  return out;
}

function windowTotals(events: DemoEvent[], now: Date, days: number) {
  const from = dayStart(now, days - 1).getTime();
  let spend = 0;
  let requests = 0;
  let tokens = 0;
  let lat = 0;
  let errors = 0;
  for (const e of events) {
    if (e.timestamp.getTime() < from) continue;
    spend += e.costUsd;
    requests += e.requestCount;
    tokens += e.inputTokens + e.outputTokens;
    lat += e.latencyMsSum;
    errors += e.errorCount;
  }
  return { spend, requests, tokens, avgLatencyMs: lat / (requests || 1), errorRate: errors / (requests || 1) };
}

/**
 * Generate the full dataset, calibrated so the trailing 30 days total
 * DEMO_TARGETS.spendUsd and DEMO_TARGETS.requests.
 */
export function generateDemoDataset(now: Date = new Date()) {
  const probe = windowTotals(generate(now, { volume: 1, tokens: 1, latency: 1 }), now, DEMO_TARGETS.days);
  const volume = DEMO_TARGETS.requests / probe.requests;
  const probe2 = windowTotals(generate(now, { volume, tokens: 1, latency: 1 }), now, DEMO_TARGETS.days);
  const tokens = DEMO_TARGETS.spendUsd / probe2.spend;
  const latency = DEMO_TARGETS.avgLatencyMs / probe2.avgLatencyMs;
  const events = generate(now, { volume, tokens, latency });
  return { events, totals30d: windowTotals(events, now, DEMO_TARGETS.days), teams: DEMO_TEAMS, apps: DEMO_APPS, users: USERS };
}
