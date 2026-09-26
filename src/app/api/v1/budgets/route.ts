import { prisma } from "@/server/db";
import { clientIp, ok, parseBody, route } from "@/server/http";
import { requireWorkspace, roleAtLeast } from "@/server/auth/context";
import { budgetStatuses } from "@/server/budgets";
import { audit } from "@/server/audit";
import { refreshWorkspaceIntelligence } from "@/server/insights/run";
import { assertBudgetTargets, budgetData, budgetSchema } from "@/server/schemas";

export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req);
  return ok({ budgets: await budgetStatuses(ctx.workspace.id), canEdit: roleAtLeast(ctx.role, "ADMIN") });
});

export const POST = route(async (req) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  const b = await parseBody(req, budgetSchema);
  await assertBudgetTargets(ctx.workspace.id, b);
  const budget = await prisma.budget.create({ data: { workspaceId: ctx.workspace.id, ...budgetData(b) } });
  await audit({
    workspaceId: ctx.workspace.id,
    actorId: ctx.user.id,
    action: "budget.created",
    targetType: "budget",
    targetId: budget.id,
    metadata: { name: b.name, amountUsd: b.amountUsd },
    ip: clientIp(req),
  });
  await refreshWorkspaceIntelligence(ctx.workspace.id);
  return ok({ id: budget.id }, { status: 201 });
});

export const dynamic = "force-dynamic";
