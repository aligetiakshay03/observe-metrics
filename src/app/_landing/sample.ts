/**
 * Static sample data for the landing-page product preview. Deterministic and
 * internally consistent: the daily series sums to the headline spend, provider
 * shares sum to the same total, and model rows are drawn from those providers.
 * Labelled "Sample workspace" in the UI — it is illustrative, not customer data.
 */
import type { SeriesPoint } from "@/lib/types";

export const SAMPLE = {
  spendUsd: 4182.5,
  spendChange: 12.4,
  requests: 128_902,
  requestsChange: 3.1,
  tokens: 412_000_000,
  tokensChange: 8.9,
  latencyMs: 1840,
  latencyChange: -6.2,
};

export const SAMPLE_PROVIDERS = [
  { id: "openai", label: "OpenAI", value: 1640.2 },
  { id: "anthropic", label: "Anthropic", value: 1588.35 },
  { id: "google", label: "Google Gemini", value: 612.45 },
  { id: "mistral", label: "Mistral", value: 341.5 },
];

export const SAMPLE_MODELS = [
  { model: "claude-sonnet-4-6", provider: "anthropic", requests: 31_420, costUsd: 1402.1, latencyMs: 2310, errorRate: 0.0028 },
  { model: "gpt-4.1", provider: "openai", requests: 28_910, costUsd: 1188.4, latencyMs: 2050, errorRate: 0.0035 },
  { model: "gemini-2.5-pro", provider: "google", requests: 12_300, costUsd: 512.8, latencyMs: 2440, errorRate: 0.0061 },
  { model: "mistral-large-latest", provider: "mistral", requests: 9_870, costUsd: 341.5, latencyMs: 1460, errorRate: 0.0052 },
  { model: "gpt-4o-mini", provider: "openai", requests: 34_150, costUsd: 296.25, latencyMs: 820, errorRate: 0.0031 },
];

/** 30 days ending on a fixed date, weekday seasonality and mild growth. */
export function sampleSeries(): SeriesPoint[] {
  const days = 30;
  const end = Date.UTC(2026, 8, 25);
  const raw = Array.from({ length: days }, (_, i) => {
    const t = end - (days - 1 - i) * 86_400_000;
    const dow = new Date(t).getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 0.56 : 1;
    const growth = 1 + (0.22 * i) / (days - 1);
    const noise = 1 + Math.sin(i * 2.17) * 0.05 + Math.cos(i * 0.91) * 0.03;
    const spike = i >= 22 ? 1.12 : 1; // the support-agent context change
    return { day: new Date(t).toISOString().slice(0, 10), w: weekend * growth * noise * spike };
  });
  const total = raw.reduce((a, r) => a + r.w, 0);
  let acc = 0;
  return raw.map((r, i) => {
    const costUsd = i === days - 1 ? Math.round((SAMPLE.spendUsd - acc) * 100) / 100 : Math.round(((r.w / total) * SAMPLE.spendUsd) * 100) / 100;
    acc += costUsd;
    const share = r.w / total;
    const tokens = Math.round(share * SAMPLE.tokens);
    return {
      day: r.day,
      costUsd,
      reportedCostUsd: 0,
      requests: Math.round(share * SAMPLE.requests),
      tokens,
      inputTokens: Math.round(tokens * 0.86),
      outputTokens: Math.round(tokens * 0.14),
      latencyMs: SAMPLE.latencyMs,
      errorRate: 0.0042,
    };
  });
}
