import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, errors, handler, fail } from "@/lib/api";
import { requireOrgContext, requireAdmin } from "@/lib/auth";
import { getBudgetProgress } from "@/lib/analytics";
import { planOf } from "@/lib/plans";

export const GET = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();

  const budgets = await prisma.budget.findMany({
    where: { organizationId: ctx.org.id },
    orderBy: { createdAt: "asc" },
  });

  const withProgress = await Promise.all(
    budgets.map(async (b) => ({
      id: b.id,
      team: b.team,
      amountCents: b.amountCents,
      alert80SentAt: b.alert80SentAt,
      alert100SentAt: b.alert100SentAt,
      progress: await getBudgetProgress(ctx.org.id, b.team, b.amountCents),
    })),
  );
  return ok({ budgets: withProgress, budgetsEnabled: planOf(ctx.org.plan).budgets });
});

const CreateSchema = z.object({
  team: z.string().max(60).nullable().optional(),
  amountCents: z.number().int().min(100).max(100_000_000),
});

export const POST = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();
  if (!requireAdmin(ctx)) return errors.forbidden();

  if (!planOf(ctx.org.plan).budgets) {
    return fail(403, "Budgets are available on the Growth plan. Upgrade to set budgets and alerts.");
  }
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errors.badRequest("Invalid budget payload", parsed.error.flatten().fieldErrors);

  const team = parsed.data.team?.trim() || null;
  const existing = await prisma.budget.findFirst({
    where: { organizationId: ctx.org.id, team: team ?? null },
  });
  if (existing) return errors.conflict("A budget already exists for this scope");

  const budget = await prisma.budget.create({
    data: { organizationId: ctx.org.id, team, amountCents: parsed.data.amountCents },
  });
  return ok({ budget }, { status: 201 });
});
