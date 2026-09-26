import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import type { AlertItem } from "@/lib/types";

const CATEGORIES = ["BUDGET", "COST_ANOMALY", "LATENCY", "ERROR", "PROVIDER_SYNC", "OPTIMIZATION"] as const;

export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req);
  const sp = new URL(req.url).searchParams;
  const where: Prisma.AlertWhereInput = { workspaceId: ctx.workspace.id };
  const status = sp.get("status") ?? "open";
  if (status === "open") where.resolvedAt = null;
  if (status === "resolved") where.resolvedAt = { not: null };
  const category = sp.get("category");
  if (category && (CATEGORIES as readonly string[]).includes(category)) where.category = category as (typeof CATEGORIES)[number];
  const severity = sp.get("severity");
  if (severity === "CRITICAL" || severity === "WARNING" || severity === "INFO") where.severity = severity;
  const [alerts, counts] = await Promise.all([
    prisma.alert.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.alert.groupBy({ by: ["severity"], where: { workspaceId: ctx.workspace.id, resolvedAt: null }, _count: true }),
  ]);
  const items: AlertItem[] = alerts.map((a) => ({
    id: a.id,
    category: a.category,
    severity: a.severity,
    title: a.title,
    message: a.message,
    href: a.href,
    insightId: a.insightId,
    readAt: a.readAt?.toISOString() ?? null,
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  }));
  return ok({
    alerts: items,
    openCounts: Object.fromEntries(counts.map((c) => [c.severity, c._count])),
    unread: await prisma.alert.count({ where: { workspaceId: ctx.workspace.id, resolvedAt: null, readAt: null } }),
  });
});

export const dynamic = "force-dynamic";
