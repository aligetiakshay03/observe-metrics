/**
 * OpenAI usage integration (Usage API).
 * Docs: https://platform.openai.com/docs/api-reference/usage
 */
import type { AdapterContext, NormalizedUsage, ProviderAdapter } from "./types";

export const OpenAIAdapter: ProviderAdapter = {
  label: "OpenAI",
  keyHint: "OpenAI dashboard, API keys (sk-...). Usage API needs a project admin key.",

  async verify(apiKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: "Bearer " + apiKey },
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: "OpenAI returned " + res.status };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async fetchUsage(ctx: AdapterContext): Promise<NormalizedUsage[]> {
    const out: NormalizedUsage[] = [];
    let page: string | null = null;

    for (let guard = 0; guard < 20; guard++) {
      const params = new URLSearchParams({
        start_time: String(Math.floor(ctx.since.getTime() / 1000)),
        end_time: String(Math.floor(ctx.until.getTime() / 1000)),
        bucket_width: "1d",
        limit: "100",
      });
      if (page) params.set("page", page);

      const res = await fetch("https://api.openai.com/v1/usage?" + params.toString(), {
        headers: { Authorization: "Bearer " + ctx.apiKey },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error("OpenAI usage API " + res.status + ": " + body);
      }
      const json = (await res.json()) as {
        data?: {
          start_time: number;
          results?: {
            input_tokens?: number;
            output_tokens?: number;
            input_tokens_details?: { cached_tokens?: number };
          }[];
        }[];
        next_page?: string | null;
      };

      for (const bucket of json.data ?? []) {
        for (const r of bucket.results ?? []) {
          const model = (bucket as unknown as { project_id?: string }).project_id
            ? ((bucket as unknown as { model?: string }).model ?? "unknown")
            : "unknown";
          const cached = r.input_tokens_details?.cached_tokens ?? 0;
          out.push({
            model,
            inputTokens: Math.max(0, (r.input_tokens ?? 0) - cached),
            outputTokens: r.output_tokens ?? 0,
            requests: 1,
            timestamp: new Date(bucket.start_time * 1000),
          });
        }
      }

      page = json.next_page ?? null;
      if (!page) break;
    }
    return out;
  },
};
