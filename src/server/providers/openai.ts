/**
 * OpenAI — Organization Usage & Costs APIs.
 * Requires an Admin key (sk-admin-…) created under Organization settings.
 *   GET /v1/organization/usage/completions  (group_by=model, bucket_width=1d)
 *   GET /v1/organization/costs              (group_by=line_item, bucket_width=1d)
 */
import { normalizeModelId } from "../pricing/service";
import { dayKey, providerFetch, statuspage } from "./http";
import { ProviderError, type NormalizedBucket, type ProviderAdapter, type UsageWindow } from "./types";

const BASE = "https://api.openai.com/v1";
const HTTP = {
  label: "OpenAI",
  permissionHint:
    "This key can't read organization usage. Create an Admin key (sk-admin-…) in OpenAI → Organization settings → Admin keys.",
};

interface UsageResult {
  model?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  input_cached_tokens?: number;
  num_model_requests?: number;
}
interface CostResult {
  line_item?: string | null;
  amount?: { value?: number; currency?: string };
}
interface Page<R> {
  data?: { start_time: number; results?: R[] }[];
  has_more?: boolean;
  next_page?: string | null;
}
export type OpenAIUsageRaw = Page<UsageResult>[];
export type OpenAICostsRaw = Page<CostResult>[];

const auth = (secret: string) => ({ headers: { Authorization: `Bearer ${secret}` } });

async function paginate<R>(secret: string, path: string, params: Record<string, string>): Promise<Page<R>[]> {
  const pages: Page<R>[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 40; i++) {
    const qs = new URLSearchParams(params);
    if (cursor) qs.set("page", cursor);
    const page: Page<R> = await providerFetch<Page<R>>(`${BASE}${path}?${qs}`, auth(secret), HTTP);
    pages.push(page);
    cursor = page.has_more ? page.next_page ?? null : null;
    if (!cursor) break;
  }
  return pages;
}

const unix = (d: Date) => String(Math.floor(d.getTime() / 1000));

export const OpenAIAdapter: ProviderAdapter<OpenAIUsageRaw, OpenAICostsRaw> = {
  id: "openai",
  label: "OpenAI",
  credential: {
    label: "Admin API key",
    placeholder: "sk-admin-…",
    help: "Organization settings → Admin keys. Admin keys can read usage and costs; standard project keys cannot.",
    docsUrl: "https://platform.openai.com/docs/api-reference/usage",
  },
  capabilities: { usage: true, costs: true, models: true },

  async validateCredentials(secret) {
    try {
      const start = new Date(Date.now() - 86_400_000);
      await providerFetch(`${BASE}/organization/usage/completions?start_time=${unix(start)}&limit=1`, auth(secret), HTTP);
      return { ok: true, message: "Connected. This key can read usage and costs.", scopes: { usage: true, costs: true, models: true } };
    } catch (e) {
      if (e instanceof ProviderError) return { ok: false, code: e.code, message: e.message };
      throw e;
    }
  },

  async fetchModels(secret) {
    // Admin keys may not list models; derive from recent usage instead.
    const start = new Date(Date.now() - 30 * 86_400_000);
    const pages = await paginate<UsageResult>(secret, "/organization/usage/completions", {
      start_time: unix(start),
      bucket_width: "1d",
      group_by: "model",
      limit: "31",
    });
    const models = new Set<string>();
    for (const p of pages) for (const b of p.data ?? []) for (const r of b.results ?? []) if (r.model) models.add(normalizeModelId(r.model));
    return [...models].sort();
  },

  fetchUsage(secret, w: UsageWindow) {
    return paginate<UsageResult>(secret, "/organization/usage/completions", {
      start_time: unix(w.start),
      end_time: unix(w.end),
      bucket_width: "1d",
      group_by: "model",
      limit: "31",
    });
  },

  fetchCosts(secret, w: UsageWindow) {
    return paginate<CostResult>(secret, "/organization/costs", {
      start_time: unix(w.start),
      end_time: unix(w.end),
      bucket_width: "1d",
      group_by: "line_item",
      limit: "180",
    });
  },

  normalizeUsage(usage, costs) {
    const buckets = new Map<string, NormalizedBucket>();
    const get = (day: string, model: string) => {
      const key = `${day}|${model}`;
      let b = buckets.get(key);
      if (!b) {
        b = { day, model, inputTokens: 0, outputTokens: 0, cachedTokens: 0, requests: 0, reportedCostUsd: null };
        buckets.set(key, b);
      }
      return b;
    };
    for (const page of usage) {
      for (const bucket of page.data ?? []) {
        const day = dayKey(new Date(bucket.start_time * 1000));
        for (const r of bucket.results ?? []) {
          const b = get(day, normalizeModelId(r.model || "unknown"));
          b.inputTokens += r.input_tokens ?? 0;
          b.outputTokens += r.output_tokens ?? 0;
          b.cachedTokens += r.input_cached_tokens ?? 0;
          b.requests = (b.requests ?? 0) + (r.num_model_requests ?? 0);
        }
      }
    }
    // Line items look like "gpt-4o-2024-08-06, input" — attribute to the model.
    for (const page of costs) {
      for (const bucket of page.data ?? []) {
        const day = dayKey(new Date(bucket.start_time * 1000));
        for (const r of bucket.results ?? []) {
          const value = r.amount?.value;
          if (typeof value !== "number" || !r.line_item) continue;
          const model = normalizeModelId(r.line_item.split(",")[0]!);
          const key = `${day}|${model}`;
          // Only attribute costs to models we have usage for (skips fine-tuning, storage, etc.).
          const b = buckets.get(key);
          if (b) b.reportedCostUsd = (b.reportedCostUsd ?? 0) + value;
        }
      }
    }
    return [...buckets.values()].filter((b) => b.inputTokens + b.outputTokens > 0 || (b.requests ?? 0) > 0);
  },

  getProviderStatus: () => statuspage("https://status.openai.com/api/v2/status.json"),
};
