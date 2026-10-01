import "server-only";

/**
 * Centralized access to application-level configuration. Secrets are read
 * from process.env on the server only and never serialized to the client.
 */
export const env = {
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  get appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3100").replace(/\/+$/, "");
  },
  get googleAuthEnabled() {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  },
  get smtpEnabled() {
    return Boolean(process.env.SMTP_HOST);
  },
  get cronSecret() {
    return process.env.CRON_SECRET ?? null;
  },
  /** Demo workspaces can be disabled on a deployment with DEMO_MODE=false. */
  get demoEnabled() {
    return process.env.DEMO_MODE !== "false";
  },
};

/**
 * Number of proxies in front of the app that append to X-Forwarded-For. Every
 * one of them adds an entry, so this is how many entries to skip from the
 * right to reach the real client. One proxy is the common case; two (e.g. a CDN
 * in front of Vercel) is the one that silently breaks rate limiting.
 */
export const MAX_TRUSTED_PROXY_HOPS = 10;

export function parseTrustedProxyHops(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_TRUSTED_PROXY_HOPS) return null;
  return n;
}

/** Always a valid integer >= 1, so callers never index a hop count with NaN. */
export function trustedProxyHops(): number {
  return parseTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS) ?? 1;
}

/** Fail fast on misconfiguration that would weaken security in production. */
export function assertProductionConfig(): void {
  if (!env.isProd) return;
  const problems: string[] = [];
  const key = process.env.ENCRYPTION_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(key) || /^0+$/.test(key)) problems.push("ENCRYPTION_KEY must be 64 random hex chars");
  if (!process.env.APP_URL?.startsWith("https://")) problems.push("APP_URL must be an https:// URL");
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 24) problems.push("CRON_SECRET must be set (24+ chars)");
  if (parseTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS) === null) {
    problems.push(`TRUSTED_PROXY_HOPS must be a whole number from 1 to ${MAX_TRUSTED_PROXY_HOPS} (count the proxies in front of the app)`);
  }
  // Without Redis, rate-limit counters live in one process: they reset on every
  // deploy and are invisible to other replicas, so brute-force protection on
  // sign-in can be bypassed by spreading attempts across instances.
  if (!process.env.REDIS_URL) problems.push("REDIS_URL must be set so rate limits are shared across instances");
  if (problems.length) throw new Error("Invalid production configuration: " + problems.join("; "));
}
