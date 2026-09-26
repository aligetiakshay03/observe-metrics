/**
 * Google Gemini (AI Studio / Gemini API).
 * Gemini API keys can list models but there is no API that returns historical
 * token usage for a key, so usage is collected through the ObserveMetrics
 * ingestion API (instrumented applications) rather than provider sync.
 */
import { providerFetch } from "./http";
import { ProviderError, type ProviderAdapter } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const HTTP = {
  label: "Google Gemini",
  permissionHint: "This key doesn't have access to the Gemini API. Enable the Generative Language API for its project.",
  badRequestMeansInvalidKey: true,
};

interface ModelsPage {
  models?: { name: string }[];
  nextPageToken?: string;
}

const auth = (secret: string) => ({ headers: { "x-goog-api-key": secret } });

export const GoogleAdapter: ProviderAdapter<null, null> = {
  id: "google",
  label: "Google Gemini",
  credential: {
    label: "Gemini API key",
    placeholder: "AIza…",
    help: "Google AI Studio → API keys.",
    docsUrl: "https://ai.google.dev/gemini-api/docs/api-key",
  },
  capabilities: { usage: false, costs: false, models: true },
  usageNote:
    "Gemini API keys can't read historical usage. Send usage from your applications with the ObserveMetrics ingestion API.",

  async validateCredentials(secret) {
    try {
      await providerFetch(`${BASE}/models?pageSize=1`, auth(secret), HTTP);
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
    const out: string[] = [];
    let token: string | undefined;
    for (let i = 0; i < 10; i++) {
      const qs = new URLSearchParams({ pageSize: "1000" });
      if (token) qs.set("pageToken", token);
      const page = await providerFetch<ModelsPage>(`${BASE}/models?${qs}`, auth(secret), HTTP);
      for (const m of page.models ?? []) out.push(m.name.replace(/^models\//, ""));
      token = page.nextPageToken;
      if (!token) break;
    }
    return out.sort();
  },

  async fetchUsage() {
    throw new ProviderError("unsupported", GoogleAdapter.usageNote!);
  },
  async fetchCosts() {
    throw new ProviderError("unsupported", GoogleAdapter.usageNote!);
  },
  normalizeUsage: () => [],
  getProviderStatus: async () => ({ indicator: "unknown", description: "No machine-readable status page", checkedAt: new Date().toISOString() }),
};
