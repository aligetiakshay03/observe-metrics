import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, errors, handler } from "@/lib/api";
import { requireOrgContext, requireAdmin } from "@/lib/auth";
import { encryptSecret, keyLast4 } from "@/lib/crypto";
import { getAdapter } from "@/lib/providers/types";

const PatchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  apiKey: z.string().min(1).max(8000).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

type Params = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, { params }: Params) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();
  const { id } = await params;

  const conn = await prisma.providerConnection.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!conn) return errors.notFound("Connection");

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errors.badRequest("Invalid payload");

  const data: Record<string, unknown> = {};
  if (parsed.data.name) data.name = parsed.data.name.trim();
  if (parsed.data.status) data.status = parsed.data.status;
  if (parsed.data.apiKey) {
    const adapter = getAdapter(conn.provider);
    if (adapter?.verify) {
      const check = await adapter.verify(parsed.data.apiKey);
      if (!check.ok) return errors.badRequest("Provider rejected the API key: " + check.error);
    }
    data.apiKeyCiphertext = encryptSecret(parsed.data.apiKey);
    data.keyLast4 = keyLast4(parsed.data.apiKey);
    data.status = "ACTIVE";
    data.lastSyncError = null;
  }

  const updated = await prisma.providerConnection.update({
    where: { id: conn.id },
    data,
    select: { id: true, provider: true, name: true, keyLast4: true, status: true, lastSyncedAt: true },
  });
  return ok({ connection: updated });
});

export const DELETE = handler(async (req: Request, { params }: Params) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();
  if (!requireAdmin(ctx)) return errors.forbidden();
  const { id } = await params;

  const conn = await prisma.providerConnection.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!conn) return errors.notFound("Connection");

  await prisma.providerConnection.delete({ where: { id: conn.id } });
  return ok({ deleted: true });
});

export const dynamic = "force-dynamic";
