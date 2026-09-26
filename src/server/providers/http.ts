import { ProviderError, type ProviderStatus } from "./types";

const TIMEOUT_MS = 15_000;

export interface ProviderHttpOptions {
  label: string;
  /** Message used for 403-style responses (key valid but lacks scope). */
  permissionHint: string;
  /** Some providers (Google) return 400 for an invalid key. */
  badRequestMeansInvalidKey?: boolean;
}

/**
 * fetch() wrapper for provider APIs. Maps transport and HTTP failures to
 * ProviderError codes with user-safe messages. Response bodies are never
 * included in errors: some providers echo part of the submitted key.
 */
export async function providerFetch<T>(url: string, init: RequestInit, opts: ProviderHttpOptions): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (e) {
    const timedOut = (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError";
    throw new ProviderError(
      "network",
      timedOut ? `${opts.label} did not respond within ${TIMEOUT_MS / 1000}s.` : `Couldn't reach ${opts.label}. Check network connectivity and try again.`,
    );
  }
  if (res.ok) {
    try {
      return (await res.json()) as T;
    } catch {
      throw new ProviderError("bad_response", `${opts.label} returned a response ObserveMetrics couldn't read.`);
    }
  }
  // Drain the body without surfacing it.
  await res.text().catch(() => "");
  throw mapStatus(res.status, opts);
}

export function mapStatus(status: number, opts: ProviderHttpOptions): ProviderError {
  if (status === 401 || (status === 400 && opts.badRequestMeansInvalidKey)) {
    return new ProviderError("invalid_credentials", `${opts.label} rejected this key. Check that it was copied correctly and hasn't been revoked.`);
  }
  if (status === 403 || status === 404) return new ProviderError("insufficient_permissions", opts.permissionHint);
  if (status === 429) return new ProviderError("rate_limited", `${opts.label} is rate limiting requests. ObserveMetrics will retry automatically.`);
  if (status >= 500) return new ProviderError("unavailable", `${opts.label} is temporarily unavailable (HTTP ${status}).`);
  return new ProviderError("bad_response", `${opts.label} returned an unexpected response (HTTP ${status}).`);
}

/** Atlassian Statuspage-compatible status endpoint, best effort. */
export async function statuspage(url: string): Promise<ProviderStatus> {
  const checkedAt = new Date().toISOString();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return { indicator: "unknown", description: "Status page unavailable", checkedAt };
    const json = (await res.json()) as { status?: { indicator?: string; description?: string } };
    const ind = json.status?.indicator;
    const indicator = ind === "none" ? "operational" : ind === "minor" ? "degraded" : ind === "major" || ind === "critical" ? "outage" : "unknown";
    return { indicator, description: json.status?.description ?? "Unknown", checkedAt };
  } catch {
    return { indicator: "unknown", description: "Status page unreachable", checkedAt };
  }
}

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);
