import { clientIp, csvResponse, E, route } from "@/server/http";
import { requireWorkspace } from "@/server/auth/context";
import { enforceRateLimit } from "@/server/rate-limit";
import { parseFilters } from "@/server/analytics/filters";
import { buildExport, EXPORT_DATASETS, EXPORT_MAX_ROWS, type ExportDataset } from "@/server/exports";
import { audit } from "@/server/audit";
import { logger } from "@/server/log";

const log = logger("export");

export const GET = route(async (req, { params }: { params: { dataset: string } }) => {
  const ctx = await requireWorkspace(req);
  if (!(EXPORT_DATASETS as readonly string[]).includes(params.dataset)) throw E.notFound("Export");
  await enforceRateLimit(`export:${ctx.user.id}`, 30, 600, "Too many exports. Please wait a few minutes.");
  const f = parseFilters(new URL(req.url).searchParams);
  const { csv, filename, rows, truncated } = await buildExport(ctx.workspace.id, params.dataset as ExportDataset, f);
  if (truncated) {
    log.warn(`export truncated for workspace ${ctx.workspace.id} (${params.dataset}, ${f.from}..${f.to}): kept ${rows} of more than ${rows} rows at the ${EXPORT_MAX_ROWS}-row cap`);
  }
  await audit({ workspaceId: ctx.workspace.id, actorId: ctx.user.id, action: "data.exported", metadata: { dataset: params.dataset, rows, truncated, from: f.from, to: f.to }, ip: clientIp(req) });
  return csvResponse(csv, filename, {
    "X-Export-Rows": String(rows),
    "X-Export-Limit": String(EXPORT_MAX_ROWS),
    "X-Export-Truncated": truncated ? "true" : "false",
  });
});

export const dynamic = "force-dynamic";
