import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, errors, handler } from "@/lib/api";
import { requireOrgContext } from "@/lib/auth";
import { syncConnection } from "@/lib/sync";

type Params = { params: Promise<{ id: string }> };

export const POST = handler(async (req: Request, { params }: Params) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();
  const { id } = await params;

  const conn = await prisma.providerConnection.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!conn) return errors.notFound("Connection");

  try {
    const result = await syncConnection(conn);
    return ok({ synced: true, ingested: result.ingested });
  } catch (e) {
    return errors.badRequest("Sync failed: " + (e as Error).message);
  }
});

export const dynamic = "force-dynamic";
