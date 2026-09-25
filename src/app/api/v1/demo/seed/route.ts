import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, errors, handler } from "@/lib/api";
import { requireOrgContext, requireAdmin } from "@/lib/auth";
import { syncConnection } from "@/lib/sync";
import { seedDemoHistory } from "@/lib/demo-history";

const BodySchema = z.object({
  seed: z.boolean().optional(),
});

export const POST = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();
  if (!requireAdmin(ctx)) return errors.forbidden();

  if (process.env.DEMO_MODE !== "true") {
    return errors.notFound("Demo mode is disabled on this deployment");
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));

  const existing = await prisma.providerConnection.findFirst({
    where: { organizationId: ctx.org.id, provider: "DEMO" },
  });
  const connection =
    existing ??
    (await prisma.providerConnection.create({
      data: {
        organizationId: ctx.org.id,
        provider: "DEMO",
        name: "Demo sandbox",
        apiKeyCiphertext: "seeded-demo-connection",
        keyLast4: "demo",
      },
    }));

  // Seed full history the first time (60 days); otherwise sync the recent window.
  const count = await prisma.usageRecord.count({ where: { organizationId: ctx.org.id } });
  if (count === 0 || parsed.success && parsed.data.seed) {
    await seedDemoHistory(ctx.org.id, connection.id);
  }

  const result = await syncConnection(connection);
  return ok({ ingested: result.ingested, provider: connection.provider });
});

export const dynamic = "force-dynamic";
