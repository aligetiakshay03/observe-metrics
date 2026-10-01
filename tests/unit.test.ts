import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import { __resetSecretKeysForTests, maskedDisplay, maskTail, openSecret, sealSecret } from "../src/server/secrets";
import { redact } from "../src/server/log";
import { calculateCost, cheaperAlternatives, normalizeModelId, normalizeProviderId, resolvePrice } from "../src/server/pricing/service";
import { addDays, parseFilters, previousPeriod, toDay } from "../src/server/analytics/filters";
import { passwordSchema } from "../src/server/auth/password";
import { OpenAIAdapter } from "../src/server/providers/openai";
import { AnthropicAdapter } from "../src/server/providers/anthropic";
import { GoogleAdapter } from "../src/server/providers/google";
import { providerOutages, runRules, type DayRow, type RuleContext } from "../src/server/insights/rules";
import { DEMO_TARGETS, generateDemoDataset } from "../src/server/demo/generator";
import { fmtChange, fmtCompact, fmtMs, prettyModel } from "../src/lib/format";

/**
 * Produces a legacy `0_init` ciphertext (iv:tag:ct, no AAD) sealed with the
 * dev fallback key, i.e. the shape an attacker can forge because the key is a
 * hash of a public constant.
 */
function sealWithDevKey(plaintext: string): string {
  const key = crypto.createHash("sha256").update("om-dev:" + (process.env.JWT_SECRET ?? "dev-only")).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv.toString("hex"), cipher.getAuthTag().toString("hex"), enc.toString("hex")].join(":");
}

describe("secrets", () => {
  it("round-trips and binds ciphertext to the workspace", () => {
    const sealed = sealSecret("sk-admin-abcdefghijklmnop1234", "ws_a");
    expect(sealed.ciphertext.startsWith("v1:")).toBe(true);
    expect(sealed.ciphertext).not.toContain("abcdefghijklmnop");
    expect(sealed.last4).toBe("1234");
    expect(openSecret(sealed.ciphertext, "ws_a")).toBe("sk-admin-abcdefghijklmnop1234");
    // Same ciphertext moved to another workspace must not decrypt (AAD).
    expect(() => openSecret(sealed.ciphertext, "ws_b")).toThrow();
  });

  it("uses a fresh IV per seal", () => {
    expect(sealSecret("same", "w").ciphertext).not.toBe(sealSecret("same", "w").ciphertext);
  });

  it("rejects tampered ciphertext", () => {
    const { ciphertext } = sealSecret("secret-value", "w");
    const parts = ciphertext.split(":");
    parts[4] = parts[4]!.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
    expect(() => openSecret(parts.join(":"), "w")).toThrow();
  });

  it("decrypts with the previous key during rotation", () => {
    const old = process.env.ENCRYPTION_KEY!;
    const sealed = sealSecret("rotate-me", "w");
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    process.env.ENCRYPTION_KEY_PREVIOUS = old;
    __resetSecretKeysForTests();
    expect(openSecret(sealed.ciphertext, "w")).toBe("rotate-me");
    process.env.ENCRYPTION_KEY = old;
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    __resetSecretKeysForTests();
  });

  it("masks keys and service-account JSON", () => {
    expect(maskedDisplay(maskTail("sk-ant-admin01-xyzABCD"))).toBe("••••••••••••ABCD");
    expect(maskTail(JSON.stringify({ private_key_id: "abc123ff", private_key: "-----BEGIN" }))).toBe("23ff");
  });

  it("never tries the public dev-derived key against a legacy secret in production", () => {
    const jwt = process.env.JWT_SECRET;
    const key = process.env.ENCRYPTION_KEY!;
    // A legacy 0_init secret sealed with the dev fallback key: a value an
    // attacker can derive, since the key is a hash of a public constant.
    const legacy = sealWithDevKey("sk-ant-legacy-plaintext-value");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "a-guessable-jwt-secret");
    vi.stubEnv("ENCRYPTION_KEY", "b".repeat(64));
    try {
      __resetSecretKeysForTests();
      expect(() => openSecret(legacy, "ws_a")).toThrow();
    } finally {
      if (jwt !== undefined) process.env.JWT_SECRET = jwt;
      else delete process.env.JWT_SECRET;
      process.env.ENCRYPTION_KEY = key;
      __resetSecretKeysForTests();
      vi.unstubAllEnvs();
    }
  });

  it("still reads legacy secrets in development", () => {
    const jwt = process.env.JWT_SECRET;
    const key = process.env.ENCRYPTION_KEY!;
    try {
      const legacy = sealWithDevKey("sk-ant-legacy-dev-value");
      delete process.env.ENCRYPTION_KEY;
      __resetSecretKeysForTests();
      expect(openSecret(legacy, "ws_a")).toBe("sk-ant-legacy-dev-value");
    } finally {
      if (jwt === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = jwt;
      // Restore: later tests assert on production config validation.
      process.env.ENCRYPTION_KEY = key;
      __resetSecretKeysForTests();
    }
  });
});

describe("log redaction", () => {
  it("strips provider keys, bearer tokens and ingestion keys", () => {
    const s = redact("failed with sk-ant-admin01-AAAAAAAAAAAAAAAAAAAA and Bearer abcdefghijklmnopqrstu and om_ingest_ZZZZZZZZZZZZZZZZZZZZ key AIzaSyA1234567890123456789012345");
    expect(s).not.toMatch(/sk-ant-admin01-A|abcdefghijklmnopqrstu|om_ingest_Z|AIzaSy/);
    expect(s).toContain("[REDACTED]");
  });
  it("redacts api_key style fields", () => {
    expect(redact('{"apiKey":"sk-proj-verysecretvalue123456"}')).not.toContain("verysecret");
  });
});

describe("pricing service", () => {
  it("normalizes provider model ids", () => {
    expect(normalizeModelId("models/gemini-2.5-pro")).toBe("gemini-2.5-pro");
    expect(normalizeModelId("gpt-4o-2024-08-06")).toBe("gpt-4o");
    expect(normalizeModelId("claude-sonnet-4-5-20250929")).toBe("claude-sonnet-4-5");
    expect(normalizeModelId("openai/GPT-4.1")).toBe("gpt-4.1");
    expect(normalizeModelId("codestral")).toBe("codestral-latest");
    expect(normalizeProviderId("Gemini")).toBe("google");
  });
  it("computes cost from list prices including cached input", () => {
    const r = calculateCost({ provider: "anthropic", model: "claude-sonnet-4-6", inputTokens: 1_000_000, outputTokens: 100_000 });
    expect(r.priced).toBe(true);
    expect(r.costUsd).toBeCloseTo(3 + 1.5, 6);
    const cached = calculateCost({ provider: "openai", model: "gpt-4o", inputTokens: 1_000_000, outputTokens: 0, cachedTokens: 500_000 });
    expect(cached.costUsd).toBeCloseTo(1.25 + 0.625, 6);
  });
  it("never guesses a price for unknown models", () => {
    const r = calculateCost({ provider: "openai", model: "totally-new-model", inputTokens: 1000, outputTokens: 1000 });
    expect(r).toMatchObject({ priced: false, costUsd: 0 });
  });
  it("respects effective dates", () => {
    expect(resolvePrice("openai", "gpt-5", new Date("2025-01-01"))).toBeNull();
    expect(resolvePrice("openai", "gpt-5", new Date("2026-01-01"))?.inputPer1M).toBe(1.25);
  });
  it("suggests only cheaper same-provider alternatives", () => {
    const alts = cheaperAlternatives("google", "gemini-2.5-pro");
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((a) => a.provider === "google")).toBe(true);
  });
});

describe("filters", () => {
  const now = new Date("2026-09-26T10:00:00Z");
  it("parses ranges relative to today (inclusive)", () => {
    const f = parseFilters(new URLSearchParams("range=7d"), now);
    expect(f).toMatchObject({ from: "2026-09-20", to: "2026-09-26", days: 7 });
    expect(previousPeriod(f)).toMatchObject({ from: "2026-09-13", to: "2026-09-19" });
  });
  it("accepts custom dates and rejects junk", () => {
    expect(parseFilters(new URLSearchParams("from=2026-09-01&to=2026-09-10"), now)).toMatchObject({ range: "custom", days: 10 });
    const bad = parseFilters(new URLSearchParams("from=2026-13-01&to=x&range=zzz&team=%27;drop&provider=openai,<script>"), now);
    expect(bad.range).toBe("30d");
    expect(bad.teamId).toBeNull();
    expect(bad.providers).toEqual(["openai"]);
  });
  it("adds days across month boundaries", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("password policy", () => {
  it("requires length, a letter and a number", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("onlyletterslong").success).toBe(false);
    expect(passwordSchema.safeParse("1234567890123").success).toBe(false);
    expect(passwordSchema.safeParse("G00dPassphrase").success).toBe(true);
  });
});

describe("format helpers", () => {
  it("formats compactly", () => {
    expect(fmtCompact(412_000_000)).toBe("412M");
    expect(fmtCompact(1_165_000_000)).toBe("1.17B");
    expect(fmtMs(1840)).toBe("1.84s");
    expect(fmtChange(12.44)).toBe("+12.4%");
    expect(prettyModel("claude-sonnet-4-6")).toBe("Claude Sonnet 4.6");
    expect(prettyModel("gpt-4.1-mini")).toBe("GPT-4.1 mini");
    expect(prettyModel("gemini-2.5-flash")).toBe("Gemini 2.5 Flash");
  });
});

describe("provider adapters", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes OpenAI usage + costs into daily model buckets", () => {
    const day = Date.UTC(2026, 8, 20) / 1000;
    const usage = [
      {
        data: [
          {
            start_time: day,
            results: [
              { model: "gpt-4o-2024-08-06", input_tokens: 1000, output_tokens: 200, input_cached_tokens: 100, num_model_requests: 5 },
              { model: "gpt-4o", input_tokens: 500, output_tokens: 50, num_model_requests: 2 },
            ],
          },
        ],
      },
    ];
    const costs = [{ data: [{ start_time: day, results: [{ line_item: "gpt-4o-2024-08-06, input", amount: { value: 0.01 } }, { line_item: "gpt-4o, output", amount: { value: 0.02 } }, { line_item: "fine-tuning", amount: { value: 5 } }] }] }];
    const out = OpenAIAdapter.normalizeUsage(usage, costs);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ day: "2026-09-20", model: "gpt-4o", inputTokens: 1500, outputTokens: 250, cachedTokens: 100, requests: 7 });
    expect(out[0]!.reportedCostUsd).toBeCloseTo(0.03, 6);
  });

  it("normalizes Anthropic usage (cache tokens) and cost report amounts in cents", () => {
    const usage = [
      {
        data: [
          {
            starting_at: "2026-09-20T00:00:00Z",
            results: [
              { model: "claude-sonnet-4-6", uncached_input_tokens: 800, cache_read_input_tokens: 150, cache_creation: { ephemeral_5m_input_tokens: 50 }, output_tokens: 300 },
            ],
          },
        ],
      },
    ];
    const costs = [{ data: [{ starting_at: "2026-09-20T00:00:00Z", results: [{ model: "claude-sonnet-4-6", amount: "123.5", currency: "USD" }] }] }];
    const [b] = AnthropicAdapter.normalizeUsage(usage, costs);
    expect(b).toMatchObject({ inputTokens: 1000, cachedTokens: 150, outputTokens: 300, requests: null });
    expect(b!.reportedCostUsd).toBeCloseTo(1.235, 6);
  });

  it("maps HTTP failures to safe messages without echoing the key", async () => {
    const secret = "sk-admin-SUPERSECRETVALUE123456";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`{"error":{"message":"Incorrect API key provided: ${secret}"}}`, { status: 401 })));
    const r = await OpenAIAdapter.validateCredentials(secret);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("invalid_credentials");
    expect(r.message).not.toContain("SUPERSECRET");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    expect((await AnthropicAdapter.validateCredentials("sk-ant-api-key")).code).toBe("insufficient_permissions");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 400 })));
    expect((await GoogleAdapter.validateCredentials("AIza-bad")).code).toBe("invalid_credentials");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect((await OpenAIAdapter.validateCredentials(secret)).code).toBe("network");
  });

  it("follows pagination cursors", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        const second = url.includes("page=cur2");
        return new Response(JSON.stringify({ data: [], has_more: !second, next_page: second ? null : "cur2" }), { status: 200 });
      }),
    );
    await OpenAIAdapter.fetchUsage("k", { start: new Date("2026-09-01"), end: new Date("2026-09-10") });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("group_by=model");
  });
});

describe("insight rules", () => {
  // 35 days of flat usage, then a context-size jump for one app in the last 7 days.
  function dataset(jump: number): RuleContext {
    const today = "2026-09-26";
    const rows: DayRow[] = [];
    for (let i = 35; i >= 1; i--) {
      const day = addDays(today, -i);
      const recent = i <= 7;
      const requests = 1000;
      const inPer = recent ? 5000 * jump : 5000;
      rows.push({
        day,
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        applicationId: "app1",
        teamId: "team1",
        requests,
        errors: 2,
        inputTokens: requests * inPer,
        outputTokens: requests * 500,
        costUsd: calculateCost({ provider: "anthropic", model: "claude-sonnet-4-6", inputTokens: requests * inPer, outputTokens: requests * 500 }).costUsd,
        latencyMsSum: requests * 2000,
        latencyCount: requests,
      });
    }
    return { today, rows, apps: new Map([["app1", { name: "Support Agent", teamId: "team1" }]]), teams: new Map([["team1", "Support"]]), duplicates: [], budgets: [] };
  }

  it("detects a context-driven cost anomaly with coherent evidence", () => {
    const drafts = runRules(dataset(1.4));
    const a = drafts.find((d) => d.type === "cost_anomaly");
    expect(a).toBeDefined();
    expect(a!.applicationId).toBe("app1");
    expect(a!.cause).toMatch(/input tokens per request increased \+40\.0%/);
    const ctx = a!.metrics.find((m) => m.label.startsWith("Avg input tokens"))!;
    expect(ctx.change).toBeCloseTo(40, 5);
    // Monthly impact = weekly delta / 7 × 30
    const spend = a!.metrics[0]!;
    expect(a!.estimatedImpactUsd).toBe(Math.round(((spend.current - spend.baseline) / 7) * 30));
  });

  it("stays quiet on stable usage", () => {
    expect(runRules(dataset(1)).filter((d) => d.type === "cost_anomaly" || d.type === "usage_spike")).toHaveLength(0);
  });

  it("flags budget thresholds from facts", () => {
    const ctx = dataset(1);
    ctx.budgets = [{ id: "b1", name: "Support", targetName: "Support", teamId: "team1", applicationId: null, amountUsd: 100, spentUsd: 85, projectedUsd: 120, thresholds: [80, 100] }];
    const b = runRules(ctx).find((d) => d.type === "budget_threshold")!;
    expect(b.severity).toBe("WARNING");
    expect(b.estimatedImpactUsd).toBe(20);
  });
});

describe("demo dataset", () => {
  const now = new Date("2026-09-26T09:30:00Z");
  it("is deterministic and calibrated to the headline totals", () => {
    const a = generateDemoDataset(now);
    const b = generateDemoDataset(now);
    expect(a.events.length).toBe(b.events.length);
    expect(a.totals30d.spend).toBeCloseTo(DEMO_TARGETS.spendUsd, 0);
    expect(Math.abs(a.totals30d.requests - DEMO_TARGETS.requests)).toBeLessThan(200);
    expect(a.totals30d.avgLatencyMs).toBeGreaterThan(1700);
    expect(a.totals30d.avgLatencyMs).toBeLessThan(2000);
    expect(new Set(a.events.map((e) => e.dedupeKey)).size).toBe(a.events.length);
  });
  it("keeps request, token and cost relationships coherent", () => {
    const { events } = generateDemoDataset(now);
    for (const e of events.slice(0, 2000)) {
      expect(e.errorCount).toBeLessThanOrEqual(e.requestCount);
      expect(e.inputTokens).toBeGreaterThan(0);
      expect(e.costUsd).toBeGreaterThanOrEqual(0);
    }
  });

  it("always produces a provider outage insight, whatever day it is seeded on", () => {
    // The demo pins its Mistral incident to specific days ago. A single-day
    // incident can land on a weekend, where volume is a third of a weekday and
    // falls under the provider-outage rule's 300-request significance floor —
    // so the insight would silently vanish on some dates. Sweeping a whole
    // year catches that class of calendar-dependent bug.
    for (let i = 0; i < 60; i++) {
      const at = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000 + 9 * 3600_000);
      const byKey = new Map<string, DayRow>();
      for (const e of generateDemoDataset(at).events) {
        const day = toDay(e.timestamp);
        const key = `${day}|${e.provider}|${e.model}|${e.app}|${e.team}`;
        const row = byKey.get(key) ?? {
          day,
          provider: e.provider,
          model: e.model,
          applicationId: e.app,
          teamId: e.team,
          requests: 0,
          errors: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMsSum: 0,
          latencyCount: 0,
        };
        row.requests += e.requestCount;
        row.errors += e.errorCount;
        byKey.set(key, row);
      }
      const ctx: RuleContext = {
        today: toDay(at),
        rows: [...byKey.values()],
        apps: new Map(),
        teams: new Map(),
        duplicates: [],
        budgets: [],
      };
      expect(providerOutages(ctx), `no provider outage on ${toDay(at)}`).not.toHaveLength(0);
    }
  });
});

describe("client IP for rate limiting", () => {
  const withHops = (v: string | undefined, run: () => void) => {
    const prev = process.env.TRUSTED_PROXY_HOPS;
    if (v === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = v;
    try {
      run();
    } finally {
      if (prev === undefined) delete process.env.TRUSTED_PROXY_HOPS;
      else process.env.TRUSTED_PROXY_HOPS = prev;
    }
  };

  it("uses the proxy-appended (right-most) X-Forwarded-For entry, not the spoofable left-most one", async () => {
    const { clientIp } = await import("../src/server/http");
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.9" } });
    expect(clientIp(req)).toBe("203.0.113.9");
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "198.51.100.7" } }))).toBe("198.51.100.7");
  });

  it("skips one entry per configured proxy for multi-proxy deployments", async () => {
    const { clientIp } = await import("../src/server/http");
    // Each proxy appends the address of whoever talked to it, so a chain of
    // N+1 entries for N proxies means the left-most is client-supplied and the
    // real client is the second entry.
    const two = new Request("http://x", { headers: { "x-forwarded-for": "6.6.6.6, 1.2.3.4, 10.0.0.1" } });
    withHops("2", () => expect(clientIp(two)).toBe("1.2.3.4"));
    withHops("1", () => expect(clientIp(two)).toBe("10.0.0.1"));
    const three = new Request("http://x", { headers: { "x-forwarded-for": "6.6.6.6, 1.2.3.4, 10.0.0.1, 10.0.0.2" } });
    withHops("3", () => expect(clientIp(three)).toBe("1.2.3.4"));
  });

  it("never falls back to the spoofable left-most entry when the hop count is unusable", async () => {
    const { clientIp } = await import("../src/server/http");
    const req = new Request("http://x", { headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9" } });
    for (const bad of ["abc", "0", "-2", "1.5", "1e9", "  ", ""]) {
      withHops(bad, () => {
        // Garbage config must degrade to the safe (right-most) entry, not the
        // attacker-controlled left-most one.
        expect(clientIp(req)).toBe("203.0.113.9");
      });
    }
  });

  it("falls back to the left-most entry when the chain is shorter than the hop count", async () => {
    const { clientIp } = await import("../src/server/http");
    const req = new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.9" } });
    withHops("3", () => expect(clientIp(req)).toBe("203.0.113.9"));
  });

  it("validates the hop count in production config", async () => {
    const { parseTrustedProxyHops } = await import("../src/server/env");
    expect(parseTrustedProxyHops(undefined)).toBeNull();
    expect(parseTrustedProxyHops("")).toBeNull();
    expect(parseTrustedProxyHops("abc")).toBeNull();
    expect(parseTrustedProxyHops("0")).toBeNull();
    expect(parseTrustedProxyHops("2.5")).toBeNull();
    expect(parseTrustedProxyHops("11")).toBeNull();
    expect(parseTrustedProxyHops("1")).toBe(1);
    expect(parseTrustedProxyHops("2")).toBe(2);
  });

  it("refuses to serve in production when the hop count is missing or unusable", async () => {
    const { assertProductionConfig } = await import("../src/server/env");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://om.example.com");
    vi.stubEnv("CRON_SECRET", "a-sufficiently-long-cron-secret");
    vi.stubEnv("REDIS_URL", "redis://redis:56379");
    try {
      for (const bad of [undefined, "abc", "0", "1.5"]) {
        vi.stubEnv("TRUSTED_PROXY_HOPS", bad);
        expect(() => assertProductionConfig()).toThrow(/TRUSTED_PROXY_HOPS/);
      }
      for (const good of ["1", "2", "10"]) {
        vi.stubEnv("TRUSTED_PROXY_HOPS", good);
        expect(() => assertProductionConfig()).not.toThrow();
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("requires REDIS_URL in production, where per-process rate limits are bypassable", async () => {
    const { assertProductionConfig } = await import("../src/server/env");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://om.example.com");
    vi.stubEnv("CRON_SECRET", "a-sufficiently-long-cron-secret");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    try {
      vi.stubEnv("REDIS_URL", undefined);
      expect(() => assertProductionConfig()).toThrow(/REDIS_URL/);
      vi.stubEnv("REDIS_URL", "");
      expect(() => assertProductionConfig()).toThrow(/REDIS_URL/);
      vi.stubEnv("REDIS_URL", "redis://redis:56379");
      expect(() => assertProductionConfig()).not.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects oversized JSON bodies", async () => {
    const { parseBody, ApiError } = await import("../src/server/http");
    const { z } = await import("zod");
    const big = new Request("http://x", { method: "POST", body: JSON.stringify({ a: "x".repeat(1_100_000) }) });
    await expect(parseBody(big, z.object({ a: z.string() }))).rejects.toBeInstanceOf(ApiError);
  });

  it("stops reading a chunked body with no Content-Length once it passes the cap", async () => {
    const { parseBody, ApiError } = await import("../src/server/http");
    const { z } = await import("zod");
    // A ReadableStream body has no content-length, so only the streaming cap
    // can catch it. Infinte stream: the reader must abort rather than buffer.
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(64 * 1024));
      },
    });
    const chunked = new Request("http://x", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect(chunked.headers.get("content-length")).toBeNull();
    await expect(parseBody(chunked, z.object({ a: z.string() }))).rejects.toBeInstanceOf(ApiError);
  });
});
