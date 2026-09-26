import { ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { parseFilters } from "@/server/analytics/filters";
import { entityListView } from "@/server/analytics/views";

export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req);
  const f = parseFilters(new URL(req.url).searchParams);
  return ok({ ...(await entityListView(ctx.workspace.id, f, "app")), isDemo: ctx.workspace.isDemo });
});

export const dynamic = "force-dynamic";
