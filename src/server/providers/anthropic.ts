/**
 * Anthropic — Admin API Usage & Cost reports (Admin key: sk-ant-admin…).
 *   GET /v1/organizations/usage_report/messages  (bucket_width=1d, group_by[]=model)
 *   GET /v1/organizations/cost_report            (group_by[]=description; amounts are
 *                                                  decimal strings in cents)
 * The usage report does not include request counts.
 */
import { normalizeModelId } from "../pricing/service";
import { dayKey, providerFetch, statuspage } from "./http";
import { ProviderError, type NormalizedBucket, type ProviderAdapter, type UsageWindow } from "./types";

const BASE = "https://api.anthropic.com/v1";
const HTTP = {
  label: "Anthropic",
  permissionHint:
    "This key can't read organization usage. Create an Admin key (sk-ant-admin…) in Claude Console → Settings → Admin keys.",
};

interface UsageResult {
  model?: string | null;
  uncached_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
  output_tokens?: number;
}
interface CostResult {
  model?: string | null;
  amount?: string;
  currency?: string;
}
interface Page<R> {
  data?: { starting_at: string; ending_at?: string; results?: R[] }[];
  has_more?: boolean;
  next_page?: string | null;
}
export type AnthropicUsageRaw = Page<UsageResult>[];
export type AnthropicCostsRaw = Page<CostResult>[];

const headers = (secret: string) => ({ headers: { "x-api-key": secret, "anthropic-version": "2023-06-01" } });

async function paginate<R>(secret: string, path: string, params: [string, string][]): Promise<Page<R>[]> {
  const pages: Page<R>[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 40; i++) {
    const qs = new URLSearchParams(params);
    if (cursor) qs.set("page", cursor);
    const page: Page<R> = await providerFetch<Page<R>>(`${BASE}${path}?${qs}`, headers(secret), HTTP);
    pages.push(page);
    cursor = page.has_more ? page.next_page ?? null : null;
    if (!cursor) break;
  }
  return pages;
}

export const AnthropicAdapter: ProviderAdapter<AnthropicUsageRaw, AnthropicCostsRaw> = {
  id: "anthropic",
  label: "Anthropic",
  credential: {
    label: "Admin API key",
    placeholder: "sk-ant-admin…",
    help: "Claude Console → Settings → Admin keys. Standard API keys can't read organization usage.",
    docsUrl: "https://platform.claude.com/docs/en/manage-claude/usage-cost-api",
  },
  capabilities: { usage: true, costs: true, models: true },

  async validateCredentials(secret) {
    try {
      const start = new Date(Date.now() - 2 * 86_400_000);
      start.setUTCHours(0, 0, 0, 0);
      await providerFetch(`${BASE}/organizations/usage_report/messages?starting_at=${start.toISOString()}&limit=1`, headers(secret), HTTP);
      return { ok: true, message: "Connected. This key can read usage and cost reports.", scopes: { usage: true, costs: true, models: true } };
    } catch (e) {
      if (e instanceof ProviderError) return { ok: false, code: e.code, message: e.message };
      throw e;
    }
  },

  async fetchModels(secret) {
    const start = new Date(Date.now() - 30 * 86_400_000);
    start.setUTCHours(0, 0, 0, 0);
    const pages = await paginate<UsageResult>(secret, "/organizations/usage_report/messages", [
      ["starting_at", start.toISOString()],
      ["bucket_width", "1d"],
      ["group_by[]", "model"],
      ["limit", "31"],
    ]);
    const models = new Set<string>();
    for (const p of pages) for (const b of p.data ?? []) for (const r of b.results ?? []) if (r.model) models.add(normalizeModelId(r.model));
    return [...models].sort();
  },

  fetchUsage(secret, w: UsageWindow) {
    return paginate<UsageResult>(secret, "/organizations/usage_report/messages", [
      ["starting_at", w.start.toISOString()],
      ["ending_at", w.end.toISOString()],
      ["bucket_width", "1d"],
      ["group_by[]", "model"],
      ["limit", "31"],
    ]);
  },

  fetchCosts(secret, w: UsageWindow) {
    return paginate<CostResult>(secret, "/organizations/cost_report", [
      ["starting_at", w.start.toISOString()],
      ["ending_at", w.end.toISOString()],
      ["group_by[]", "description"],
    ]);
  },

  normalizeUsage(usage, costs) {
    const buckets = new Map<string, NormalizedBucket>();
    for (const page of usage) {
      for (const bucket of page.data ?? []) {
        const day = dayKey(new Date(bucket.starting_at));
        for (const r of bucket.results ?? []) {
          const model = normalizeModelId(r.model || "unknown");
          const key = `${day}|${model}`;
          const b = buckets.get(key) ?? { day, model, inputTokens: 0, outputTokens: 0, cachedTokens: 0, requests: null, reportedCostUsd: null };
          const cacheRead = r.cache_read_input_tokens ?? 0;
          const cacheWrite = (r.cache_creation?.ephemeral_5m_input_tokens ?? 0) + (r.cache_creation?.ephemeral_1h_input_tokens ?? 0);
          b.inputTokens += (r.uncached_input_tokens ?? 0) + cacheRead + cacheWrite;
          b.cachedTokens += cacheRead;
          b.outputTokens += r.output_tokens ?? 0;
          buckets.set(key, b);
        }
      }
    }
    for (const page of costs) {
      for (const bucket of page.data ?? []) {
        const day = dayKey(new Date(bucket.starting_at));
        for (const r of bucket.results ?? []) {
          if (!r.model || r.amount == null) continue;
          const cents = Number(r.amount);
          if (!Number.isFinite(cents)) continue;
          const b = buckets.get(`${day}|${normalizeModelId(r.model)}`);
          if (b) b.reportedCostUsd = (b.reportedCostUsd ?? 0) + cents / 100;
        }
      }
    }
    return [...buckets.values()].filter((b) => b.inputTokens + b.outputTokens > 0);
  },

  getProviderStatus: () => statuspage("https://status.anthropic.com/api/v2/status.json"),
};
