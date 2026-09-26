/**
 * Types shared by API responses and the client. Contains no secrets —
 * provider credentials are never part of any payload.
 */

export type RangeKey = "7d" | "30d" | "90d" | "12m" | "custom";

export interface Filters {
  range: RangeKey;
  from: string;
  to: string;
  days: number;
  providers: string[];
  teamId: string | null;
  applicationId: string | null;
  model: string | null;
}

export interface Lookups {
  teams: { id: string; name: string; slug: string }[];
  apps: { id: string; name: string; slug: string; teamId: string | null }[];
  providers: string[];
}

/** Where cost figures come from. */
export type DataBasis = "reported" | "calculated" | "mixed" | "demo";

export interface Kpi {
  value: number;
  prev: number;
  change: number | null;
  spark: number[];
}

export interface Agg {
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  costUsd: number;
  reportedCostUsd: number;
  latencyMs: number | null;
  latencyCount: number;
  errorRate: number;
}

export interface SeriesPoint {
  day: string;
  costUsd: number;
  reportedCostUsd: number;
  requests: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number | null;
  errorRate: number;
}

export interface BreakdownRow {
  id: string;
  name: string;
  costUsd: number;
  requests: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number | null;
  errorRate: number;
  costPerRequest: number | null;
  share: number;
  change: number | null;
  prevCostUsd: number;
}

export interface ModelRow {
  provider: string;
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  costUsd: number;
  costPerRequest: number | null;
  latencyMs: number | null;
  errorRate: number;
  errors: number;
  change: number | null;
  priced: boolean;
}

export interface UserRow {
  user: string;
  teamId: string | null;
  teamName?: string | null;
  requests: number;
  tokens: number;
  costUsd: number;
}

export type Severity = "CRITICAL" | "WARNING" | "INFO";

export type InsightType =
  | "cost_anomaly"
  | "usage_spike"
  | "latency_regression"
  | "error_spike"
  | "oversized_context"
  | "high_cost_model"
  | "duplicate_requests"
  | "budget_threshold"
  | "provider_outage";

export interface InsightSummary {
  id: string;
  type: InsightType;
  severity: Severity;
  status: "OPEN" | "DISMISSED" | "RESOLVED";
  title: string;
  summary: string;
  provider: string | null;
  model: string | null;
  teamId: string | null;
  applicationId: string | null;
  teamName: string | null;
  applicationName: string | null;
  estimatedImpactUsd: number | null;
  impactKind: "cost_increase" | "savings" | "risk" | null;
  detectedAt: string;
}

export interface InsightMetric {
  label: string;
  current: number;
  baseline: number;
  unit: "usd" | "tokens" | "count" | "ms" | "pct" | "ratio";
  change: number | null;
}

export interface InsightDetail extends InsightSummary {
  whatHappened: string;
  whyItMatters: string;
  cause: string;
  recommendation: string;
  metrics: InsightMetric[];
  trend: { day: string; value: number; baseline?: number }[] | null;
  trendLabel: string | null;
  trendUnit: InsightMetric["unit"] | null;
  windowStart: string;
  windowEnd: string;
  relatedRequestsQuery: string;
  isDemo: boolean;
}

export interface OverviewView {
  filters: Filters;
  lookups: Lookups;
  basis: DataBasis;
  empty: boolean;
  kpis: {
    spend: Kpi;
    requests: Kpi;
    tokens: Kpi;
    latencyMs: Kpi;
    errorRate: Kpi;
    projectedMonthlyUsd: number;
    potentialSavingsUsd: number;
    savingsInsightCount: number;
    latencyMeasured: boolean;
  };
  series: SeriesPoint[];
  byProvider: BreakdownRow[];
  models: ModelRow[];
  teams: BreakdownRow[];
  apps: BreakdownRow[];
  insights: InsightSummary[];
}

export interface UsageView {
  filters: Filters;
  lookups: Lookups;
  basis: DataBasis;
  empty: boolean;
  kpis: { tokens: Kpi; inputTokens: Kpi; outputTokens: Kpi; tokensPerRequest: Kpi; requests: Kpi };
  series: SeriesPoint[];
  byProvider: BreakdownRow[];
  models: ModelRow[];
  teams: BreakdownRow[];
  apps: BreakdownRow[];
  users: UserRow[];
}

export interface CostsView {
  filters: Filters;
  lookups: Lookups;
  basis: DataBasis;
  empty: boolean;
  kpis: {
    spend: Kpi;
    projectedMonthlyUsd: number;
    mtdUsd: number;
    dailyAvg: Kpi;
    potentialSavingsUsd: number;
    savingsInsightCount: number;
    reportedShare: number;
  };
  series: SeriesPoint[];
  monthly: { month: string; costUsd: number }[];
  byProvider: BreakdownRow[];
  models: ModelRow[];
  teams: BreakdownRow[];
  apps: BreakdownRow[];
  waterfall: { previous: number; current: number; steps: { id: string; name: string; delta: number }[]; otherDelta: number };
}

export interface PriceInfo {
  provider: string;
  model: string;
  inputPer1M: number;
  outputPer1M: number;
  cachedInputPer1M?: number;
  effectiveFrom: string;
  verified: string;
}

export interface Changes {
  costUsd: number | null;
  requests: number | null;
  tokens: number | null;
  latencyMs: number | null;
  errorRate: number | null;
}

export interface ModelDetailView {
  filters: Filters;
  lookups: Lookups;
  basis: DataBasis;
  provider: string;
  model: string;
  price: PriceInfo | null;
  totals: Agg & { costPerRequest: number | null };
  change: Changes;
  series: SeriesPoint[];
  apps: BreakdownRow[];
  teams: BreakdownRow[];
  insights: InsightSummary[];
}

export interface EntityDetailView {
  kind: "team" | "app";
  entity: { id: string; name: string; slug: string; description: string | null; team: { id: string; name: string } | null };
  filters: Filters;
  lookups: Lookups;
  basis: DataBasis;
  totals: Agg & { costPerRequest: number | null };
  change: Changes;
  series: SeriesPoint[];
  models: ModelRow[];
  related: BreakdownRow[];
  users: UserRow[];
  insights: InsightSummary[];
  errorCodes: { code: string; count: number }[];
}

export interface EntityListRow extends BreakdownRow {
  members: number;
  teamId: string | null;
  teamName: string | null;
}

export interface CompareModel {
  provider: string;
  model: string;
  totals: Agg & { costPerRequest: number | null };
  price: PriceInfo | null;
  series: SeriesPoint[];
}

export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export interface MeResponse {
  user: { id: string; name: string | null; email: string; avatarUrl: string | null; isGuest: boolean };
  workspace: { id: string; name: string; slug: string; companyName: string | null; isDemo: boolean; role: Role; onboarded: boolean } | null;
  workspaces: { id: string; name: string; isDemo: boolean; role: Role }[];
  features: { googleAuth: boolean; demo: boolean; smtp: boolean };
}

export interface ProviderInfo {
  id: string;
  label: string;
  credential: { label: string; placeholder: string; help: string; docsUrl: string };
  capabilities: { usage: boolean; costs: boolean; models: boolean };
  usageNote: string | null;
}

export interface ConnectionInfo {
  id: string;
  provider: string; // provider id (openai, …)
  name: string;
  maskedKey: string;
  status: "ACTIVE" | "ERROR" | "DISABLED";
  syncStatus: "IDLE" | "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED";
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  lastTestedAt: string | null;
  nextSyncAt: string | null;
  modelCount: number | null;
  createdAt: string;
}

export interface AlertItem {
  id: string;
  category: "BUDGET" | "COST_ANOMALY" | "LATENCY" | "ERROR" | "PROVIDER_SYNC" | "OPTIMIZATION";
  severity: Severity;
  title: string;
  message: string;
  href: string | null;
  insightId: string | null;
  readAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface BudgetItem {
  id: string;
  name: string;
  scope: "WORKSPACE" | "TEAM" | "APPLICATION";
  teamId: string | null;
  applicationId: string | null;
  targetName: string;
  amountUsd: number;
  thresholds: number[];
  notify: boolean;
  spentUsd: number;
  percent: number;
  projectedUsd: number;
  projectedPercent: number;
  status: "ok" | "warning" | "exceeded";
  daysLeft: number;
  period: string;
}

export interface EventRow {
  id: string;
  timestamp: string;
  source: "PROVIDER_SYNC" | "INGEST_API" | "DEMO";
  provider: string;
  model: string;
  applicationId: string | null;
  applicationName: string | null;
  teamId: string | null;
  teamName: string | null;
  userRef: string | null;
  requestCount: number;
  errorCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costSource: "PROVIDER_REPORTED" | "CALCULATED" | "DEMO";
  latencyMs: number | null;
  status: string;
  errorCode: string | null;
  requestId: string | null;
  promptHash: string | null;
}

export interface SearchResult {
  type: "model" | "team" | "application" | "user" | "insight" | "page";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}
