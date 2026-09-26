/**
 * Integration tests: real route handlers + real Postgres (test database).
 * Covers auth, sessions, password reset, workspace isolation (IDOR), RBAC,
 * ingestion idempotency, rollups, provider sync (mocked provider HTTP only),
 * secret handling, insights, alerts and exports.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/server/db";
import { sha256 } from "../src/server/secrets";
import { call, Client, resetDb, uniqueEmail } from "./helpers";

import * as signup from "../src/app/api/v1/auth/signup/route";
import * as signin from "../src/app/api/v1/auth/signin/route";
import * as signout from "../src/app/api/v1/auth/signout/route";
import * as forgot from "../src/app/api/v1/auth/forgot-password/route";
import * as reset from "../src/app/api/v1/auth/reset-password/route";
import * as me from "../src/app/api/v1/me/route";
import * as workspaces from "../src/app/api/v1/workspaces/route";
import * as switchWs from "../src/app/api/v1/workspaces/switch/route";
import * as providers from "../src/app/api/v1/providers/route";
import * as providerOne from "../src/app/api/v1/providers/[id]/route";
import * as providerSync from "../src/app/api/v1/providers/[id]/sync/route";
import * as ingestKeys from "../src/app/api/v1/ingestion-keys/route";
import * as events from "../src/app/api/v1/events/route";
import * as overview from "../src/app/api/v1/analytics/overview/route";
import * as budgets from "../src/app/api/v1/budgets/route";
import * as insights from "../src/app/api/v1/insights/route";
import * as insightOne from "../src/app/api/v1/insights/[id]/route";
import * as members from "../src/app/api/v1/members/route";
import * as memberOne from "../src/app/api/v1/members/[id]/route";
import * as invitesAccept from "../src/app/api/v1/invites/accept/route";
import * as exportsRoute from "../src/app/api/v1/exports/[dataset]/route";
import * as demoStart from "../src/app/api/v1/demo/start/route";
import * as alerts from "../src/app/api/v1/alerts/route";
import * as teamOne from "../src/app/api/v1/analytics/teams/[id]/route";

const PASSWORD = "C0rrectHorseBattery";

async function newUser(tag: string) {
  const c = new Client();
  const email = uniqueEmail(tag);
  const r = await call(c, signup.POST, "/api/v1/auth/signup", { body: { name: tag, email, password: PASSWORD, confirmPassword: PASSWORD } });
  expect(r.status).toBe(201);
  return { c, email };
}

async function newWorkspaceUser(tag: string) {
  const u = await newUser(tag);
  const r = await call(u.c, workspaces.POST, "/api/v1/workspaces", { body: { name: `${tag} workspace`, companyName: "Co", jobFunction: "CTO" } });
  expect(r.status).toBe(201);
  const wsId = r.json!.data.workspace.id as string;
  await prisma.workspace.update({ where: { id: wsId }, data: { onboardingCompletedAt: new Date() } });
  return { ...u, wsId };
}

beforeAll(async () => {
  await resetDb();
});

afterEach(() => vi.unstubAllGlobals());

describe("authentication", () => {
  it("signs up, stores a bcrypt hash and a hashed session", async () => {
    const { c, email } = await newUser("alice");
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
    const token = c.cookies.get("om_session")!;
    expect(token.length).toBeGreaterThan(30);
    expect(await prisma.session.count({ where: { tokenHash: sha256(token) } })).toBe(1);
    expect(await prisma.session.count({ where: { tokenHash: token } })).toBe(0);
  });

  it("rejects duplicate accounts and invalid input", async () => {
    const { email } = await newUser("dup");
    const again = await call(new Client(), signup.POST, "/api/v1/auth/signup", { body: { name: "x", email, password: PASSWORD, confirmPassword: PASSWORD } });
    expect(again.status).toBe(409);
    const mismatch = await call(new Client(), signup.POST, "/api/v1/auth/signup", { body: { name: "x", email: uniqueEmail("m"), password: PASSWORD, confirmPassword: "different1Pass" } });
    expect(mismatch.status).toBe(400);
    expect(mismatch.json!.error!.fields!.confirmPassword).toBeDefined();
  });

  it("signs in, rejects bad credentials generically, and signs out server-side", async () => {
    const { email } = await newUser("bob");
    const c = new Client();
    const bad = await call(c, signin.POST, "/api/v1/auth/signin", { body: { email, password: "wrongPassword1" } });
    expect(bad.status).toBe(401);
    const unknown = await call(c, signin.POST, "/api/v1/auth/signin", { body: { email: uniqueEmail("nobody"), password: "wrongPassword1" } });
    expect(unknown.json!.error!.message).toBe(bad.json!.error!.message);

    const ok = await call(c, signin.POST, "/api/v1/auth/signin", { body: { email, password: PASSWORD, remember: false } });
    expect(ok.status).toBe(200);
    const setCookie = ok.headers.getSetCookie().join(";");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).not.toMatch(/Max-Age/i); // not remembered → browser-session cookie
    const token = c.cookies.get("om_session")!;
    expect((await call(c, me.GET, "/api/v1/me")).status).toBe(200);

    await call(c, signout.POST, "/api/v1/auth/signout", { body: {} });
    expect(await prisma.session.count({ where: { tokenHash: sha256(token) } })).toBe(0);
    // Replaying the old cookie after logout fails.
    const replay = new Client();
    replay.cookies.set("om_session", token);
    expect((await call(replay, me.GET, "/api/v1/me")).status).toBe(401);
  });

  it("resets a password with a single-use token and revokes sessions", async () => {
    const { c, email } = await newUser("reset");
    const r = await call(new Client(), forgot.POST, "/api/v1/auth/forgot-password", { body: { email } });
    expect(r.status).toBe(200);
    // Same response for unknown emails (no enumeration).
    const r2 = await call(new Client(), forgot.POST, "/api/v1/auth/forgot-password", { body: { email: uniqueEmail("ghost") } });
    expect(r2.json).toEqual(r.json);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const row = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
    // Only the hash is stored, so we mint a known token for the test.
    const token = "known-reset-token-for-integration-test-0001";
    await prisma.passwordResetToken.update({ where: { id: row.id }, data: { tokenHash: sha256(token) } });

    const newPw = "N3wPassphraseValue";
    const ok = await call(new Client(), reset.POST, "/api/v1/auth/reset-password", { body: { token, password: newPw, confirmPassword: newPw } });
    expect(ok.status).toBe(200);
    expect((await call(c, me.GET, "/api/v1/me")).status).toBe(401); // old session revoked
    const reuse = await call(new Client(), reset.POST, "/api/v1/auth/reset-password", { body: { token, password: newPw, confirmPassword: newPw } });
    expect(reuse.status).toBe(400);
    expect((await call(new Client(), signin.POST, "/api/v1/auth/signin", { body: { email, password: newPw } })).status).toBe(200);
  });

  it("requires authentication for protected APIs", async () => {
    expect((await call(new Client(), overview.GET, "/api/v1/analytics/overview")).status).toBe(401);
  });
});

describe("workspace isolation & roles", () => {
  it("never exposes another workspace's data by id or cookie tampering", async () => {
    const a = await newWorkspaceUser("tenantA");
    const b = await newWorkspaceUser("tenantB");
    const insight = await prisma.insight.create({
      data: {
        workspaceId: a.wsId,
        type: "cost_anomaly",
        severity: "WARNING",
        title: "A's secret insight",
        summary: "s",
        whatHappened: "w",
        whyItMatters: "w",
        cause: "c",
        recommendation: "r",
        metrics: [],
        windowStart: new Date(),
        windowEnd: new Date(),
        fingerprint: "fp-a",
      },
    });
    // B requests A's insight by id → 404, not the data.
    const r = await call(b.c, insightOne.GET, `/api/v1/insights/${insight.id}`, {}, { id: insight.id });
    expect(r.status).toBe(404);
    // B can't mutate it either.
    const p = await call(b.c, insightOne.PATCH, `/api/v1/insights/${insight.id}`, { method: "PATCH", body: { status: "RESOLVED" } }, { id: insight.id });
    expect(p.status).toBe(404);
    expect((await prisma.insight.findUniqueOrThrow({ where: { id: insight.id } })).status).toBe("OPEN");
    // Switching to A's workspace is refused.
    expect((await call(b.c, switchWs.POST, "/api/v1/workspaces/switch", { body: { workspaceId: a.wsId } })).status).toBe(404);
    // Forging the workspace cookie falls back to B's own workspace.
    b.c.cookies.set("om_ws", a.wsId);
    const list = await call(b.c, insights.GET, "/api/v1/insights");
    expect(list.json!.data.insights.map((i: { id: string }) => i.id)).not.toContain(insight.id);
    // Team analytics by foreign id → 404.
    const team = await prisma.team.create({ data: { workspaceId: a.wsId, name: "A team", slug: "a-team" } });
    expect((await call(b.c, teamOne.GET, `/api/v1/analytics/teams/${team.id}`, {}, { id: team.id })).status).toBe(404);
  });

  it("enforces roles server-side", async () => {
    const owner = await newWorkspaceUser("owner");
    const viewer = await newUser("viewer");
    const inv = await call(owner.c, members.POST, "/api/v1/members", { body: { email: viewer.email, role: "VIEWER" } });
    expect(inv.status).toBe(201);
    const token = inv.json!.data.link.split("/invite/")[1];
    expect((await call(viewer.c, invitesAccept.POST, "/api/v1/invites/accept", { body: { token } })).status).toBe(200);

    // Viewer can read…
    expect((await call(viewer.c, overview.GET, "/api/v1/analytics/overview")).status).toBe(200);
    // …but not create budgets, connect providers or create ingestion keys.
    const budget = await call(viewer.c, budgets.POST, "/api/v1/budgets", { body: { name: "x", scope: "WORKSPACE", amountUsd: 100 } });
    expect(budget.status).toBe(403);
    expect((await call(viewer.c, providers.POST, "/api/v1/providers", { body: { provider: "openai", apiKey: "sk-admin-whatever-123" } })).status).toBe(403);
    expect((await call(viewer.c, ingestKeys.POST, "/api/v1/ingestion-keys", { body: { name: "k" } })).status).toBe(403);

    // An invite token can't be accepted by a different account.
    const other = await newUser("interloper");
    const inv2 = await call(owner.c, members.POST, "/api/v1/members", { body: { email: uniqueEmail("someoneelse"), role: "ADMIN" } });
    const t2 = inv2.json!.data.link.split("/invite/")[1];
    expect((await call(other.c, invitesAccept.POST, "/api/v1/invites/accept", { body: { token: t2 } })).status).toBe(403);

    // The last owner can't be demoted.
    const list = await call(owner.c, members.GET, "/api/v1/members");
    const self = list.json!.data.members.find((m: { isYou: boolean }) => m.isYou);
    const demote = await call(owner.c, memberOne.PATCH, `/api/v1/members/${self.id}`, { method: "PATCH", body: { role: "MEMBER" } }, { id: self.id });
    expect(demote.status).toBe(400);
  });
});

describe("ingestion API", () => {
  it("authenticates with a hashed key, is idempotent, and rolls up exactly", async () => {
    const u = await newWorkspaceUser("ingest");
    const k = await call(u.c, ingestKeys.POST, "/api/v1/ingestion-keys", { body: { name: "prod" } });
    expect(k.status).toBe(201);
    const raw = k.json!.data.key as string;
    expect(raw.startsWith("om_ingest_")).toBe(true);
    expect(await prisma.ingestionKey.count({ where: { keyHash: sha256(raw) } })).toBe(1);
    expect(await prisma.ingestionKey.count({ where: { keyHash: raw } })).toBe(0);

    const ing = new Client();
    const bad = await call(ing, events.POST, "/api/v1/events", { body: { provider: "openai", model: "gpt-4o", input_tokens: 1, output_tokens: 1 }, headers: { authorization: "Bearer om_ingest_wrong" } });
    expect(bad.status).toBe(401);

    const batch = {
      events: [
        { provider: "openai", model: "gpt-4o-2024-08-06", application: "support-agent", team: "support", user: "u1", input_tokens: 1200, output_tokens: 340, latency_ms: 1480, status: "success", request_id: "r-1" },
        { provider: "anthropic", model: "claude-sonnet-4-6", application: "support-agent", team: "support", input_tokens: 2000, output_tokens: 100, latency_ms: 2000, status: "error", error_code: "429", request_id: "r-2" },
      ],
    };
    const first = await call(ing, events.POST, "/api/v1/events", { body: batch, headers: { authorization: `Bearer ${raw}` } });
    expect(first.status).toBe(202);
    expect(first.json!.data).toEqual({ accepted: 2, duplicates: 0 });
    // Retrying the same request ids is a no-op.
    const retry = await call(ing, events.POST, "/api/v1/events", { body: batch, headers: { authorization: `Bearer ${raw}` } });
    expect(retry.json!.data).toEqual({ accepted: 0, duplicates: 2 });

    const daily = await prisma.dailyUsage.findMany({ where: { workspaceId: u.wsId } });
    const req = daily.reduce((s, d) => s + d.requests, 0);
    const errs = daily.reduce((s, d) => s + d.errors, 0);
    expect(req).toBe(2);
    expect(errs).toBe(1);
    const gpt = daily.find((d) => d.model === "gpt-4o")!;
    expect(Number(gpt.inputTokens)).toBe(1200);
    expect(gpt.costUsd).toBeCloseTo((1200 / 1e6) * 2.5 + (340 / 1e6) * 10, 8);
    expect(gpt.latencyMsSum / gpt.latencyCount).toBe(1480);
    expect(await prisma.application.count({ where: { workspaceId: u.wsId, slug: "support-agent" } })).toBe(1);

    const ov = await call(u.c, overview.GET, "/api/v1/analytics/overview?range=7d");
    expect(ov.json!.data.kpis.requests.value).toBe(2);
    expect(ov.json!.data.kpis.errorRate.value).toBeCloseTo(0.5);
    expect(ov.json!.data.basis).toBe("calculated");

    const invalid = await call(ing, events.POST, "/api/v1/events", { body: { provider: "openai", model: "x", input_tokens: -5, output_tokens: 1, extra: 1 }, headers: { authorization: `Bearer ${raw}` } });
    expect(invalid.status).toBe(400);
  });
});

describe("provider connections & sync", () => {
  const ADMIN_KEY = "sk-admin-TESTKEYVALUE-0123456789abcd";

  function mockOpenAI(dayUnix: number, inputTokens: number) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const auth = (init?.headers as Record<string, string>)?.Authorization;
        if (auth !== `Bearer ${ADMIN_KEY}`) return new Response("{}", { status: 401 });
        if (url.includes("/organization/costs")) {
          return new Response(JSON.stringify({ data: [{ start_time: dayUnix, results: [{ line_item: "gpt-4o, input", amount: { value: 1.5 } }] }], has_more: false }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ data: [{ start_time: dayUnix, results: [{ model: "gpt-4o", input_tokens: inputTokens, output_tokens: 1000, num_model_requests: 40 }] }], has_more: false }),
          { status: 200 },
        );
      }),
    );
  }

  it("validates, stores the key sealed, never returns it, and syncs idempotently", async () => {
    const u = await newWorkspaceUser("sync");
    const day = Math.floor(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - 1) / 1000);

    // A rejected key is not stored and not echoed.
    mockOpenAI(day, 1);
    const rejected = await call(u.c, providers.POST, "/api/v1/providers", { body: { provider: "openai", apiKey: "sk-admin-wrongwrongwrong" } });
    expect(rejected.status).toBe(422);
    expect(rejected.text).not.toContain("wrongwrong");
    expect(await prisma.providerConnection.count({ where: { workspaceId: u.wsId } })).toBe(0);

    mockOpenAI(day, 100_000);
    const created = await call(u.c, providers.POST, "/api/v1/providers", { body: { provider: "openai", apiKey: ADMIN_KEY } });
    expect(created.status).toBe(201);
    expect(created.text).not.toContain("TESTKEYVALUE");
    expect(created.json!.data.connection.maskedKey).toBe("••••••••••••abcd");
    const row = await prisma.providerConnection.findFirstOrThrow({ where: { workspaceId: u.wsId } });
    expect(row.apiKeyCiphertext).not.toContain("TESTKEYVALUE");

    const list = await call(u.c, providers.GET, "/api/v1/providers");
    expect(list.text).not.toContain("TESTKEYVALUE");
    expect(list.text).not.toContain(row.apiKeyCiphertext);

    const s1 = await call(u.c, providerSync.POST, `/api/v1/providers/${row.id}/sync`, { body: {} }, { id: row.id });
    expect(s1.status).toBe(200);
    expect(s1.json!.data.outcome.status).toBe("SUCCESS");
    const afterFirst = await prisma.dailyUsage.findMany({ where: { workspaceId: u.wsId } });
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]!.requests).toBe(40);
    expect(afterFirst[0]!.costUsd).toBeCloseTo(1.5); // provider-reported cost wins
    expect(afterFirst[0]!.reportedCostUsd).toBeCloseTo(1.5);

    // Re-sync with revised provider numbers replaces (never double counts).
    mockOpenAI(day, 120_000);
    await prisma.providerConnection.update({ where: { id: row.id }, data: { lastSyncedAt: new Date() } });
    await call(u.c, providerSync.POST, `/api/v1/providers/${row.id}/sync`, { body: {} }, { id: row.id });
    const afterSecond = await prisma.dailyUsage.findMany({ where: { workspaceId: u.wsId } });
    expect(afterSecond).toHaveLength(1);
    expect(Number(afterSecond[0]!.inputTokens)).toBe(120_000);
    expect(afterSecond[0]!.requests).toBe(40);
  });

  it("records sync failures as alerts without leaking the key", async () => {
    const u = await newWorkspaceUser("syncfail");
    const day = Math.floor(Date.now() / 1000) - 86400;
    mockOpenAI(day, 10);
    const created = await call(u.c, providers.POST, "/api/v1/providers", { body: { provider: "openai", apiKey: ADMIN_KEY } });
    const id = created.json!.data.connection.id;
    // Key revoked at the provider.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`{"error":"Incorrect API key ${ADMIN_KEY}"}`, { status: 401 })));
    const s = await call(u.c, providerSync.POST, `/api/v1/providers/${id}/sync`, { body: {} }, { id });
    expect(s.json!.data.outcome.status).toBe("FAILED");
    const conn = await prisma.providerConnection.findUniqueOrThrow({ where: { id } });
    expect(conn.status).toBe("ERROR");
    expect(conn.lastSyncError).not.toContain("TESTKEYVALUE");
    const al = await call(u.c, alerts.GET, "/api/v1/alerts");
    expect(al.json!.data.alerts.some((a: { category: string }) => a.category === "PROVIDER_SYNC")).toBe(true);
    expect(al.text).not.toContain("TESTKEYVALUE");
    // Disconnect deletes the stored credential.
    const del = await call(u.c, providerOne.DELETE, `/api/v1/providers/${id}`, { method: "DELETE" }, { id });
    expect(del.status).toBe(200);
    expect(await prisma.providerConnection.count({ where: { id } })).toBe(0);
  });
});

describe("demo workspace, insights and exports", () => {
  it("creates a labelled demo workspace whose insights come from the data", async () => {
    const u = await newWorkspaceUser("demo");
    const r = await call(u.c, demoStart.POST, "/api/v1/demo/start", { body: {} });
    expect(r.status).toBe(200);
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: r.json!.data.workspaceId } });
    expect(ws.isDemo).toBe(true);

    const ov = await call(u.c, overview.GET, "/api/v1/analytics/overview?range=30d");
    expect(ov.json!.data.basis).toBe("demo");
    expect(ov.json!.data.kpis.spend.value).toBeCloseTo(4182.5, 0);
    const sumProviders = ov.json!.data.byProvider.reduce((s: number, p: { costUsd: number }) => s + p.costUsd, 0);
    expect(sumProviders).toBeCloseTo(ov.json!.data.kpis.spend.value, 0);

    const ins = await call(u.c, insights.GET, "/api/v1/insights");
    const types = new Set(ins.json!.data.insights.map((i: { type: string }) => i.type));
    for (const t of ["cost_anomaly", "latency_regression", "error_spike", "provider_outage", "oversized_context", "duplicate_requests", "budget_threshold"]) expect(types).toContain(t);
    const anomaly = ins.json!.data.insights.find((i: { type: string }) => i.type === "cost_anomaly");
    const detail = await call(u.c, insightOne.GET, `/api/v1/insights/${anomaly.id}`, {}, { id: anomaly.id });
    expect(detail.json!.data.metrics.length).toBeGreaterThan(2);
    expect(detail.json!.data.trend.length).toBeGreaterThan(7);
    expect(detail.json!.data.relatedRequestsQuery).toContain("app=");

    // Real credentials can't be attached to the demo workspace.
    const conn = await call(u.c, providers.POST, "/api/v1/providers", { body: { provider: "openai", apiKey: "sk-admin-anything-12345" } });
    expect(conn.status).toBe(403);
  });

  it("exports CSV with formula-injection protection", async () => {
    const u = await newWorkspaceUser("export");
    const team = await prisma.team.create({ data: { workspaceId: u.wsId, name: "=HYPERLINK(\"http://x\")", slug: "evil" } });
    const today = new Date();
    await prisma.dailyUsage.create({
      data: { workspaceId: u.wsId, day: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())), provider: "openai", model: "gpt-4o", teamId: team.id, requests: 3, inputTokens: 10n, outputTokens: 5n, costUsd: 0.5 },
    });
    const r = await call(u.c, exportsRoute.GET, "/api/v1/exports/teams?range=7d", {}, { dataset: "teams" });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    expect(r.text).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect((await call(u.c, exportsRoute.GET, "/api/v1/exports/nope", {}, { dataset: "nope" })).status).toBe(404);
  });
});
