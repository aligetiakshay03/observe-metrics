import { E, ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { enforceRateLimit } from "@/server/rate-limit";
import { seedDemoData } from "@/server/demo/seed";

export const POST = route(async (req) => {
  const ctx = await requireWorkspace(req);
  if (!ctx.workspace.isDemo) throw E.forbidden("Only demo workspaces can be reset.");
  await enforceRateLimit(`demo-reset:${ctx.user.id}`, 5, 3600);
  await seedDemoData(ctx.workspace.id);
  return ok({ reset: true });
});

export const dynamic = "force-dynamic";
