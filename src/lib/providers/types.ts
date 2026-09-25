import type { Provider } from "@prisma/client";

export interface NormalizedUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  team?: string | null;
  timestamp: Date;
}

export interface AdapterContext {
  /** Decrypted API key — only held in memory during a sync run. */
  apiKey: string;
  /** Only pull usage on/after this instant. */
  since: Date;
  until: Date;
}

export interface ProviderAdapter {
  /** Human-readable name shown in the UI. */
  readonly label: string;
  /** Where to obtain the key, shown in connect dialog. */
  readonly keyHint: string;
  /** Fetch normalized usage rows for the window. */
  fetchUsage(ctx: AdapterContext): Promise<NormalizedUsage[]>;
  /** Optional connectivity check used when saving a connection. */
  verify?(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }>;
}

export function getAdapter(provider: Provider): ProviderAdapter | null {
  switch (provider) {
    case "OPENAI":
      return OpenAIAdapter;
    case "ANTHROPIC":
      return AnthropicAdapter;
    case "GOOGLE":
      return GoogleAdapter;
    case "MISTRAL":
      return MistralAdapter;
    case "DEMO":
      return DemoAdapter;
    default:
      return null;
  }
}

// Adapter implementations live in their own modules; imported here to keep
// the registry central.
import { OpenAIAdapter } from "./openai";
import { AnthropicAdapter } from "./anthropic";
import { GoogleAdapter } from "./google";
import { MistralAdapter } from "./mistral";
import { DemoAdapter } from "./demo";
