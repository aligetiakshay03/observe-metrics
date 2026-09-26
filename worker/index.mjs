/**
 * ObserveMetrics background worker.
 *
 * All scheduling logic lives in the app (POST /api/v1/cron/tick), which:
 *   - enqueues provider connections whose next sync is due (every 6h),
 *   - drains the Postgres-backed sync queue (FOR UPDATE SKIP LOCKED, retries with backoff),
 *   - recomputes insights / alerts for workspaces with recent usage,
 *   - cleans up expired sessions, reset tokens and guest demo accounts.
 *
 * This process just calls it on an interval, so it can run anywhere with
 * network access to the app (a container sidecar, a VM, a PaaS worker).
 * Serverless deployments can use a platform cron instead (see vercel.json).
 *
 *   node worker/index.mjs
 * Env: APP_URL (default http://localhost:3100), CRON_SECRET, WORKER_INTERVAL_SECONDS (default 300)
 */
import "dotenv/config";

const base = (process.env.APP_URL ?? "http://localhost:3100").replace(/\/+$/, "");
const interval = Math.max(30, Number(process.env.WORKER_INTERVAL_SECONDS ?? 300)) * 1000;
const secret = process.env.CRON_SECRET;
let running = false;
let stopping = false;

function log(msg) {
  console.log(`[${new Date().toISOString()}] [worker] ${msg}`);
}

async function tick() {
  if (running || stopping) return;
  running = true;
  const started = Date.now();
  try {
    const res = await fetch(`${base}/api/v1/cron/tick`, {
      method: "POST",
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      signal: AbortSignal.timeout(280_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) log(`tick failed: HTTP ${res.status} ${body?.error?.message ?? ""}`);
    else log(`tick ok in ${Date.now() - started}ms ${JSON.stringify(body.data)}`);
  } catch (e) {
    log(`tick error: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    running = false;
  }
}

log(`started → ${base} every ${interval / 1000}s`);
void tick();
const timer = setInterval(() => void tick(), interval);
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    stopping = true;
    clearInterval(timer);
    log("stopping");
    process.exit(0);
  });
}
