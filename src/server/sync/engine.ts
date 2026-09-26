import "server-only";
import type { ProviderConnection, SyncJob } from "@prisma/client";
import { prisma } from "../db";
import { rebuildDailyUsage } from "../ingest/rollup";
import { logger, redact } from "../log";
import { calculateCost } from "../pricing/service";
import { adapterForEnum } from "../providers/registry";
import { ProviderError } from "../providers/types";
import { openSecret } from "../secrets";
import { raiseSyncFailureAlert, resolveSyncFailureAlerts } from "../alerts";
import { refreshWorkspaceIntelligence } from "../insights/run";

const log = logger("sync");

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000; // scheduled sync every 6h
const BACKFILL_DAYS = 30; // first sync
const OVERLAP_DAYS = 3; // later syncs re-read the last 3 days (providers finalize late)
const MAX_ATTEMPTS = 3;

/** Queue a sync for one connection (no-op if one is already queued/running). */
export async function enqueueSync(connection: ProviderConnection, trigger: "manual" | "scheduled" | "connect"): Promise<SyncJob> {
  const existing = await prisma.syncJob.findFirst({
    where: { connectionId: connection.id, status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  const job = await prisma.syncJob.create({
    data: { workspaceId: connection.workspaceId, connectionId: connection.id, trigger, status: "QUEUED" },
  });
  await prisma.providerConnection.update({ where: { id: connection.id }, data: { syncStatus: "QUEUED" } });
  return job;
}

/**
 * Atomically claim a queued job. FOR UPDATE SKIP LOCKED lets several workers
 * (or a worker + an inline "Sync now") run without double-processing.
 */
async function claim(jobId?: string): Promise<SyncJob | null> {
  const rows = jobId
    ? await prisma.$queryRaw<{ id: string }[]>`
        UPDATE "sync_jobs" SET "status" = 'RUNNING', "startedAt" = NOW(), "attempts" = "attempts" + 1
        WHERE "id" = (SELECT "id" FROM "sync_jobs" WHERE "id" = ${jobId} AND "status" = 'QUEUED' FOR UPDATE SKIP LOCKED)
        RETURNING "id"`
    : await prisma.$queryRaw<{ id: string }[]>`
        UPDATE "sync_jobs" SET "status" = 'RUNNING', "startedAt" = NOW(), "attempts" = "attempts" + 1
        WHERE "id" = (SELECT "id" FROM "sync_jobs" WHERE "status" = 'QUEUED' AND "runAfter" <= NOW()
                      ORDER BY "runAfter" ASC FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING "id"`;
  if (!rows[0]) return null;
  return prisma.syncJob.findUnique({ where: { id: rows[0].id } });
}

export interface SyncOutcome {
  status: "SUCCESS" | "FAILED" | "RETRYING";
  recordsIngested: number;
  message: string;
}

/** Run one job to completion. Errors are recorded, never thrown. */
export async function runJob(job: SyncJob): Promise<SyncOutcome> {
  const connection = await prisma.providerConnection.findUnique({ where: { id: job.connectionId } });
  if (!connection) {
    await prisma.syncJob.update({ where: { id: job.id }, data: { status: "FAILED", finishedAt: new Date(), error: "Connection removed" } });
    return { status: "FAILED", recordsIngested: 0, message: "Connection removed" };
  }
  await prisma.providerConnection.update({ where: { id: connection.id }, data: { syncStatus: "RUNNING" } });

  try {
    const { ingested, message } = await syncConnection(connection);
    const now = new Date();
    await prisma.$transaction([
      prisma.syncJob.update({ where: { id: job.id }, data: { status: "SUCCESS", finishedAt: now, recordsIngested: ingested, error: null } }),
      prisma.providerConnection.update({
        where: { id: connection.id },
        data: {
          status: "ACTIVE",
          syncStatus: "SUCCESS",
          lastSyncedAt: now,
          lastSyncError: null,
          nextSyncAt: new Date(now.getTime() + SYNC_INTERVAL_MS),
        },
      }),
    ]);
    await resolveSyncFailureAlerts(connection);
    return { status: "SUCCESS", recordsIngested: ingested, message };
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : "internal";
    const message = e instanceof ProviderError ? e.message : "Sync failed due to an internal error.";
    if (!(e instanceof ProviderError)) log.error(`sync ${connection.id} failed`, e);
    const retryable = code === "rate_limited" || code === "unavailable" || code === "network";
    const willRetry = retryable && job.attempts < MAX_ATTEMPTS;
    const now = new Date();
    if (willRetry) {
      const backoffMs = 2 ** job.attempts * 60_000; // 2m, 4m, 8m
      await prisma.syncJob.update({
        where: { id: job.id },
        data: { status: "QUEUED", runAfter: new Date(now.getTime() + backoffMs), error: redact(message) },
      });
      await prisma.providerConnection.update({ where: { id: connection.id }, data: { syncStatus: "QUEUED", lastSyncError: redact(message) } });
      return { status: "RETRYING", recordsIngested: 0, message: `${message} Retrying in ${backoffMs / 60_000} minutes.` };
    }
    await prisma.$transaction([
      prisma.syncJob.update({ where: { id: job.id }, data: { status: "FAILED", finishedAt: now, error: redact(message) } }),
      prisma.providerConnection.update({
        where: { id: connection.id },
        data: {
          status: code === "invalid_credentials" || code === "insufficient_permissions" ? "ERROR" : connection.status,
          syncStatus: "FAILED",
          lastSyncError: redact(message),
          nextSyncAt: new Date(now.getTime() + SYNC_INTERVAL_MS),
        },
      }),
    ]);
    await raiseSyncFailureAlert(connection, redact(message));
    return { status: "FAILED", recordsIngested: 0, message };
  }
}

/** Pull, normalize and store provider usage. Returns buckets written. */
async function syncConnection(connection: ProviderConnection): Promise<{ ingested: number; message: string }> {
  const adapter = adapterForEnum(connection.provider);
  if (!adapter) throw new ProviderError("unsupported", "This provider is not supported.");
  const secret = openSecret(connection.apiKeyCiphertext, connection.workspaceId);

  if (!adapter.capabilities.usage) {
    const models = await adapter.fetchModels(secret);
    await prisma.providerConnection.update({ where: { id: connection.id }, data: { modelCount: models.length } });
    return { ingested: 0, message: `Verified access to ${models.length} models. ${adapter.usageNote ?? ""}`.trim() };
  }

  const end = new Date();
  const start = new Date(end);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (connection.lastSyncedAt ? OVERLAP_DAYS : BACKFILL_DAYS));

  const usage = await adapter.fetchUsage(secret, { start, end });
  let costs: unknown = [];
  if (adapter.capabilities.costs) {
    try {
      costs = await adapter.fetchCosts(secret, { start, end });
    } catch (e) {
      // Costs are optional; fall back to calculated estimates.
      log.warn(`cost report unavailable for ${connection.id}`, e);
      costs = [];
    }
  }
  const buckets = adapter.normalizeUsage(usage, costs);

  const days = new Set<string>();
  for (const b of buckets) {
    days.add(b.day);
    const ts = new Date(b.day + "T12:00:00.000Z");
    const calc = calculateCost({ provider: adapter.id, model: b.model, inputTokens: b.inputTokens, outputTokens: b.outputTokens, cachedTokens: b.cachedTokens, at: ts });
    const reported = b.reportedCostUsd != null;
    const data = {
      requestCount: b.requests ?? 0,
      inputTokens: BigInt(Math.round(b.inputTokens)),
      outputTokens: BigInt(Math.round(b.outputTokens)),
      cachedTokens: BigInt(Math.round(b.cachedTokens)),
      costUsd: reported ? b.reportedCostUsd! : calc.costUsd,
      costSource: reported ? ("PROVIDER_REPORTED" as const) : ("CALCULATED" as const),
    };
    const dedupeKey = `sync:${connection.id}:${b.day}:${b.model}`;
    // Provider buckets are replaced (not incremented) on every re-sync.
    await prisma.usageEvent.upsert({
      where: { workspaceId_dedupeKey: { workspaceId: connection.workspaceId, dedupeKey } },
      create: {
        workspaceId: connection.workspaceId,
        source: "PROVIDER_SYNC",
        connectionId: connection.id,
        provider: adapter.id,
        model: b.model,
        timestamp: ts,
        dedupeKey,
        ...data,
      },
      update: data,
    });
  }
  await rebuildDailyUsage(connection.workspaceId, days);
  const models = new Set(buckets.map((b) => b.model));
  await prisma.providerConnection.update({ where: { id: connection.id }, data: { modelCount: models.size } });
  await refreshWorkspaceIntelligence(connection.workspaceId);
  return { ingested: buckets.length, message: `Synced ${buckets.length} daily usage buckets across ${models.size} models.` };
}

/** Run a specific job now (used by "Sync now"). */
export async function runJobNow(jobId: string): Promise<SyncOutcome | null> {
  const job = await claim(jobId);
  if (!job) return null;
  return runJob(job);
}

/**
 * Scheduler tick: enqueue due connections, then drain up to `maxJobs`.
 * Called by the worker process and the cron endpoint.
 */
export async function tick(maxJobs = 10): Promise<{ enqueued: number; processed: number }> {
  // Recover jobs stuck RUNNING (e.g. process crashed) for more than 15 minutes.
  await prisma.syncJob.updateMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(Date.now() - 15 * 60_000) } },
    data: { status: "QUEUED", runAfter: new Date() },
  });
  const due = await prisma.providerConnection.findMany({
    where: {
      status: { not: "DISABLED" },
      workspace: { isDemo: false },
      OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: new Date() } }],
    },
    take: 100,
  });
  for (const c of due) await enqueueSync(c, "scheduled");
  let processed = 0;
  for (; processed < maxJobs; processed++) {
    const job = await claim();
    if (!job) break;
    await runJob(job);
  }
  return { enqueued: due.length, processed };
}
