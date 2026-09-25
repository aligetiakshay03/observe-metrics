import { errors, handler } from "@/lib/api";
import { requireOrgContext } from "@/lib/auth";
import { getOverview, getCostAnalytics, retentionCutoff, lastNDays } from "@/lib/analytics";
import { planOf } from "@/lib/plans";
import { buildMonthlySummaryPdf } from "@/lib/exports";

export const GET = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();

  if (!planOf(ctx.org.plan).exports) return errors.fail403Export();

  const url = new URL(req.url);
  const now = new Date();
  const monthParam = url.searchParams.get("month"); // YYYY-MM
  let range = lastNDays(30);
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number) as [number, number];
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    range = { from, to };
  }

  const limits = planOf(ctx.org.plan);
  const cutoff = retentionCutoff(limits.retentionDays);
  const effectiveFrom = range.from < cutoff ? cutoff : range.from;

  const overview = await getOverview(ctx.org.id, { from: effectiveFrom, to: range.to });
  const costs = await getCostAnalytics(ctx.org.id, { from: effectiveFrom, to: range.to });

  const fmt = (usd: number) => "$" + usd.toFixed(2);
  const topModels = costs.byModel.slice(0, 5);
  const topTeams = costs.byTeam.slice(0, 5);

  const pdf = buildMonthlySummaryPdf({
    title: "ObserveMetrics — Monthly AI Spend Summary",
    subtitle:
      ctx.org.name + " · " + range.from.toISOString().slice(0, 10) + " to " + range.to.toISOString().slice(0, 10),
    sections: [
      {
        heading: "Headline",
        rows: [
          ["Total spend", fmt(overview.totals.spendUsd)],
          ["Total requests", overview.totals.requests.toLocaleString("en-US")],
          ["Input tokens", overview.totals.inputTokens.toLocaleString("en-US")],
          ["Output tokens", overview.totals.outputTokens.toLocaleString("en-US")],
          ["Avg cost / request", fmt(costs.totals.avgCostPerRequest)],
        ],
      },
      {
        heading: "Top models by spend",
        rows: topModels.map((m) => [m.provider + " · " + m.model, fmt(m.spendUsd)]),
      },
      {
        heading: "Top teams by spend",
        rows: topTeams.length
          ? topTeams.map((t) => [t.team, fmt(t.spendUsd)])
          : [["No team tagging configured", "—"]],
      },
      {
        heading: "Month-over-month",
        rows: costs.monthly.slice(-6).map((m) => [m.month, fmt(m.spendUsd)]),
      },
    ],
  });

  const monthLabel = monthParam ?? now.toISOString().slice(0, 7);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="summary-' + monthLabel + '.pdf"',
    },
  });
});

export const dynamic = "force-dynamic";
