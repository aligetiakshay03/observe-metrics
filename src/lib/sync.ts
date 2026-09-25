/**
 * Usage sync engine.
 * Pulls normalized usage from a provider adapter, stores raw records, and
 * incrementally upserts daily + monthly rollups. Budget checks run after each
 * successful org sync.
 */
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { getAdapter } from "@/lib/providers/types";
import { computeCostUsd } from "@/lib/pricing";
import { checkBudgetsForOrg } from "@/lib/budgets";
import type { ProviderConnection, Provider } from "@prisma/client";

const SYNC_LOOKBACK_DAYS = 3; // overlap window; rollup upserts make it idempotent

export async function syncConnection(connection: ProviderConnection): Promise<{ ingested: number }> {
  const adapter = getAdapter(connection.provider);
  if (!adapter) throw new Error("No adapter for provider " + connection.provider);

  const until = new Date();
  const since = new Date(until.getTime() - SYNC_LOOKBACK_DAYS * 86_400_000);

  const job = await prisma.syncJob.create({
    data: {
      organizationId: connection.organizationId,
      connectionId: connection.id,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });

  try {
    const apiKey = decryptSecret(connection.apiKeyCiphertext);
    const rows = await adapter.fetchUsage({ apiKey, since, until });

    let ingested = 0;
    for (const row of rows) {
      const costUsd = computeCostUsd(row.model, row.inputTokens, row.outputTokens);
      await ingestUsage({
        organizationId: connection.organizationId,
        connectionId: connection.id,
        provider: connection.provider,
        model: row.model,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        requests: row.requests,
        team: row.team ?? null,
        timestamp: row.timestamp,
        costCents: costUsd * 100,
      });
      ingested++;
    }

    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "SUCCESS", finishedAt: new Date(), recordsIngested: ingested },
    });
    await prisma.providerConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date(), lastSyncError: null, status: "ACTIVE" },
    });

    await checkBudgetsForOrg(connection.organizationId);
    return { ingested };
  } catch (e) {
    const message = (e as Error).message;
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), error: message },
    });
    await prisma.providerConnection.update({
      where: { id: connection.id },
      data: { status: "ERROR", lastSyncError: message },
    });
    await prisma.alertEvent.create({
      data: {
        organizationId: connection.organizationId,
        type: "SYNC_FAILURE",
        message: "Sync failed for " + connection.provider + ": " + message,
        metadata: { connectionId: connection.id },
      },
    });
    throw e;
  }
}

export async function syncOrg(orgId: string): Promise<{ synced: number; failed: number }> {
  const connections = await prisma.providerConnection.findMany({
    where: { organizationId: orgId, status: { not: "DISABLED" } },
  });
  let synced = 0, failed = 0;
  for (const c of connections) {
    try {
      await syncConnection(c);
      synced++;
    } catch {
      failed++;
    }
  }
  return { synced, failed };
}

export async function syncAllOrgs(): Promise<{ orgs: number }> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  for (const org of orgs) {
    await syncOrg(org.id);
  }
  return { orgs: orgs.length };
}

/**
 * Idempotent ingest: writes the raw record and increments daily/monthly
 * rollups in a transaction. Rollups are the tables dashboards read.
 */
export async function ingestUsage(input: {
  organizationId: string;
  connectionId?: string | null;
  provider: Provider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  team: string | null;
  timestamp: Date;
  costCents: number;
}): Promise<void> {
  const day = new Date(
    Date.UTC(input.timestamp.getUTCFullYear(), input.timestamp.getUTCMonth(), input.timestamp.getUTCDate()),
  );
  const month = new Date(Date.UTC(input.timestamp.getUTCFullYear(), input.timestamp.getUTCMonth(), 1));
  // Rollup unique keys need a non-null team — "" is the "no team" sentinel.
  const teamKey = input.team ?? "";
  const inTok = BigInt(Math.max(0, Math.round(input.inputTokens)));
  const outTok = BigInt(Math.max(0, Math.round(input.outputTokens)));
  const reqCount = Math.max(0, Math.round(input.requests));

  await prisma.$transaction([
    prisma.usageRecord.create({
      data: {
        organizationId: input.organizationId,
        connectionId: input.connectionId ?? null,
        provider: input.provider,
        model: input.model,
        inputTokens: BigInt(Math.max(0, Math.round(input.inputTokens))),
        outputTokens: BigInt(Math.max(0, Math.round(input.outputTokens))),
        costCents: input.costCents,
        requests: Math.max(0, Math.round(input.requests)),
        team: input.team,
        timestamp: input.timestamp,
      },
    }),
    prisma.dailyRollup.upsert({
      where: {
        organizationId_day_provider_model_team: {
          organizationId: input.organizationId,
          day,
          provider: input.provider,
          model: input.model,
          team: teamKey,
        },
      },
      create: {
        organizationId: input.organizationId,
        day,
        provider: input.provider,
        model: input.model,
        team: teamKey,
        inputTokens: inTok,
        outputTokens: outTok,
        costCents: input.costCents,
        requests: reqCount,
      },
      update: {
        inputTokens: { increment: inTok },
        outputTokens: { increment: outTok },
        costCents: { increment: input.costCents },
        requests: { increment: reqCount },
      },
    }),
    prisma.monthlyRollup.upsert({
      where: {
        organizationId_month_provider_model_team: {
          organizationId: input.organizationId,
          month,
          provider: input.provider,
          model: input.model,
          team: teamKey,
        },
      },
      create: {
        organizationId: input.organizationId,
        month,
        provider: input.provider,
        model: input.model,
        team: teamKey,
        inputTokens: inTok,
        outputTokens: outTok,
        costCents: input.costCents,
        requests: reqCount,
      },
      update: {
        inputTokens: { increment: inTok },
        outputTokens: { increment: outTok },
        costCents: { increment: input.costCents },
        requests: { increment: reqCount },
      },
    }),
  ]);
}
