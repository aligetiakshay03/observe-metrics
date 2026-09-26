import "server-only";
import type { AlertCategory, Insight, ProviderConnection, Severity } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { alertEmail, sendEmail } from "./email";
import { providerLabel } from "@/lib/format";
import { providerIdFromEnum } from "./providers/types";

export interface NotificationPrefs {
  inApp: { costAnomaly: boolean; budget: boolean; providerSync: boolean; performance: boolean; optimization: boolean };
  email: { budget: boolean; critical: boolean };
}

export const DEFAULT_PREFS: NotificationPrefs = {
  inApp: { costAnomaly: true, budget: true, providerSync: true, performance: true, optimization: true },
  email: { budget: true, critical: true },
};

export function readPrefs(raw: unknown): NotificationPrefs {
  const r = (raw ?? {}) as Partial<NotificationPrefs>;
  return { inApp: { ...DEFAULT_PREFS.inApp, ...(r.inApp ?? {}) }, email: { ...DEFAULT_PREFS.email, ...(r.email ?? {}) } };
}

type PrefKey = keyof NotificationPrefs["inApp"];

const CATEGORY_PREF: Record<AlertCategory, PrefKey> = {
  BUDGET: "budget",
  COST_ANOMALY: "costAnomaly",
  LATENCY: "performance",
  ERROR: "performance",
  PROVIDER_SYNC: "providerSync",
  OPTIMIZATION: "optimization",
};

/** Fan an event out to workspace members as in-app notifications (+ email). */
export async function notifyMembers(
  workspaceId: string,
  n: { kind: string; title: string; body: string; href: string; pref: PrefKey; severity?: Severity; emailable?: boolean },
) {
  const [workspace, members] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true, isDemo: true } }),
    prisma.workspaceMember.findMany({ where: { workspaceId }, include: { user: { select: { id: true, email: true, isGuest: true } } } }),
  ]);
  if (!workspace) return;
  const rows = [];
  for (const m of members) {
    const prefs = readPrefs(m.notificationPrefs);
    if (!prefs.inApp[n.pref]) continue;
    rows.push({ workspaceId, userId: m.userId, kind: n.kind, title: n.title, body: n.body, href: n.href });
    const wantsEmail = n.emailable && (n.pref === "budget" ? prefs.email.budget : n.severity === "CRITICAL" && prefs.email.critical);
    if (wantsEmail && env.smtpEnabled && !workspace.isDemo && !m.user.isGuest && m.role !== "VIEWER") {
      await sendEmail(alertEmail(m.user.email, workspace.name, n.title, n.body, env.appUrl + n.href));
    }
  }
  if (rows.length) await prisma.notification.createMany({ data: rows });
}

/** Create an alert once per fingerprint; notify only when it is new. */
export async function upsertAlert(a: {
  workspaceId: string;
  fingerprint: string;
  category: AlertCategory;
  severity: Severity;
  title: string;
  message: string;
  href: string;
  insightId?: string | null;
  budgetId?: string | null;
  connectionId?: string | null;
  notify?: boolean;
}) {
  const existing = await prisma.alert.findUnique({ where: { workspaceId_fingerprint: { workspaceId: a.workspaceId, fingerprint: a.fingerprint } } });
  if (existing) {
    await prisma.alert.update({ where: { id: existing.id }, data: { severity: a.severity, title: a.title, message: a.message, href: a.href } });
    return { alert: existing, created: false };
  }
  const alert = await prisma.alert.create({
    data: {
      workspaceId: a.workspaceId,
      fingerprint: a.fingerprint,
      category: a.category,
      severity: a.severity,
      title: a.title,
      message: a.message,
      href: a.href,
      insightId: a.insightId ?? null,
      budgetId: a.budgetId ?? null,
      connectionId: a.connectionId ?? null,
    },
  });
  if (a.notify !== false) {
    await notifyMembers(a.workspaceId, {
      kind: a.category.toLowerCase(),
      title: a.title,
      body: a.message,
      href: a.href,
      pref: CATEGORY_PREF[a.category],
      severity: a.severity,
      emailable: a.category === "BUDGET" || a.severity === "CRITICAL",
    });
  }
  return { alert, created: true };
}

const INSIGHT_CATEGORY: Record<string, AlertCategory | null> = {
  cost_anomaly: "COST_ANOMALY",
  usage_spike: "COST_ANOMALY",
  latency_regression: "LATENCY",
  error_spike: "ERROR",
  provider_outage: "ERROR",
  budget_threshold: "BUDGET",
  oversized_context: null,
  high_cost_model: null,
  duplicate_requests: null,
};

/** Alerts for actionable insights; optimization insights notify without alerting. */
export async function alertForInsight(insight: Insight, isNew: boolean) {
  const href = `/dashboard/insights/${insight.id}`;
  // Budget alerts are raised per threshold by the budget checker (insights/run.ts).
  if (insight.type === "budget_threshold") return;
  const category = INSIGHT_CATEGORY[insight.type];
  if (category && insight.severity !== "INFO") {
    await upsertAlert({
      workspaceId: insight.workspaceId,
      fingerprint: "insight:" + insight.fingerprint,
      category,
      severity: insight.severity,
      title: insight.title,
      message: insight.summary,
      href,
      insightId: insight.id,
    });
  } else if (!category && isNew) {
    await notifyMembers(insight.workspaceId, { kind: "optimization", title: "New optimization insight", body: insight.title, href, pref: "optimization" });
  }
}

export async function raiseSyncFailureAlert(connection: ProviderConnection, message: string) {
  const id = providerIdFromEnum(connection.provider) ?? "provider";
  await upsertAlert({
    workspaceId: connection.workspaceId,
    fingerprint: `sync:${connection.id}:${new Date().toISOString().slice(0, 10)}`,
    category: "PROVIDER_SYNC",
    severity: "WARNING",
    title: `${providerLabel(id)} sync failed`,
    message,
    href: "/dashboard/settings/providers",
    connectionId: connection.id,
  });
}

export async function resolveSyncFailureAlerts(connection: ProviderConnection) {
  await prisma.alert.updateMany({
    where: { workspaceId: connection.workspaceId, connectionId: connection.id, category: "PROVIDER_SYNC", resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
}
