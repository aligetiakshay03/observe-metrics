import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, errors, handler } from "@/lib/api";
import { requireOrgContext, requireAdmin } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const PatchSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
  team: z.string().max(60).nullable().optional(),
});

export const PATCH = handler(async (req: Request, { params }: Params) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();
  if (!requireAdmin(ctx)) return errors.forbidden();
  const { id } = await params;

  const membership = await prisma.membership.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!membership) return errors.notFound("Member");

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errors.badRequest("Invalid payload");

  // Prevent removing the last admin via self-demotion.
  if (parsed.data.role === "MEMBER" && membership.role === "ADMIN") {
    const adminCount = await prisma.membership.count({
      where: { organizationId: ctx.org.id, role: "ADMIN" },
    });
    if (adminCount <= 1) return errors.conflict("Cannot demote the last admin");
  }

  const updated = await prisma.membership.update({
    where: { id: membership.id },
    data: {
      ...(parsed.data.role ? { role: parsed.data.role } : {}),
      ...(parsed.data.team !== undefined ? { team: parsed.data.team } : {}),
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return ok({ member: updated });
});

export const DELETE = handler(async (req: Request, { params }: Params) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();
  if (!requireAdmin(ctx)) return errors.forbidden();
  const { id } = await params;

  const membership = await prisma.membership.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!membership) return errors.notFound("Member");

  if (membership.role === "ADMIN") {
    const adminCount = await prisma.membership.count({
      where: { organizationId: ctx.org.id, role: "ADMIN" },
    });
    if (adminCount <= 1) return errors.conflict("Cannot remove the last admin");
  }
  if (membership.userId === ctx.user.id) return errors.conflict("Use the org switcher to leave an organization");

  await prisma.membership.delete({ where: { id: membership.id } });
  return ok({ removed: true });
});
