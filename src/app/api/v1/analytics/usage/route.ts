import { ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { parseFilters } from "@/server/analytics/filters";
import { usageView } from "@/server/analytics/views";

export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req);
  const f = parseFilters(new URL(req.url).searchParams);
  return ok(await usageView(ctx.workspace.id, ctx.workspace.isDemo, f));
});

export const dynamic = "force-dynamic";
