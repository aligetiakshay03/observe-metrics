import "server-only";
import { prisma, num } from "./db";
import { aggregate } from "./analytics/query";
import { getLookups } from "./analytics/views";
import type { Filters } from "./analytics/filters";
import { providerLabel } from "@/lib/format";

/**
 * RFC 4180 CSV. Cells that start with = + - @ (or tab/CR) are prefixed with
 * an apostrophe so spreadsheet apps don't evaluate them as formulas
 * (CSV injection), since names like team/app come from user input.
 */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    if (v == null) return "";
    let s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : v;
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\r\n") + "\r\n";
}

export const EXPORT_DATASETS = ["usage", "costs", "models", "teams", "applications", "events"] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];

const r4 = (v: number) => Math.round(v * 10000) / 10000;

export async function buildExport(workspaceId: string, dataset: ExportDataset, f: Filters): Promise<{ csv: string; filename: string; rows: number }> {
  const lookups = await getLookups(workspaceId);
  const teamName = new Map(lookups.teams.map((t) => [t.id, t.name]));
  const appName = new Map(lookups.apps.map((a) => [a.id, a.name]));
  const suffix = `${f.from}_to_${f.to}`;

  if (dataset === "usage" || dataset === "costs") {
    const rows = await aggregate(workspaceId, f, ["day", "provider", "model", "team", "app"]);
    rows.sort((a, b) => a.keys.day!.localeCompare(b.keys.day!) || b.costUsd - a.costUsd);
    const headers =
      dataset === "usage"
        ? ["date", "provider", "model", "team", "application", "requests", "errors", "input_tokens", "output_tokens", "total_tokens", "avg_latency_ms"]
        : ["date", "provider", "model", "team", "application", "requests", "cost_usd", "provider_reported_cost_usd", "cost_basis"];
    const data = rows.map((r) => {
      const common = [r.keys.day!, providerLabel(r.keys.provider), r.keys.model!, teamName.get(r.keys.team!) ?? "", appName.get(r.keys.app!) ?? "", r.requests];
      return dataset === "usage"
        ? [...common, r.errors, r.inputTokens, r.outputTokens, r.tokens, r.latencyMs == null ? "" : Math.round(r.latencyMs)]
        : [...common, r4(r.costUsd), r4(r.reportedCostUsd), r.reportedCostUsd >= r.costUsd * 0.99 && r.costUsd > 0 ? "provider_reported" : "calculated_estimate"];
    });
    return { csv: toCsv(headers, data), filename: `observemetrics_${dataset}_${suffix}.csv`, rows: data.length };
  }

  if (dataset === "models") {
    const rows = await aggregate(workspaceId, f, ["provider", "model"]);
    rows.sort((a, b) => b.costUsd - a.costUsd);
    const data = rows.map((r) => [
      providerLabel(r.keys.provider),
      r.keys.model!,
      r.requests,
      r.inputTokens,
      r.outputTokens,
      r4(r.costUsd),
      r.requests ? r4(r.costUsd / r.requests) : "",
      r.latencyMs == null ? "" : Math.round(r.latencyMs),
      r4(r.errorRate * 100),
    ]);
    return {
      csv: toCsv(["provider", "model", "requests", "input_tokens", "output_tokens", "cost_usd", "cost_per_request_usd", "avg_latency_ms", "error_rate_pct"], data),
      filename: `observemetrics_models_${suffix}.csv`,
      rows: data.length,
    };
  }

  if (dataset === "teams" || dataset === "applications") {
    const dim = dataset === "teams" ? "team" : "app";
    const names = dataset === "teams" ? teamName : appName;
    const rows = await aggregate(workspaceId, f, [dim]);
    rows.sort((a, b) => b.costUsd - a.costUsd);
    const data = rows.map((r) => [
      r.keys[dim] ? names.get(r.keys[dim]!) ?? r.keys[dim]! : "Unattributed",
      r.requests,
      r.tokens,
      r4(r.costUsd),
      r.requests ? r4(r.costUsd / r.requests) : "",
      r.latencyMs == null ? "" : Math.round(r.latencyMs),
      r4(r.errorRate * 100),
    ]);
    return {
      csv: toCsv([dataset === "teams" ? "team" : "application", "requests", "tokens", "cost_usd", "cost_per_request_usd", "avg_latency_ms", "error_rate_pct"], data),
      filename: `observemetrics_${dataset}_${suffix}.csv`,
      rows: data.length,
    };
  }

  // events: raw normalized usage rows (capped)
  const events = await prisma.usageEvent.findMany({
    where: {
      workspaceId,
      timestamp: { gte: new Date(f.from + "T00:00:00Z"), lt: new Date(Date.parse(f.to + "T00:00:00Z") + 86_400_000) },
      ...(f.providers.length ? { provider: { in: f.providers } } : {}),
      ...(f.teamId ? { teamId: f.teamId } : {}),
      ...(f.applicationId ? { applicationId: f.applicationId } : {}),
      ...(f.model ? { model: f.model } : {}),
    },
    orderBy: { timestamp: "desc" },
    take: 50_000,
  });
  const data = events.map((e) => [
    e.timestamp.toISOString(),
    e.source.toLowerCase(),
    e.provider,
    e.model,
    teamName.get(e.teamId ?? "") ?? "",
    appName.get(e.applicationId ?? "") ?? "",
    e.userRef ?? "",
    e.requestCount,
    e.errorCount,
    num(e.inputTokens),
    num(e.outputTokens),
    r4(e.costUsd),
    e.costSource.toLowerCase(),
    e.latencyMsSum == null || !e.requestCount ? "" : Math.round(e.latencyMsSum / e.requestCount),
    e.status,
    e.errorCode ?? "",
    e.requestId ?? "",
  ]);
  return {
    csv: toCsv(
      ["timestamp", "source", "provider", "model", "team", "application", "user", "requests", "errors", "input_tokens", "output_tokens", "cost_usd", "cost_source", "avg_latency_ms", "status", "error_code", "request_id"],
      data,
    ),
    filename: `observemetrics_events_${suffix}.csv`,
    rows: data.length,
  };
}
