import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, errors, handler } from "@/lib/api";
import { requireOrgContext, requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  amountCents: z.number().int().min(100).max(100_000_000).optional(),
});

export const PATCH = handler(async (req: Request, { params }: Params) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();
  if (!requireAdmin(ctx)) return errors.forbidden();
  const { id } = await params;

  const budget = await prisma.budget.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!budget) return errors.notFound("Budget");

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.amountCents === undefined) {
    return errors.badRequest("amountCents is required");
  }

  const updated = await prisma.budget.update({
    where: { id: budget.id },
    data: {
      amountCents: parsed.data.amountCents,
      // reset alert stamps so re-alerting works against the new amount
      alert80SentAt: null,
      alert100SentAt: null,
    },
  });
  return ok({ budget: updated });
});

export const DELETE = handler(async (req: Request, { params }: Params) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();
  if (!requireAdmin(ctx)) return errors.forbidden();
  const { id } = await params;

  const budget = await prisma.budget.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!budget) return errors.notFound("Budget");

  await prisma.budget.delete({ where: { id: budget.id } });
  return ok({ deleted: true });
});

export const dynamic = "force-dynamic";
