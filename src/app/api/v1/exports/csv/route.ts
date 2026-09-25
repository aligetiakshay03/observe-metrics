import { errors, handler } from "@/lib/api";
import { requireOrgContext } from "@/lib/auth";
import { getOverview, getTokenAnalytics, getCostAnalytics, parseRange, retentionCutoff } from "@/lib/analytics";
import { planOf } from "@/lib/plans";
import { toCsv } from "@/lib/exports";

export const GET = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();

  if (!planOf(ctx.org.plan).exports) {
    return errors.fail403Export();
  }

  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "overview";
  const range = parseRange(url.searchParams);
  const provider = url.searchParams.get("provider");

  const limits = planOf(ctx.org.plan);
  const cutoff = retentionCutoff(limits.retentionDays);
  const effectiveFrom = range.from < cutoff ? cutoff : range.from;

  let rows: Record<string, unknown>[] = [];
  let filename = "export.csv";

  if (view === "tokens") {
    const data = await getTokenAnalytics(ctx.org.id, { from: effectiveFrom, to: range.to }, provider);
    rows = data.byModel.map((m) => ({
      model: m.model,
      provider: m.provider,
      input_tokens: m.inputTokens,
      output_tokens: m.outputTokens,
      total_tokens: m.total,
    }));
    filename = "tokens.csv";
  } else if (view === "costs") {
    const data = await getCostAnalytics(ctx.org.id, { from: effectiveFrom, to: range.to }, provider);
    rows = data.byModel.map((m) => ({
      model: m.model,
      provider: m.provider,
      spend_usd: m.spendUsd.toFixed(2),
    }));
    filename = "costs_by_model.csv";
  } else if (view === "costs_by_team") {
    const data = await getCostAnalytics(ctx.org.id, { from: effectiveFrom, to: range.to }, provider);
    rows = data.byTeam.map((t) => ({
      team: t.team,
      spend_usd: t.spendUsd.toFixed(2),
    }));
    filename = "costs_by_team.csv";
  } else {
    const data = await getOverview(ctx.org.id, { from: effectiveFrom, to: range.to }, provider);
    rows = data.trend.map((t) => ({
      day: t.day,
      spend_usd: t.spendUsd.toFixed(2),
      total_tokens: t.tokens,
    }));
    filename = "overview_daily.csv";
  }

  const csv = toCsv(rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="' + filename + '"',
    },
  });
});

export const dynamic = "force-dynamic";
