import type { Provider } from "@prisma/client";

export type ProviderId = "openai" | "anthropic" | "google" | "mistral";

export const PROVIDER_ENUM: Record<ProviderId, Provider> = {
  openai: "OPENAI",
  anthropic: "ANTHROPIC",
  google: "GOOGLE",
  mistral: "MISTRAL",
};

export function providerIdFromEnum(p: Provider): ProviderId | null {
  const entry = (Object.entries(PROVIDER_ENUM) as [ProviderId, Provider][]).find(([, v]) => v === p);
  return entry ? entry[0] : null;
}

export interface UsageWindow {
  start: Date;
  end: Date;
}

/** Provider data normalized to daily buckets per model. */
export interface NormalizedBucket {
  day: string; // YYYY-MM-DD (UTC)
  model: string;
  inputTokens: number; // includes cached input
  outputTokens: number;
  cachedTokens: number;
  requests: number | null; // null when the provider doesn't report counts
  reportedCostUsd: number | null;
}

export type ProviderErrorCode =
  | "invalid_credentials"
  | "insufficient_permissions"
  | "rate_limited"
  | "unavailable"
  | "network"
  | "unsupported"
  | "bad_response";

export class ProviderError extends Error {
  constructor(
    public code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface ValidationResult {
  ok: boolean;
  code?: ProviderErrorCode;
  message: string;
  /** What this credential can do, e.g. usage history vs models only. */
  scopes?: { usage: boolean; costs: boolean; models: boolean };
}

export interface ProviderStatus {
  indicator: "operational" | "degraded" | "outage" | "unknown";
  description: string;
  checkedAt: string;
}

export interface ProviderAdapter<RawUsage = unknown, RawCosts = unknown> {
  id: ProviderId;
  label: string;
  credential: {
    label: string;
    placeholder: string;
    help: string;
    docsUrl: string;
  };
  /** What a correctly-scoped credential lets ObserveMetrics read. */
  capabilities: { usage: boolean; costs: boolean; models: boolean };
  /** One-line explanation shown when usage history isn't available via API. */
  usageNote?: string;

  validateCredentials(secret: string): Promise<ValidationResult>;
  fetchModels(secret: string): Promise<string[]>;
  fetchUsage(secret: string, window: UsageWindow): Promise<RawUsage>;
  fetchCosts(secret: string, window: UsageWindow): Promise<RawCosts>;
  normalizeUsage(usage: RawUsage, costs: RawCosts): NormalizedBucket[];
  getProviderStatus(): Promise<ProviderStatus>;
}
