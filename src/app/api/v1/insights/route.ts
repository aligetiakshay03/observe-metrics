import { ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { insightSummaries } from "@/server/insights/queries";

export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req);
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const insights = await insightSummaries(ctx.workspace.id, {
    status: status === "OPEN" || status === "DISMISSED" || status === "RESOLVED" ? status : undefined,
    type: sp.get("type") ?? undefined,
    severity: sp.get("severity") ?? undefined,
  });
  return ok({ insights, isDemo: ctx.workspace.isDemo });
});

export const dynamic = "force-dynamic";
