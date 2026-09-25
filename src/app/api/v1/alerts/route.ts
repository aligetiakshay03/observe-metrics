import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, errors, handler } from "@/lib/api";
import { requireOrgContext } from "@/lib/auth";

export const GET = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();

  const alerts = await prisma.alertEvent.findMany({
    where: { organizationId: ctx.org.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ok({ alerts });
});

const ReadSchema = z.object({
  ids: z.array(z.string()).optional(),
});

export const POST = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();

  const parsed = ReadSchema.safeParse(await req.json().catch(() => ({})));
  const where = {
    organizationId: ctx.org.id,
    readAt: null,
    ...(parsed.success && parsed.data.ids?.length ? { id: { in: parsed.data.ids } } : {}),
  };
  await prisma.alertEvent.updateMany({ where, data: { readAt: new Date() } });
  return ok({ marked: true });
});
