/**
 * DEMO provider — generates deterministic pseudo-usage so the dashboard can be
 * explored end-to-end without real provider accounts. Never touches the network.
 */
import type { AdapterContext, NormalizedUsage, ProviderAdapter } from "./types";

const MODELS = ["gpt-4o", "gpt-4o-mini", "claude-sonnet-4-5", "gemini-2.5-pro", "mistral-large-2"];
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

export const DemoAdapter: ProviderAdapter = {
  label: "Demo (simulated)",
  keyHint: "No key needed — generates realistic simulated usage.",
  async verify() {
    return { ok: true };
  },
  async fetchUsage({ since, until }: AdapterContext): Promise<NormalizedUsage[]> {
    const out: NormalizedUsage[] = [];
    const dayMs = 86_400_000;
    const startDay = Math.floor(since.getTime() / dayMs);
    const endDay = Math.floor(until.getTime() / dayMs);
    const seed = startDay; // deterministic per-day generation
    const rand = mulberry32(seed);
    for (let d = startDay; d <= endDay; d++) {
      const day = new Date(d * dayMs);
      for (const model of MODELS) {
        if (rand() < 0.35) continue;
        const team = TEAMS[Math.floor(rand() * TEAMS.length)]!;
        const inTok = Math.floor(20_000 + rand() * 300_000);
        const outTok = Math.floor(inTok * (0.2 + rand() * 0.4));
        out.push({
          model,
          inputTokens: inTok,
          outputTokens: outTok,
          requests: Math.max(1, Math.floor(inTok / 900)),
          team,
          timestamp: day,
        });
      }
    }
    return out;
  },
};
