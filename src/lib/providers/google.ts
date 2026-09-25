/**
 * Google Gemini usage integration.
 *
 * AI Studio API keys cannot read historical usage, so historical ingest is
 * supported through a Google Cloud service account + BigQuery billing export.
 * Set GOOGLE_BILLING_EXPORT_BUCKET/TABLE to enable. Without it, the adapter
 * verifies the key and returns no rows (with guidance in the connection error).
 */
import type { AdapterContext, NormalizedUsage, ProviderAdapter } from "./types";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

function isServiceAccountJson(key: string): boolean {
  return key.trimStart().startsWith("{");
}

export const GoogleAdapter: ProviderAdapter = {
  label: "Google Gemini",
  keyHint: "Google Cloud service account JSON (with BigQuery billing export) for history, or an AI Studio key for verification only.",

  async verify(apiKey) {
    try {
      if (isServiceAccountJson(apiKey)) {
        const sa = JSON.parse(apiKey) as ServiceAccount;
        if (!sa.client_email || !sa.private_key) {
          return { ok: false, error: "Service account JSON missing client_email or private_key" };
        }
        await fetchAccessToken(sa);
        return { ok: true };
      }
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(apiKey),
      );
      if (res.ok) return { ok: true };
      return { ok: false, error: "Google returned " + res.status };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },

  async fetchUsage(ctx: AdapterContext): Promise<NormalizedUsage[]> {
    if (!isServiceAccountJson(ctx.apiKey)) {
      // AI Studio keys cannot read historical usage — no rows, guidance surfaced via sync error.
      console.warn("[google] AI Studio keys cannot read historical usage; use a service account with billing export.");
      return [];
    }
    const sa = JSON.parse(ctx.apiKey) as ServiceAccount;
    const token = await fetchAccessToken(sa);
    const table = process.env.GOOGLE_BILLING_EXPORT_TABLE; // e.g. project.dataset.bq_billing_export
    if (!table) {
      throw new Error(
        "GOOGLE_BILLING_EXPORT_TABLE is not configured. Enable BigQuery billing export and set the table id to ingest Gemini usage.",
      );
    }

    const query =
      "SELECT service.description AS service, sku.description AS sku, usage_start_time, " +
      "project.id AS project_id, SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS cost " +
      "FROM `" + table + "` " +
      "WHERE DATE(usage_start_time) BETWEEN DATE(@since) AND DATE(@until) AND service.description LIKE 'Vertex AI%' " +
      "GROUP BY 1,2,3,5";

    const res = await fetch("https://bigquery.googleapis.com/bigquery/v2/projects/" + sa.project_id + "/queries", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        params: { since: ctx.since.toISOString().slice(0, 10), until: ctx.until.toISOString().slice(0, 10) },
        useLegacySql: false,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error("BigQuery billing export query " + res.status + ": " + body);
    }
    const json = (await res.json()) as {
      rows?: { f: { v: string }[] }[];
      schema?: { fields: { name: string }[] };
    };

    const out: NormalizedUsage[] = [];
    for (const row of json.rows ?? []) {
      const sku = row.f[1]?.v ?? "";
      const usageStart = row.f[2]?.v ?? "";
      const cost = Number(row.f[4]?.v ?? 0);
      // Heuristic SKU-to-model mapping, e.g. "Gemini 2.5 Pro Input" -> gemini-2.5-pro
      const m = sku.match(/gemini\s+([\d.]+)\s+(pro|flash)/i);
      const model = m ? "gemini-" + m[1] + "-" + m[2].toLowerCase() : "gemini-unknown";
      // Back into tokens via list price so rollups stay token-shaped.
      const pricePerMillion = model.includes("pro") ? 1.25 : 0.15;
      const tokens = Math.round((cost / pricePerMillion) * 1_000_000);
      if (tokens <= 0) continue;
      out.push({
        model,
        inputTokens: tokens,
        outputTokens: 0,
        requests: 0,
        timestamp: new Date(usageStart),
      });
    }
    return out;
  },
};

// ── OAuth2 JWT-bearer flow (service accounts) ──

async function fetchAccessToken(sa: ServiceAccount): Promise<string> {
  const crypto = await import("crypto");
  const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(header + "." + payload);
  const signature = b64url(signer.sign(sa.private_key));
  const assertion = header + "." + payload + "." + signature;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error("Google token exchange failed: " + res.status);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}
