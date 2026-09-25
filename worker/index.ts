/**
 * ObserveMetrics background worker.
 *
 * Runs the scheduled jobs:
 *  - usage sync per organization (every 6 hours via timer; queue-driven when Redis is configured)
 *  - budget checks after each sync
 *  - retention cleanup (daily)
 *
 * Start with: npm run worker
 */
import "dotenv/config";

const REDIS_URL = process.env.REDIS_URL;
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

async function main() {
  console.log("[worker] starting…");

  // Dynamic imports so prisma client is required only in the worker process.
  const { syncAllOrgs, syncOrg } = await import("../src/lib/sync");
  const { runRetentionForAllOrgs } = await import("../src/lib/retention");
  const { checkBudgetsForOrg } = await import("../src/lib/budgets");
  const { prisma } = await import("../src/lib/db");

  if (REDIS_URL) {
    const { Worker } = await import("bullmq");
    const connection = { url: REDIS_URL };

    new Worker(
      "usage-sync",
      async (job) => {
        if (job.name === "sync-all") {
          const r = await syncAllOrgs();
          console.log("[worker] sync-all:", r);
        } else if (job.name === "sync-org" && typeof job.data?.organizationId === "string") {
          const r = await syncOrg(job.data.organizationId);
          console.log("[worker] sync-org:", job.data.organizationId, r);
        }
      },
      { connection, prefix: "om" },
    );

    new Worker(
      "budget-checks",
      async (job) => {
        if (typeof job.data?.organizationId === "string") {
          await checkBudgetsForOrg(job.data.organizationId);
        }
      },
      { connection, prefix: "om" },
    );

    new Worker(
      "retention",
      async () => {
        const r = await runRetentionForAllOrgs();
        console.log("[worker] retention:", r);
      },
      { connection, prefix: "om" },
    );

    console.log("[worker] BullMQ workers online (queues: usage-sync, budget-checks, retention)");
  } else {
    console.log("[worker] REDIS_URL not set — running on interval timers only");
  }

  // Interval-driven schedule (works with or without Redis).
  async function tick() {
    try {
      const r = await syncAllOrgs();
      console.log("[worker] scheduled sync:", new Date().toISOString(), r);
    } catch (e) {
      console.error("[worker] scheduled sync failed:", e);
    }
  }

  async function retentionTick() {
    try {
      const r = await runRetentionForAllOrgs();
      console.log("[worker] scheduled retention:", new Date().toISOString(), r);
    } catch (e) {
      console.error("[worker] retention failed:", e);
    }
  }

  // Run once at boot, then on schedule.
  await tick();
  await retentionTick();
  setInterval(() => void tick(), SYNC_INTERVAL_MS);
  setInterval(() => void retentionTick(), RETENTION_INTERVAL_MS);

  // Keep the process alive; also keep the Prisma connection warm.
  const shutdown = async () => {
    console.log("[worker] shutting down…");
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  console.log("[worker] ready — syncing every 6h, retention daily");
}

void main();
