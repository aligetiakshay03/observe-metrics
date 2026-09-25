/**
 * Demo history generator — backfills 60 days of deterministic usage for a DEMO
 * connection using the normal ingest pipeline (raw records + rollups).
 */
import { ingestUsage } from "@/lib/sync";
import { computeCostUsd } from "@/lib/pricing";

const MODELS = [
  { name: "gpt-4o", provider: "DEMO" as const },
  { name: "gpt-4o-mini", provider: "DEMO" as const },
  { name: "claude-sonnet-4-5", provider: "DEMO" as const },
  { name: "gemini-2.5-pro", provider: "DEMO" as const },
  { name: "mistral-large-2", provider: "DEMO" as const },
];
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

export async function seedDemoHistory(organizationId: string, connectionId: string): Promise<void> {
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const DAYS = 60;

  for (let d = DAYS; d >= 1; d--) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - d);
    const rand = mulberry32(d);
    const isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    const trend = 1 + ((DAYS - d) / DAYS) * 0.9;
    const dowFactor = isWeekend ? 0.35 : 1;

    for (const model of MODELS) {
      if (rand() < 0.3) continue;
      const team = TEAMS[Math.floor(rand() * TEAMS.length)]!;
      const base = isWeekend ? 5_000 + rand() * 15_000 : 50_000 + rand() * 300_000;
      const inTok = Math.floor(base * trend * dowFactor);
      const outTok = Math.floor(inTok * (0.2 + rand() * 0.4));
      const requests = Math.max(1, Math.floor(inTok / 900));
      const costCents = computeCostUsd(model.name, inTok, outTok) * 100;

      await ingestUsage({
        organizationId,
        connectionId,
        provider: model.provider,
        model: model.name,
        inputTokens: inTok,
        outputTokens: outTok,
        requests,
        team,
        timestamp: day,
        costCents,
      });
    }
  }
}
