import { ok, errors, handler } from "@/lib/api";
import { requireOrgContext } from "@/lib/auth";
import { getCostAnalytics, parseRange, retentionCutoff } from "@/lib/analytics";
import { planOf } from "@/lib/plans";

export const GET = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();

  const url = new URL(req.url);
  const range = parseRange(url.searchParams);
  const provider = url.searchParams.get("provider");

  const limits = planOf(ctx.org.plan);
  const cutoff = retentionCutoff(limits.retentionDays);
  const effectiveFrom = range.from < cutoff ? cutoff : range.from;
  if (effectiveFrom > range.to) {
    return ok({
      byModel: [],
      byTeam: [],
      monthly: [],
      forecast: [],
      totals: { spendUsd: 0, avgCostPerRequest: 0 },
    });
  }

  const data = await getCostAnalytics(ctx.org.id, { from: effectiveFrom, to: range.to }, provider);
  return ok(data);
});
