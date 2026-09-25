/**
 * Token pricing table (USD per 1M tokens: [input, output]) and cost
 * computation for ingested usage. Prices are approximate list prices —
 * keep them updated as providers change pricing.
 */
export const MODEL_PRICES: Record<string, [number, number]> = {
  // OpenAI
  "gpt-4o": [2.5, 10],
  "gpt-4o-2024-08-06": [2.5, 10],
  "gpt-4o-mini": [0.15, 0.6],
  "gpt-4-turbo": [10, 30],
  "gpt-4": [30, 60],
  "gpt-3.5-turbo": [0.5, 1.5],
  "o1": [15, 60],
  "o3-mini": [1.1, 4.4],
  "o3": [2, 8],
  "gpt-4.1": [2, 8],
  "gpt-4.1-mini": [0.4, 1.6],
  // Anthropic
  "claude-opus-4-1": [15, 75],
  "claude-opus-4-0": [15, 75],
  "claude-sonnet-4-5": [3, 15],
  "claude-sonnet-4-0": [3, 15],
  "claude-3-7-sonnet": [3, 15],
  "claude-3-5-sonnet": [3, 15],
  "claude-3-5-haiku": [0.8, 4],
  "claude-3-haiku": [0.25, 1.25],
  // Google Gemini
  "gemini-2.5-pro": [1.25, 10],
  "gemini-2.5-flash": [0.3, 2.5],
  "gemini-2.0-flash": [0.1, 0.4],
  "gemini-1.5-pro": [1.25, 5],
  "gemini-1.5-flash": [0.075, 0.3],
  // Mistral
  "mistral-large-2": [2, 6],
  "mistral-small-3": [0.1, 0.3],
  codestral: [0.3, 0.9],
  "open-mistral-nemo": [0.15, 0.15],
};

const FALLBACK_PRICE: [number, number] = [1, 3];

/** Normalize model names so prefixes resolve (e.g. "openai/gpt-4o"). */
export function normalizeModelName(model: string): string {
  const slash = model.split("/").pop() ?? model;
  const dot = slash.split(".")[0] === "gemini" ? slash : slash; // keep as-is
  return dot.trim().toLowerCase();
}

/** Cost in USD for the given token counts. */
export function computeCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const name = normalizeModelName(model);
  const price =
    MODEL_PRICES[name] ??
    MODEL_PRICES[name.replace(/-\d{8}$/, "")] ??
    FALLBACK_PRICE;
  return (inputTokens / 1e6) * price[0] + (outputTokens / 1e6) * price[1];
}
