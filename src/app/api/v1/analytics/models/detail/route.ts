import { E, ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { parseFilters } from "@/server/analytics/filters";
import { modelDetailView } from "@/server/analytics/views";

export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req);
  const sp = new URL(req.url).searchParams;
  const provider = (sp.get("provider") ?? "").slice(0, 40);
  const model = (sp.get("id") ?? "").slice(0, 120);
  if (!provider || !model) throw E.invalid("provider and id are required.");
  const f = parseFilters(sp);
  const view = await modelDetailView(ctx.workspace.id, ctx.workspace.isDemo, { ...f, model: null, providers: [] }, provider, model);
  if (!view) throw E.notFound("Model");
  return ok(view);
});

export const dynamic = "force-dynamic";
