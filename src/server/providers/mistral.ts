/**
 * Mistral (La Plateforme). API keys can list models; Mistral does not expose
 * a public usage-history API, so usage arrives through the ingestion API.
 */
import { providerFetch } from "./http";
import { ProviderError, type ProviderAdapter } from "./types";

const BASE = "https://api.mistral.ai/v1";
const HTTP = { label: "Mistral", permissionHint: "This key doesn't have access to the Mistral API." };

const auth = (secret: string) => ({ headers: { Authorization: `Bearer ${secret}` } });

export const MistralAdapter: ProviderAdapter<null, null> = {
  id: "mistral",
  label: "Mistral",
  credential: {
    label: "API key",
    placeholder: "Paste your Mistral API key",
    help: "La Plateforme → API keys.",
    docsUrl: "https://docs.mistral.ai/getting-started/quickstart/",
  },
  capabilities: { usage: false, costs: false, models: true },
  usageNote: "Mistral doesn't offer a usage-history API. Send usage from your applications with the ObserveMetrics ingestion API.",

  async validateCredentials(secret) {
    try {
      await providerFetch(`${BASE}/models`, auth(secret), HTTP);
      return {
        ok: true,
        message: "Connected. Model access verified — usage is collected via the ingestion API.",
        scopes: { usage: false, costs: false, models: true },
      };
    } catch (e) {
      if (e instanceof ProviderError) return { ok: false, code: e.code, message: e.message };
      throw e;
    }
  },

  async fetchModels(secret) {
    const res = await providerFetch<{ data?: { id: string }[] }>(`${BASE}/models`, auth(secret), HTTP);
    return (res.data ?? []).map((m) => m.id).sort();
  },

  async fetchUsage() {
    throw new ProviderError("unsupported", MistralAdapter.usageNote!);
  },
  async fetchCosts() {
    throw new ProviderError("unsupported", MistralAdapter.usageNote!);
  },
  normalizeUsage: () => [],
  getProviderStatus: async () => ({ indicator: "unknown", description: "No machine-readable status page", checkedAt: new Date().toISOString() }),
};
