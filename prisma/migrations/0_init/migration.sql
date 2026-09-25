-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."plan" AS ENUM ('FREE', 'STARTER', 'GROWTH');

-- CreateEnum
CREATE TYPE "public"."member_role" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "public"."provider" AS ENUM ('OPENAI', 'ANTHROPIC', 'GOOGLE', 'MISTRAL', 'DEMO');

-- CreateEnum
CREATE TYPE "public"."connection_status" AS ENUM ('ACTIVE', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "public"."invite_status" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "public"."budget_period" AS ENUM ('MONTHLY');

-- CreateEnum
CREATE TYPE "public"."alert_type" AS ENUM ('BUDGET_80', 'BUDGET_100', 'SYNC_FAILURE');

-- CreateEnum
CREATE TYPE "public"."sync_status" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "public"."organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "public"."plan" NOT NULL DEFAULT 'FREE',
    "monthlyBudgetCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "public"."member_role" NOT NULL DEFAULT 'MEMBER',
    "team" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."invites" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "public"."member_role" NOT NULL DEFAULT 'MEMBER',
    "team" TEXT,
    "token" TEXT NOT NULL,
    "status" "public"."invite_status" NOT NULL DEFAULT 'PENDING',
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."provider_connections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "public"."provider" NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Primary',
    "apiKeyCiphertext" TEXT NOT NULL,
    "keyLast4" TEXT NOT NULL,
    "status" "public"."connection_status" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."usage_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "provider" "public"."provider" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" BIGINT NOT NULL DEFAULT 0,
    "outputTokens" BIGINT NOT NULL DEFAULT 0,
    "costCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 1,
    "team" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."daily_rollups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "provider" "public"."provider" NOT NULL,
    "model" TEXT NOT NULL,
    "team" TEXT,
    "inputTokens" BIGINT NOT NULL DEFAULT 0,
    "outputTokens" BIGINT NOT NULL DEFAULT 0,
    "costCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_rollups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."monthly_rollups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "provider" "public"."provider" NOT NULL,
    "model" TEXT NOT NULL,
    "team" TEXT,
    "inputTokens" BIGINT NOT NULL DEFAULT 0,
    "outputTokens" BIGINT NOT NULL DEFAULT 0,
    "costCents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requests" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "monthly_rollups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."budgets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "team" TEXT,
    "amountCents" INTEGER NOT NULL,
    "period" "public"."budget_period" NOT NULL DEFAULT 'MONTHLY',
    "alert80SentAt" TIMESTAMP(3),
    "alert100SentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."alert_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "public"."alert_type" NOT NULL,
    "team" TEXT,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sync_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "status" "public"."sync_status" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "recordsIngested" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "plan" "public"."plan" NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."oauth_states" (
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("state")
);

-- CreateTable
CREATE TABLE "public"."api_keys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "public"."organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "public"."users"("googleId");

-- CreateIndex
CREATE INDEX "memberships_organizationId_idx" ON "public"."memberships"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_organizationId_key" ON "public"."memberships"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "public"."invites"("token");

-- CreateIndex
CREATE INDEX "invites_email_idx" ON "public"."invites"("email");

-- CreateIndex
CREATE UNIQUE INDEX "invites_organizationId_email_key" ON "public"."invites"("organizationId", "email");

-- CreateIndex
CREATE INDEX "provider_connections_organizationId_idx" ON "public"."provider_connections"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_connections_organizationId_provider_name_key" ON "public"."provider_connections"("organizationId", "provider", "name");

-- CreateIndex
CREATE INDEX "usage_records_organizationId_timestamp_idx" ON "public"."usage_records"("organizationId", "timestamp");

-- CreateIndex
CREATE INDEX "usage_records_organizationId_provider_timestamp_idx" ON "public"."usage_records"("organizationId", "provider", "timestamp");

-- CreateIndex
CREATE INDEX "usage_records_connectionId_idx" ON "public"."usage_records"("connectionId");

-- CreateIndex
CREATE INDEX "daily_rollups_organizationId_day_idx" ON "public"."daily_rollups"("organizationId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "daily_rollups_organizationId_day_provider_model_team_key" ON "public"."daily_rollups"("organizationId", "day", "provider", "model", "team");

-- CreateIndex
CREATE INDEX "monthly_rollups_organizationId_month_idx" ON "public"."monthly_rollups"("organizationId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_rollups_organizationId_month_provider_model_team_key" ON "public"."monthly_rollups"("organizationId", "month", "provider", "model", "team");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_organizationId_team_key" ON "public"."budgets"("organizationId", "team");

-- CreateIndex
CREATE INDEX "alert_events_organizationId_createdAt_idx" ON "public"."alert_events"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "sync_jobs_connectionId_createdAt_idx" ON "public"."sync_jobs"("connectionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "public"."subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_organizationId_idx" ON "public"."subscriptions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "public"."api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_organizationId_idx" ON "public"."api_keys"("organizationId");

-- AddForeignKey
ALTER TABLE "public"."memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."memberships" ADD CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invites" ADD CONSTRAINT "invites_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invites" ADD CONSTRAINT "invites_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."provider_connections" ADD CONSTRAINT "provider_connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."usage_records" ADD CONSTRAINT "usage_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."usage_records" ADD CONSTRAINT "usage_records_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "public"."provider_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."daily_rollups" ADD CONSTRAINT "daily_rollups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."monthly_rollups" ADD CONSTRAINT "monthly_rollups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."budgets" ADD CONSTRAINT "budgets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."alert_events" ADD CONSTRAINT "alert_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sync_jobs" ADD CONSTRAINT "sync_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sync_jobs" ADD CONSTRAINT "sync_jobs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "public"."provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."oauth_states" ADD CONSTRAINT "oauth_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

