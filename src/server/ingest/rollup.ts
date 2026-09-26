import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";

/**
 * Rebuild daily_usage for the given UTC days from usage_events.
 *
 * Aggregates are recomputed rather than incremented, so re-syncing an
 * overlapping window or retrying an ingest can never double count. A
 * per-workspace advisory lock serializes concurrent rebuilds.
 */
export async function rebuildDailyUsage(workspaceId: string, days: Iterable<string>): Promise<void> {
  const list = [...new Set(days)].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (!list.length) return;
  const from = new Date(list[0] + "T00:00:00.000Z");
  const to = new Date(new Date(list[list.length - 1] + "T00:00:00.000Z").getTime() + 86_400_000);
  const dayArray = Prisma.sql`ARRAY[${Prisma.join(list)}]::date[]`;

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"rollup:" + workspaceId}))`;
      await tx.$executeRaw`DELETE FROM "daily_usage" WHERE "workspaceId" = ${workspaceId} AND "day" = ANY(${dayArray})`;
      await tx.$executeRaw`
        INSERT INTO "daily_usage" ("workspaceId","day","provider","model","applicationId","teamId","requests","errors",
          "inputTokens","outputTokens","costUsd","reportedCostUsd","latencyMsSum","latencyCount")
        SELECT "workspaceId", ("timestamp")::date, "provider", "model",
               COALESCE("applicationId", ''), COALESCE("teamId", ''),
               SUM("requestCount")::int, SUM("errorCount")::int,
               SUM("inputTokens")::bigint, SUM("outputTokens")::bigint,
               SUM("costUsd"),
               SUM(CASE WHEN "costSource" = 'PROVIDER_REPORTED' THEN "costUsd" ELSE 0 END),
               COALESCE(SUM("latencyMsSum"), 0),
               SUM(CASE WHEN "latencyMsSum" IS NOT NULL THEN "requestCount" ELSE 0 END)::int
        FROM "usage_events"
        WHERE "workspaceId" = ${workspaceId}
          AND "timestamp" >= ${from} AND "timestamp" < ${to}
          AND ("timestamp")::date = ANY(${dayArray})
        GROUP BY 1, 2, 3, 4, 5, 6`;
    },
    { timeout: 60_000 },
  );
}

export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
