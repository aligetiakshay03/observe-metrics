/**
 * Model list-price catalog (USD per 1M tokens).
 *
 * This is the single source of truth for *calculated* cost. Costs reported by
 * a provider's billing API are stored separately and always take precedence.
 * Prices change: keep entries dated with effectiveFrom/effectiveTo instead of
 * editing history, so past usage is re-priced correctly.
 *
 * `verified` notes where a price was last checked. Entries marked
 * "unverified" must be confirmed against the provider's pricing page before
 * relying on them for financial reporting.
 */

export interface PriceEntry {
  provider: string; // openai | anthropic | google | mistral
  model: string; // canonical model id (see normalizeModelId)
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M?: number;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string; // exclusive
  verified: string;
}

const ANTHROPIC_VERIFIED = "Anthropic pricing table, cached 2026-06-24";
const UNVERIFIED = "unverified — confirm on provider pricing page";

export const PRICE_CATALOG: PriceEntry[] = [
  // ── Anthropic ──
  { provider: "anthropic", model: "claude-fable-5-1", inputPer1M: 10, outputPer1M: 50, effectiveFrom: "2026-01-01", verified: ANTHROPIC_VERIFIED },
  { provider: "anthropic", model: "claude-fable-5", inputPer1M: 10, outputPer1M: 50, effectiveFrom: "2026-01-01", verified: ANTHROPIC_VERIFIED },
  { provider: "anthropic", model: "claude-opus-5-5", inputPer1M: 4, outputPer1M: 20, cachedInputPer1M: 0.2, effectiveFrom: "2026-01-01", verified: ANTHROPIC_VERIFIED },
  { provider: "anthropic", model: "claude-opus-5", inputPer1M: 5, outputPer1M: 25, effectiveFrom: "2026-01-01", verified: ANTHROPIC_VERIFIED },
  { provider: "anthropic", model: "claude-opus-4-8", inputPer1M: 5, outputPer1M: 25, effectiveFrom: "2025-01-01", verified: ANTHROPIC_VERIFIED },
  { provider: "anthropic", model: "claude-opus-4-7", inputPer1M: 5, outputPer1M: 25, effectiveFrom: "2025-01-01", verified: ANTHROPIC_VERIFIED },
  { provider: "anthropic", model: "claude-opus-4-6", inputPer1M: 5, outputPer1M: 25, effectiveFrom: "2025-01-01", verified: ANTHROPIC_VERIFIED },
  { provider: "anthropic", model: "claude-sonnet-5", inputPer1M: 2, outputPer1M: 10, effectiveFrom: "2026-01-01", verified: ANTHROPIC_VERIFIED },
  { provider: "anthropic", model: "claude-sonnet-4-6", inputPer1M: 3, outputPer1M: 15, effectiveFrom: "2025-01-01", verified: ANTHROPIC_VERIFIED },
  { provider: "anthropic", model: "claude-haiku-4-5", inputPer1M: 1, outputPer1M: 5, effectiveFrom: "2025-01-01", verified: ANTHROPIC_VERIFIED },
  { provider: "anthropic", model: "claude-sonnet-4-5", inputPer1M: 3, outputPer1M: 15, effectiveFrom: "2025-01-01", verified: UNVERIFIED },
  { provider: "anthropic", model: "claude-opus-4-1", inputPer1M: 15, outputPer1M: 75, effectiveFrom: "2025-01-01", verified: UNVERIFIED },

  // ── OpenAI ──
  { provider: "openai", model: "gpt-5", inputPer1M: 1.25, outputPer1M: 10, cachedInputPer1M: 0.125, effectiveFrom: "2025-08-01", verified: UNVERIFIED },
  { provider: "openai", model: "gpt-5-mini", inputPer1M: 0.25, outputPer1M: 2, cachedInputPer1M: 0.025, effectiveFrom: "2025-08-01", verified: UNVERIFIED },
  { provider: "openai", model: "gpt-5-nano", inputPer1M: 0.05, outputPer1M: 0.4, effectiveFrom: "2025-08-01", verified: UNVERIFIED },
  { provider: "openai", model: "gpt-4.1", inputPer1M: 2, outputPer1M: 8, cachedInputPer1M: 0.5, effectiveFrom: "2025-04-01", verified: UNVERIFIED },
  { provider: "openai", model: "gpt-4.1-mini", inputPer1M: 0.4, outputPer1M: 1.6, cachedInputPer1M: 0.1, effectiveFrom: "2025-04-01", verified: UNVERIFIED },
  { provider: "openai", model: "gpt-4o", inputPer1M: 2.5, outputPer1M: 10, cachedInputPer1M: 1.25, effectiveFrom: "2024-10-01", verified: UNVERIFIED },
  { provider: "openai", model: "gpt-4o-mini", inputPer1M: 0.15, outputPer1M: 0.6, cachedInputPer1M: 0.075, effectiveFrom: "2024-07-01", verified: UNVERIFIED },
  { provider: "openai", model: "o3", inputPer1M: 2, outputPer1M: 8, effectiveFrom: "2025-06-01", verified: UNVERIFIED },
  { provider: "openai", model: "o4-mini", inputPer1M: 1.1, outputPer1M: 4.4, effectiveFrom: "2025-04-01", verified: UNVERIFIED },
  { provider: "openai", model: "text-embedding-3-small", inputPer1M: 0.02, outputPer1M: 0, effectiveFrom: "2024-01-01", verified: UNVERIFIED },
  { provider: "openai", model: "text-embedding-3-large", inputPer1M: 0.13, outputPer1M: 0, effectiveFrom: "2024-01-01", verified: UNVERIFIED },

  // ── Google Gemini (≤200k-token prompt tier) ──
  { provider: "google", model: "gemini-2.5-pro", inputPer1M: 1.25, outputPer1M: 10, effectiveFrom: "2025-06-01", verified: UNVERIFIED },
  { provider: "google", model: "gemini-2.5-flash", inputPer1M: 0.3, outputPer1M: 2.5, effectiveFrom: "2025-06-01", verified: UNVERIFIED },
  { provider: "google", model: "gemini-2.5-flash-lite", inputPer1M: 0.1, outputPer1M: 0.4, effectiveFrom: "2025-07-01", verified: UNVERIFIED },
  { provider: "google", model: "gemini-2.0-flash", inputPer1M: 0.1, outputPer1M: 0.4, effectiveFrom: "2025-02-01", verified: UNVERIFIED },

  // ── Mistral ──
  { provider: "mistral", model: "mistral-large-latest", inputPer1M: 2, outputPer1M: 6, effectiveFrom: "2024-11-01", verified: UNVERIFIED },
  { provider: "mistral", model: "mistral-medium-latest", inputPer1M: 0.4, outputPer1M: 2, effectiveFrom: "2025-05-01", verified: UNVERIFIED },
  { provider: "mistral", model: "mistral-small-latest", inputPer1M: 0.1, outputPer1M: 0.3, effectiveFrom: "2025-01-01", verified: UNVERIFIED },
  { provider: "mistral", model: "codestral-latest", inputPer1M: 0.3, outputPer1M: 0.9, effectiveFrom: "2025-01-01", verified: UNVERIFIED },
];

/** Aliases that map provider-specific ids to catalog ids. */
export const MODEL_ALIASES: Record<string, string> = {
  "mistral-large-2": "mistral-large-latest",
  "mistral-large-2411": "mistral-large-latest",
  "mistral-medium-3": "mistral-medium-latest",
  "mistral-small-3": "mistral-small-latest",
  codestral: "codestral-latest",
  "codestral-2501": "codestral-latest",
};
