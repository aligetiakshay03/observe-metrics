/**
 * Seed script — creates a demo organization with the DEMO provider connected
 * and 60 days of realistic usage data, so the dashboard is populated on first run.
 *
 * Run: npm run db:seed
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

const PROVIDERS = ["OPENAI", "ANTHROPIC", "GOOGLE", "MISTRAL"] as const;
type P = (typeof PROVIDERS)[number];

const MODELS: Record<P, string[]> = {
  OPENAI: ["gpt-4o", "gpt-4o-mini", "o3-mini", "gpt-4.1"],
  ANTHROPIC: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-3-5-haiku"],
  GOOGLE: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
  MISTRAL: ["mistral-large-2", "codestral"],
};

// USD per 1M tokens: [input, output]
const PRICES: Record<string, [number, number]> = {
  "gpt-4o": [2.5, 10],
  "gpt-4o-mini": [0.15, 0.6],
  "o3-mini": [1.1, 4.4],
  "gpt-4.1": [2.0, 8.0],
  "claude-sonnet-4-5": [3, 15],
  "claude-opus-4-1": [15, 75],
  "claude-3-5-haiku": [0.8, 4],
  "gemini-2.5-pro": [1.25, 10],
  "gemini-2.5-flash": [0.3, 2.5],
  "gemini-2.0-flash": [0.1, 0.4],
  "mistral-large-2": [2, 6],
  codestral: [0.3, 0.9],
};

const TEAMS = ["Engineering", "Marketing", "Support", "Data"];

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const between = (min: number, max: number): number => min + rand() * (max - min);

interface Rollup {
  inputTokens: bigint;
  outputTokens: bigint;
  costCents: number;
  requests: number;
}

async function main() {
  const email = "demo@observemetrics.dev";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Seed data already present (demo@observemetrics.dev exists) — skipping.");
    return;
  }

  console.log("Seeding demo organization…");

  const user = await prisma.user.create({
    data: {
      email,
      name: "Demo Admin",
      passwordHash: await bcrypt.hash("demo1234", 10),
    },
  });

  const org = await prisma.organization.create({
    data: {
      name: "Acme Inc",
      slug: "acme-" + crypto.randomBytes(3).toString("hex"),
      plan: "GROWTH",
    },
  });

  await prisma.membership.create({
    data: { userId: user.id, organizationId: org.id, role: "ADMIN", team: "Engineering" },
  });

  const connection = await prisma.providerConnection.create({
    data: {
      organizationId: org.id,
      provider: "DEMO",
      name: "Demo sandbox",
      // placeholder only — never used for real API calls
      apiKeyCiphertext: "seeded-demo-connection",
      keyLast4: "demo",
    },
  });

  // ── Generate 60 days of usage ──
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const DAYS = 60;

  const usageRows: {
    organizationId: string;
    connectionId: string;
    provider: P;
    model: string;
    inputTokens: bigint;
    outputTokens: bigint;
    costCents: number;
    requests: number;
    team: string;
    timestamp: Date;
  }[] = [];

  const daily = new Map<string, Rollup & { organizationId: string; day: Date; provider: P; model: string; team: string }>();
  const monthly = new Map<string, Rollup & { organizationId: string; month: Date; provider: P; model: string; team: string }>();

  for (let d = DAYS; d >= 0; d--) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - d);
    const isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    // growth trend: usage grows over time
    const trend = 1 + ((DAYS - d) / DAYS) * 0.9;
    const dowFactor = isWeekend ? 0.35 : 1;

    for (const provider of PROVIDERS) {
      const models = MODELS[provider];
      const modelCount = 1 + Math.floor(rand() * models.length);
      for (let m = 0; m < modelCount; m++) {
        const model = models[m]!;
        const team = pick(TEAMS);
        const baseTokens = isWeekend ? between(2_000, 20_000) : between(40_000, 400_000);
        const inTok = Math.floor(baseTokens * trend * dowFactor * between(0.7, 1.3));
        const outTok = Math.floor(inTok * between(0.15, 0.6));
        const price = PRICES[model] ?? [1, 3];
        const costUsd = (inTok / 1e6) * price[0] + (outTok / 1e6) * price[1];
        const requests = Math.max(1, Math.floor(inTok / between(400, 2500)));

        usageRows.push({
          organizationId: org.id,
          connectionId: connection.id,
          provider,
          model,
          inputTokens: BigInt(inTok),
          outputTokens: BigInt(outTok),
          costCents: costUsd * 100,
          requests,
          team,
          timestamp: new Date(day.getTime() + Math.floor(rand() * 20 + 2) * 3600_000),
        });

        const dayKey = day.toISOString().slice(0, 10);
        const dKey = `${dayKey}|${provider}|${model}|${team}`;
        const dr = daily.get(dKey);
        if (dr) {
          dr.inputTokens += BigInt(inTok);
          dr.outputTokens += BigInt(outTok);
          dr.costCents += costUsd * 100;
          dr.requests += requests;
        } else {
          daily.set(dKey, {
            organizationId: org.id, day, provider, model, team,
            inputTokens: BigInt(inTok), outputTokens: BigInt(outTok),
            costCents: costUsd * 100, requests,
          });
        }

        const month = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
        const mKey = `${month.getTime()}|${provider}|${model}|${team}`;
        const mr = monthly.get(mKey);
        if (mr) {
          mr.inputTokens += BigInt(inTok);
          mr.outputTokens += BigInt(outTok);
          mr.costCents += costUsd * 100;
          mr.requests += requests;
        } else {
          monthly.set(mKey, {
            organizationId: org.id, month, provider, model, team,
            inputTokens: BigInt(inTok), outputTokens: BigInt(outTok),
            costCents: costUsd * 100, requests,
          });
        }
      }
    }
  }

  // Insert in chunks to stay under parameter limits
  const CHUNK = 500;
  for (let i = 0; i < usageRows.length; i += CHUNK) {
    await prisma.usageRecord.createMany({ data: usageRows.slice(i, i + CHUNK) });
  }

  const dailyRows = Array.from(daily.values()).map((r) => ({
    organizationId: r.organizationId,
    day: r.day,
    provider: r.provider,
    model: r.model,
    team: r.team,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costCents: r.costCents,
    requests: r.requests,
  }));
  for (let i = 0; i < dailyRows.length; i += CHUNK) {
    await prisma.dailyRollup.createMany({ data: dailyRows.slice(i, i + CHUNK) });
  }

  // Re-key monthly rollups uniquely (in case two months share a model/team)
  const monthlyRows = Array.from(
    new Map(
      Array.from(monthly.entries()).map(([k, v]) => [`${k}|${v.month.getTime()}`, v]),
    ).values(),
  ).map((r) => ({
    organizationId: r.organizationId,
    month: r.month,
    provider: r.provider,
    model: r.model,
    team: r.team,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costCents: r.costCents,
    requests: r.requests,
  }));
  for (let i = 0; i < monthlyRows.length; i += CHUNK) {
    await prisma.monthlyRollup.createMany({ data: monthlyRows.slice(i, i + CHUNK) });
  }

  // Org-wide monthly budget of $500 so the Budgets page shows data
  await prisma.budget.create({
    data: { organizationId: org.id, team: null, amountCents: 500_00 },
  });

  console.log(
    `Seeded: org "${org.name}", ${usageRows.length} usage records, ` +
    `${dailyRows.length} daily rollups, ${monthlyRows.length} monthly rollups.`,
  );
  console.log(`Login with ${email} / demo1234`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
