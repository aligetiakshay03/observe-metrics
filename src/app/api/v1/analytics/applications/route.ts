import { ok, errors, handler } from "@/lib/api";
import { requireOrgContext } from "@/lib/auth";
import { getOrgAnalytics } from "@/lib/insights";
import { parseRange, retentionCutoff } from "@/lib/analytics";
import { planOf } from "@/lib/plans";

export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  const ctx = await requireOrgContext(req);
  if (!ctx) return errors.unauthorized();

  const url = new URL(req.url);
  const range = parseRange(url.searchParams);

  const limits = planOf(ctx.org.plan);
  const cutoff = retentionCutoff(limits.retentionDays);
  const from = range.from < cutoff ? cutoff : range.from;

  const data = await getOrgAnalytics(ctx.org.id, from, range.to);
  return ok({ applications: data.applications, stats: data.stats });
});
