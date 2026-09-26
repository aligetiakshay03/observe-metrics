import { prisma } from "@/server/db";
import { ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";

export const POST = route(async (req) => {
  const ctx = await requireWorkspace(req, "ADMIN");
  if (!ctx.workspace.onboardingCompletedAt) {
    await prisma.workspace.update({ where: { id: ctx.workspace.id }, data: { onboardingCompletedAt: new Date() } });
  }
  return ok({ completed: true });
});

export const dynamic = "force-dynamic";
