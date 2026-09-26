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

/** Fail fast on misconfiguration that would weaken security in production. */
export function assertProductionConfig(): void {
  if (!env.isProd) return;
  const problems: string[] = [];
  const key = process.env.ENCRYPTION_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(key) || /^0+$/.test(key)) problems.push("ENCRYPTION_KEY must be 64 random hex chars");
  if (!process.env.APP_URL?.startsWith("https://")) problems.push("APP_URL must be an https:// URL");
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 24) problems.push("CRON_SECRET must be set (24+ chars)");
  if (problems.length) throw new Error("Invalid production configuration: " + problems.join("; "));
}
