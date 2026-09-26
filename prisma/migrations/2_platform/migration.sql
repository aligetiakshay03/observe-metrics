-- ObserveMetrics platform migration: workspaces, sessions, normalized usage,
-- insights/alerts/notifications/audit. Removes legacy billing + rollup tables
-- (the old rollups double-counted on re-sync and are rebuilt from usage_events).

-- CreateEnum
CREATE TYPE "public"."usage_source" AS ENUM ('PROVIDER_SYNC', 'INGEST_API', 'DEMO');

-- CreateEnum
CREATE TYPE "public"."cost_source" AS ENUM ('PROVIDER_REPORTED', 'CALCULATED', 'DEMO');

-- CreateEnum
CREATE TYPE "public"."budget_scope" AS ENUM ('WORKSPACE', 'TEAM', 'APPLICATION');

-- CreateEnum
CREATE TYPE "public"."severity" AS ENUM ('CRITICAL', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "public"."insight_status" AS ENUM ('OPEN', 'DISMISSED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "public"."alert_category" AS ENUM ('BUDGET', 'COST_ANOMALY', 'LATENCY', 'ERROR', 'PROVIDER_SYNC', 'OPTIMIZATION');


-- DropForeignKey
ALTER TABLE "public"."alert_events" DROP CONSTRAINT "alert_events_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."budgets" DROP CONSTRAINT "budgets_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."daily_rollups" DROP CONSTRAINT "daily_rollups_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."monthly_rollups" DROP CONSTRAINT "monthly_rollups_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."subscriptions" DROP CONSTRAINT "subscriptions_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "public"."usage_records" DROP CONSTRAINT "usage_records_connectionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."usage_records" DROP CONSTRAINT "usage_records_organizationId_fkey";

-- Legacy budgets used a different shape (team string, cents); they are recreated by users.
DELETE FROM "public"."budgets";

-- DropIndex
DROP INDEX "public"."budgets_organizationId_team_key";

-- AlterTable
ALTER TABLE "public"."api_keys" ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "public"."budgets" DROP COLUMN "alert100SentAt",
DROP COLUMN "alert80SentAt",
DROP COLUMN "amountCents",
DROP COLUMN "organizationId",
DROP COLUMN "team",
ADD COLUMN     "alertedPeriod" TEXT,
ADD COLUMN     "alertedThreshold" INTEGER,
ADD COLUMN     "amountUsd" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "applicationId" TEXT,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "notify" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "scope" "public"."budget_scope" NOT NULL,
ADD COLUMN     "teamId" TEXT,
ADD COLUMN     "thresholds" INTEGER[] DEFAULT ARRAY[80, 100]::INTEGER[],
ADD COLUMN     "workspaceId" TEXT NOT NULL,
DROP COLUMN "period",
ADD COLUMN     "period" TEXT NOT NULL DEFAULT 'monthly';

-- AlterTable
ALTER TABLE "public"."invites" DROP COLUMN "team";

-- AlterTable
ALTER TABLE "public"."memberships" DROP COLUMN "team",
ADD COLUMN     "jobFunction" TEXT,
ADD COLUMN     "notificationPrefs" JSONB,
ADD COLUMN     "teamId" TEXT;

-- AlterTable
ALTER TABLE "public"."organizations" DROP COLUMN "monthlyBudgetCents",
DROP COLUMN "plan",
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."provider_connections" ADD COLUMN     "lastTestedAt" TIMESTAMP(3),
ADD COLUMN     "modelCount" INTEGER,
ADD COLUMN     "nextSyncAt" TIMESTAMP(3),
ADD COLUMN     "syncStatus" "public"."sync_status" NOT NULL DEFAULT 'IDLE';

-- AlterTable
ALTER TABLE "public"."sync_jobs" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "trigger" TEXT NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "isGuest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "public"."alert_events";

-- DropTable
DROP TABLE "public"."daily_rollups";

-- DropTable
DROP TABLE "public"."monthly_rollups";

-- DropTable
DROP TABLE "public"."subscriptions";

-- DropTable
DROP TABLE "public"."usage_records";

-- DropEnum
DROP TYPE "public"."alert_type";

-- DropEnum
DROP TYPE "public"."budget_period";

-- DropEnum
DROP TYPE "public"."plan";

-- CreateTable
CREATE TABLE "public"."sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "remember" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,
    "ip" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."teams" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."applications" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."usage_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" "public"."usage_source" NOT NULL,
    "connectionId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "applicationId" TEXT,
    "teamId" TEXT,
    "userRef" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 1,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" BIGINT NOT NULL DEFAULT 0,
    "outputTokens" BIGINT NOT NULL DEFAULT 0,
    "cachedTokens" BIGINT NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costSource" "public"."cost_source" NOT NULL,
    "latencyMsSum" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'success',
    "errorCode" TEXT,
    "requestId" TEXT,
    "promptHash" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."daily_usage" (
    "workspaceId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL DEFAULT '',
    "teamId" TEXT NOT NULL DEFAULT '',
    "requests" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" BIGINT NOT NULL DEFAULT 0,
    "outputTokens" BIGINT NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reportedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMsSum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_usage_pkey" PRIMARY KEY ("workspaceId","day","provider","model","applicationId","teamId")
);

-- CreateTable
CREATE TABLE "public"."insights" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "public"."severity" NOT NULL,
    "status" "public"."insight_status" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "whatHappened" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "teamId" TEXT,
    "applicationId" TEXT,
    "metrics" JSONB NOT NULL,
    "trend" JSONB,
    "estimatedImpactUsd" DOUBLE PRECISION,
    "impactKind" TEXT,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."alerts" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "category" "public"."alert_category" NOT NULL,
    "severity" "public"."severity" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "insightId" TEXT,
    "budgetId" TEXT,
    "connectionId" TEXT,
    "href" TEXT,
    "fingerprint" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "public"."sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "public"."sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "public"."sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "public"."password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "public"."password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_workspaceId_slug_key" ON "public"."teams"("workspaceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "applications_workspaceId_slug_key" ON "public"."applications"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "usage_events_workspaceId_timestamp_idx" ON "public"."usage_events"("workspaceId", "timestamp");

-- CreateIndex
CREATE INDEX "usage_events_workspaceId_model_timestamp_idx" ON "public"."usage_events"("workspaceId", "model", "timestamp");

-- CreateIndex
CREATE INDEX "usage_events_workspaceId_applicationId_timestamp_idx" ON "public"."usage_events"("workspaceId", "applicationId", "timestamp");

-- CreateIndex
CREATE INDEX "usage_events_workspaceId_promptHash_idx" ON "public"."usage_events"("workspaceId", "promptHash");

-- CreateIndex
CREATE UNIQUE INDEX "usage_events_workspaceId_dedupeKey_key" ON "public"."usage_events"("workspaceId", "dedupeKey");

-- CreateIndex
CREATE INDEX "daily_usage_workspaceId_day_idx" ON "public"."daily_usage"("workspaceId", "day");

-- CreateIndex
CREATE INDEX "insights_workspaceId_status_detectedAt_idx" ON "public"."insights"("workspaceId", "status", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "insights_workspaceId_fingerprint_key" ON "public"."insights"("workspaceId", "fingerprint");

-- CreateIndex
CREATE INDEX "alerts_workspaceId_createdAt_idx" ON "public"."alerts"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_workspaceId_fingerprint_key" ON "public"."alerts"("workspaceId", "fingerprint");

-- CreateIndex
CREATE INDEX "notifications_userId_workspaceId_createdAt_idx" ON "public"."notifications"("userId", "workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_workspaceId_createdAt_idx" ON "public"."audit_logs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "budgets_workspaceId_idx" ON "public"."budgets"("workspaceId");

-- CreateIndex
CREATE INDEX "provider_connections_nextSyncAt_idx" ON "public"."provider_connections"("nextSyncAt");

-- CreateIndex
CREATE INDEX "sync_jobs_status_runAfter_idx" ON "public"."sync_jobs"("status", "runAfter");

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."memberships" ADD CONSTRAINT "memberships_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."teams" ADD CONSTRAINT "teams_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."applications" ADD CONSTRAINT "applications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."applications" ADD CONSTRAINT "applications_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."usage_events" ADD CONSTRAINT "usage_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_usage" ADD CONSTRAINT "daily_usage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."budgets" ADD CONSTRAINT "budgets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."insights" ADD CONSTRAINT "insights_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."alerts" ADD CONSTRAINT "alerts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."alerts" ADD CONSTRAINT "alerts_insightId_fkey" FOREIGN KEY ("insightId") REFERENCES "public"."insights"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
