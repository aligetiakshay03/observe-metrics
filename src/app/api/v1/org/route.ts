import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, errors, handler } from "@/lib/api";
import { requireOrgContext, requireAdmin } from "@/lib/auth";

export const GET = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();
  return ok({ organization: ctx.org });
});

const PatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  monthlyBudgetCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
});

export const PATCH = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();
  if (!requireAdmin(ctx)) return errors.forbidden();

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errors.badRequest("Invalid payload");

  const org = await prisma.organization.update({
    where: { id: ctx.org.id },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.monthlyBudgetCents !== undefined
        ? { monthlyBudgetCents: parsed.data.monthlyBudgetCents }
        : {}),
    },
  });
  return ok({ organization: org });
});

export const dynamic = "force-dynamic";
