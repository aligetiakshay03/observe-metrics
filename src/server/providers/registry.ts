import type { Provider } from "@prisma/client";
import { AnthropicAdapter } from "./anthropic";
import { GoogleAdapter } from "./google";
import { MistralAdapter } from "./mistral";
import { OpenAIAdapter } from "./openai";
import { providerIdFromEnum, type ProviderAdapter, type ProviderId } from "./types";

/**
 * Adding a provider: implement ProviderAdapter in its own module, register it
 * here, and add its enum value to prisma `Provider`. Nothing else in the UI or
 * sync pipeline is provider-specific.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ADAPTERS: Record<ProviderId, ProviderAdapter<any, any>> = {
  openai: OpenAIAdapter,
  anthropic: AnthropicAdapter,
  google: GoogleAdapter,
  mistral: MistralAdapter,
};

export const PROVIDER_IDS = Object.keys(ADAPTERS) as ProviderId[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAdapter(id: ProviderId): ProviderAdapter<any, any> {
  return ADAPTERS[id];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function adapterForEnum(p: Provider): ProviderAdapter<any, any> | null {
  const id = providerIdFromEnum(p);
  return id ? ADAPTERS[id] : null;
}

/** Public, secret-free provider metadata for the client. */
export function providerCatalog() {
  return PROVIDER_IDS.map((id) => {
    const a = ADAPTERS[id];
    return { id, label: a.label, credential: a.credential, capabilities: a.capabilities, usageNote: a.usageNote ?? null };
  });
}
