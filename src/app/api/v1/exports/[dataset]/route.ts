import { clientIp, csvResponse, E, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseFilters } from "@/server/analytics/filters";
import { buildExport, EXPORT_DATASETS, type ExportDataset } from "@/server/exports";
import { audit } from "@/server/audit";

export const GET = route(async (req, { params }: { params: { dataset: string } }) => {
  const ctx = await requireWorkspace(req);
  if (!(EXPORT_DATASETS as readonly string[]).includes(params.dataset)) throw E.notFound("Export");
  await enforceRateLimit(`export:${ctx.user.id}`, 30, 600, "Too many exports. Please wait a few minutes.");
  const f = parseFilters(new URL(req.url).searchParams);
  const { csv, filename, rows } = await buildExport(ctx.workspace.id, params.dataset as ExportDataset, f);
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "data.exported", metadata: { dataset: params.dataset, rows, from: f.from, to: f.to }, ip: clientIp(req) });
  return csvResponse(csv, filename);
});

export const dynamic = "force-dynamic";
