/**
 * ModelPricingService — every calculated cost in the product goes through
 * here. Components never hard-code prices.
 */
import { MODEL_ALIASES, PRICE_CATALOG, type PriceEntry } from "./catalog";

/**
 * Canonicalize a model id reported by a provider or SDK:
 *   "models/gemini-2.5-pro"        → "gemini-2.5-pro"
 *   "gpt-4o-2024-08-06"            → "gpt-4o"
 *   "claude-sonnet-4-5-20250929"   → "claude-sonnet-4-5"
 *   "openai/gpt-4.1"               → "gpt-4.1"
 */
export function normalizeModelId(model: string): string {
  let m = model.trim().toLowerCase();
  m = m.replace(/^models\//, "");
  if (m.includes("/")) m = m.split("/").pop()!;
  m = m.replace(/-\d{4}-\d{2}-\d{2}$/, "").replace(/-\d{8}$/, "").replace(/@\d{8}$/, "");
  return MODEL_ALIASES[m] ?? m;
}

export function normalizeProviderId(provider: string): string {
  const p = provider.trim().toLowerCase();
  if (p === "gemini" || p === "google-gemini" || p === "vertex") return "google";
  if (p === "claude") return "anthropic";
  return p.replace(/[^a-z0-9_-]/g, "").slice(0, 40) || "unknown";
}

export function resolvePrice(provider: string, model: string, at: Date = new Date()): PriceEntry | null {
  const p = normalizeProviderId(provider);
  const m = normalizeModelId(model);
  const day = at.toISOString().slice(0, 10);
  const candidates = PRICE_CATALOG.filter(
    (e) => e.provider === p && e.model === m && e.effectiveFrom <= day && (!e.effectiveTo || day < e.effectiveTo),
  );
  if (candidates.length) return candidates.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]!;
  // Longest-prefix fallback for versioned ids (e.g. "gpt-4.1-2025-04-14-ft").
  const prefix = PRICE_CATALOG.filter((e) => e.provider === p && m.startsWith(e.model + "-") && e.effectiveFrom <= day)
    .sort((a, b) => b.model.length - a.model.length)[0];
  return prefix ?? null;
}

export interface CostInput {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Portion of inputTokens served from cache (billed at the cached rate). */
  cachedTokens?: number;
  at?: Date;
}

export interface CostResult {
  costUsd: number;
  priced: boolean;
  price: PriceEntry | null;
}

export function calculateCost(input: CostInput): CostResult {
  const price = resolvePrice(input.provider, input.model, input.at);
  if (!price) return { costUsd: 0, priced: false, price: null };
  const cached = Math.min(Math.max(0, input.cachedTokens ?? 0), Math.max(0, input.inputTokens));
  const uncached = Math.max(0, input.inputTokens - cached);
  const cachedRate = price.cachedInputPer1M ?? price.inputPer1M;
  const costUsd =
    (uncached / 1e6) * price.inputPer1M + (cached / 1e6) * cachedRate + (Math.max(0, input.outputTokens) / 1e6) * price.outputPer1M;
  return { costUsd: Math.round(costUsd * 1e8) / 1e8, priced: true, price };
}

/** Cheaper same-provider alternatives, used by the high_cost_model rule. */
export function cheaperAlternatives(provider: string, model: string, at: Date = new Date()): PriceEntry[] {
  const current = resolvePrice(provider, model, at);
  if (!current) return [];
  const blended = (e: PriceEntry) => e.inputPer1M * 0.75 + e.outputPer1M * 0.25;
  return PRICE_CATALOG.filter(
    (e) => e.provider === current.provider && e.model !== current.model && e.outputPer1M > 0 && blended(e) < blended(current) * 0.6,
  ).sort((a, b) => blended(b) - blended(a));
}
