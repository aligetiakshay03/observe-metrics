/**
 * Mistral La Plateforme usage integration (optional provider).
 */
import type { AdapterContext, NormalizedUsage, ProviderAdapter } from "./types";

export const MistralAdapter: ProviderAdapter = {
  label: "Mistral",
  keyHint: "Mistral La Plateforme console, API keys.",

  async verify(apiKey) {
    try {
      const res = await fetch("https://api.mistral.ai/v1/models", {
        headers: { Authorization: "Bearer " + apiKey },
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: "Mistral returned " + res.status };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async fetchUsage(ctx: AdapterContext): Promise<NormalizedUsage[]> {
    const url =
      "https://api.mistral.ai/v1/usage?start_date=" +
      ctx.since.toISOString().slice(0, 10) +
      "&end_date=" +
      ctx.until.toISOString().slice(0, 10);
    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + ctx.apiKey },
    });
    if (!res.ok) throw new Error("Mistral usage " + res.status);
    const json = (await res.json()) as {
      data?: {
        model: string;
        input_tokens?: number;
        output_tokens?: number;
        requests?: number;
        timestamp?: number;
      }[];
    };
    const out: NormalizedUsage[] = [];
    for (const entry of json.data ?? []) {
      out.push({
        model: entry.model,
        inputTokens: entry.input_tokens ?? 0,
        outputTokens: entry.output_tokens ?? 0,
        requests: entry.requests ?? 1,
        timestamp: entry.timestamp ? new Date(entry.timestamp * 1000) : ctx.until,
      });
    }
    return out;
  },
};
