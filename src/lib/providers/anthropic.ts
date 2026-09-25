/**
 * Anthropic usage integration via the Admin API usage report
 * (requires an Admin API key: sk-ant-admin...).
 * Docs: https://docs.anthropic.com/en/api/usage-report
 */
import type { AdapterContext, NormalizedUsage, ProviderAdapter } from "./types";

export const AnthropicAdapter: ProviderAdapter = {
  label: "Anthropic",
  keyHint: "Anthropic Console, Settings, Admin API keys (sk-ant-admin...). Regular keys cannot read usage.",

  async verify(apiKey) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=2025-01-01&ending_at=2025-01-02", {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: "Anthropic returned " + res.status };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async fetchUsage(ctx: AdapterContext): Promise<NormalizedUsage[]> {
    const out: NormalizedUsage[] = [];
    let page: string | null = null;
    const pad = (d: Date) => d.toISOString().slice(0, 10);

    for (let guard = 0; guard < 20; guard++) {
      const params = new URLSearchParams({
        starting_at: pad(ctx.since),
        ending_at: pad(ctx.until),
        bucket_width: "1d",
        limit: "100",
      });
      if (page) params.set("page", page);

      const res = await fetch("https://api.anthropic.com/v1/organizations/usage_report/messages?" + params.toString(), {
        headers: { "x-api-key": ctx.apiKey, "anthropic-version": "2023-06-01" },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error("Anthropic usage report " + res.status + ": " + body);
      }
      const json = (await res.json()) as {
        data?: { model: string; token_type: string; day: string; usage: number }[];
        has_more?: boolean;
        next_page?: string | null;
      };

      for (const row of json.data ?? []) {
        const day = new Date(row.day + "T00:00:00Z");
        const existing = out.find(
          (o) => o.model === row.model && o.timestamp.getTime() === day.getTime(),
        );
        if (existing) {
          if (row.token_type === "input") existing.inputTokens += row.usage;
          else existing.outputTokens += row.usage;
        } else {
          out.push({
            model: row.model,
            inputTokens: row.token_type === "input" ? row.usage : 0,
            outputTokens: row.token_type === "output" ? row.usage : 0,
            requests: 0,
            timestamp: day,
          });
        }
      }

      page = json.has_more ? json.next_page ?? null : null;
      if (!page) break;
    }
    return out.filter((o) => o.inputTokens > 0 || o.outputTokens > 0);
  },
};
