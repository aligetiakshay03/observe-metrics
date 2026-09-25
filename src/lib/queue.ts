/**
 * BullMQ queue wiring. When REDIS_URL is set, jobs run through BullMQ workers
 * (dedicated worker process or cron tick). Without Redis, ticks run inline so
 * local dev and minimal deployments still work.
 */
import type { JobsOptions } from "bullmq";
import { syncAllOrgs } from "@/lib/sync";
import { runRetentionForAllOrgs } from "@/lib/retention";
import { checkBudgetsForOrg } from "@/lib/budgets";
import { prisma } from "@/lib/db";

export const QUEUE_SYNC = "usage-sync";
export const QUEUE_BUDGETS = "budget-checks";
export const QUEUE_RETENTION = "retention";

interface QueueFactory {
  add: (name: string, data: unknown, opts?: JobsOptions) => Promise<unknown>;
}

const g = globalThis as unknown as {
  __omQueues?: { sync: QueueFactory; budgets: QueueFactory; retention: QueueFactory } | null;
};

function getQueues(): { sync: QueueFactory; budgets: QueueFactory; retention: QueueFactory } | null {
  if (g.__omQueues !== undefined) return g.__omQueues;
  g.__omQueues = null;
  if (!process.env.REDIS_URL) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Queue } = require("bullmq") as typeof import("bullmq");
    const opts = { connection: { url: process.env.REDIS_URL }, prefix: "om" };
    g.__omQueues = {
      sync: new Queue(QUEUE_SYNC, opts),
      budgets: new Queue(QUEUE_BUDGETS, opts),
      retention: new Queue(QUEUE_RETENTION, opts),
    };
  } catch (e) {
    console.warn("[queue] BullMQ unavailable, jobs will run inline:", (e as Error).message);
    g.__omQueues = null;
  }
  return g.__omQueues;
}

/** Enqueue a full sync of every org's connections (worker picks it up). */
export async function enqueueSyncAll(): Promise<void> {
  const queues = getQueues();
  if (queues) {
    await queues.sync.add("sync-all", {}, { jobId: "sync-all" });
    return;
  }
  await syncAllOrgs();
}

/** Run one pass of every scheduled job. Used by the cron endpoint + worker timer. */
export async function runAllTicks(): Promise<{ sync: unknown; retention: unknown; budgets: number }> {
  const syncResult = await syncAllOrgs();
  const retentionResult = await runRetentionForAllOrgs();

  let budgetsChecked = 0;
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  for (const org of orgs) {
    await checkBudgetsForOrg(org.id);
    budgetsChecked++;
  }

  void getQueues; // queues used by enqueueSyncAll; ticks run handlers directly
  return { sync: syncResult, retention: retentionResult, budgets: budgetsChecked };
}
