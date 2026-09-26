import { E, ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { parseFilters } from "@/server/analytics/filters";
import { entityDetailView } from "@/server/analytics/views";

export const GET = route(async (req, { params }: { params: { id: string } }) => {
  const ctx = await requireWorkspace(req);
  const f = parseFilters(new URL(req.url).searchParams);
  const view = await entityDetailView(ctx.workspace.id, ctx.workspace.isDemo, { ...f, teamId: null, applicationId: null }, "app", params.id);
  if (!view) throw E.notFound("Application");
  return ok(view);
});

export const dynamic = "force-dynamic";
