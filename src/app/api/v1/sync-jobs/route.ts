import { prisma } from "@/lib/db";
import { ok, errors, handler } from "@/lib/api";
import { requireOrgContext } from "@/lib/auth";

export const GET = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();

  const jobs = await prisma.syncJob.findMany({
    where: { organizationId: ctx.org.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return ok({ jobs });
});

export const dynamic = "force-dynamic";
