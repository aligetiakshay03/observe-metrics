import { E, ok, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { parseFilters } from "@/server/analytics/filters";
import { modelCompareSeries } from "@/server/analytics/views";

/** ?m=openai:gpt-4.1,anthropic:claude-sonnet-4-6 (2–4 models) */
export const GET = route(async (req) => {
  const ctx = await requireWorkspace(req);
  const sp = new URL(req.url).searchParams;
  const models = (sp.get("m") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf(":");
      return { provider: s.slice(0, i), model: s.slice(i + 1) };
    })
    .filter((m) => m.provider && m.model && m.provider.length <= 40 && m.model.length <= 120);
  if (models.length < 2 || models.length > 4) throw E.invalid("Select between 2 and 4 models to compare.");
  const f = parseFilters(sp);
  return ok({ filters: f, models: await modelCompareSeries(ctx.workspace.id, { ...f, providers: [], model: null }, models) });
});

export const dynamic = "force-dynamic";
