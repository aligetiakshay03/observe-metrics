import { prisma } from "@/server/db";
import { clientIp, E, ok, parseBody, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { audit } from "@/server/audit";
import { refreshWorkspaceIntelligence } from "@/server/insights/run";
import { assertBudgetTargets, budgetData, budgetSchema } from "@/server/schemas";

type P = { params: { id: string } };

export const PATCH = route(async (req, { params }: P) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const existing = await prisma.budget.findFirst({ where: { id: params.id, workspaceId: ctx.workspace.id } });
  if (!existing) throw E.notFound("Budget");
  const b = await parseBody(req, budgetSchema);
  await assertBudgetTargets(ctx.workspace.id, b);
  await prisma.budget.update({
    where: { id: existing.id },
    data: {
      ...budgetData(b),
      // Changing the amount re-arms threshold alerts for the month.
      ...(b.amountUsd !== existing.amountUsd ? { alertedThreshold: null, alertedPeriod: null } : {}),
    },
  });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "budget.updated", targetType: "budget", targetId: existing.id, metadata: { amountUsd: b.amountUsd }, ip: clientIp(req) });
  await refreshWorkspaceIntelligence(ctx.workspace.id);
  return ok({ updated: true });
});

export const DELETE = route(async (req, { params }: P) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const existing = await prisma.budget.findFirst({ where: { id: params.id, workspaceId: ctx.workspace.id } });
  if (!existing) throw E.notFound("Budget");
  await prisma.budget.delete({ where: { id: existing.id } });
  await prisma.alert.updateMany({ where: { workspaceId: ctx.workspace.id, budgetId: existing.id, resolvedAt: null }, data: { resolvedAt: new Date() } });
  await prisma.insight.updateMany({
    where: { workspaceId: ctx.workspace.id, type: "budget_threshold", fingerprint: { startsWith: `budget_threshold:${existing.id}|` }, status: "OPEN" },
    data: { status: "RESOLVED" },
  });
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "budget.deleted", targetType: "budget", targetId: existing.id, metadata: { name: existing.name }, ip: clientIp(req) });
  return ok({ deleted: true });
});

export const dynamic = "force-dynamic";
