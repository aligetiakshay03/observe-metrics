import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, errors, handler } from "@/lib/api";
import { requireOrgContext, requireAdmin } from "@/lib/auth";
import { encryptSecret, keyLast4 } from "@/lib/crypto";
import { planOf } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { getAdapter } from "@/lib/providers/types";

export const GET = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();

  const connections = await prisma.providerConnection.findMany({
    where: { organizationId: ctx.org.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      provider: true,
      name: true,
      keyLast4: true,
      status: true,
      lastSyncedAt: true,
      lastSyncError: true,
      createdAt: true,
    },
  });
  return ok({ connections });
});

const ConnectSchema = z.object({
  provider: z.enum(["OPENAI", "ANTHROPIC", "GOOGLE", "MISTRAL", "DEMO"]),
  name: z.string().max(60).optional(),
  apiKey: z.string().min(1).max(8000),
});

export const POST = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();
  if (!(await rateLimit("connect:" + ctx.user.id, 20, 60))) return errors.tooMany();

  const parsed = ConnectSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errors.badRequest("Invalid connection payload", parsed.error.flatten().fieldErrors);

  const { provider, apiKey } = parsed.data;
  const name = parsed.data.name?.trim() || "Primary";
  const limits = planOf(ctx.org.plan);

  const existing = await prisma.providerConnection.count({ where: { organizationId: ctx.org.id } });
  if (limits.maxProviders !== -1 && existing >= limits.maxProviders) {
    return errors.forbidden();
  }

  // Verify the key with the provider before storing it.
  const adapter = getAdapter(provider);
  if (adapter?.verify) {
    const check = await adapter.verify(apiKey);
    if (!check.ok) return errors.badRequest("Provider rejected the API key: " + check.error);
  }

  const connection = await prisma.providerConnection.create({
    data: {
      organizationId: ctx.org.id,
      provider,
      name,
      apiKeyCiphertext: encryptSecret(apiKey),
      keyLast4: keyLast4(apiKey),
    },
    select: { id: true, provider: true, name: true, keyLast4: true, status: true },
  });

  return ok({ connection }, { status: 201 });
});

export const dynamic = "force-dynamic";
