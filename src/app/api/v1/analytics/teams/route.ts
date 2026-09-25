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
  const team = url.searchParams.get("team");

  const limits = planOf(ctx.org.plan);
  const cutoff = retentionCutoff(limits.retentionDays);
  const from = range.from < cutoff ? cutoff : range.from;

  const data = await getOrgAnalytics(ctx.org.id, from, range.to);

  if (team) {
    const t = data.teams.find((x) => x.team === team);
    if (!t) return errors.notFound("Team");
    const models = data.models
      .map((m) => ({ ...m, spendUsd: m.spendUsd * (t.spendUsd > 0 ? t.spendUsd / data.stats.spendUsd : 0) }))
      .filter((m) => m.spendUsd > 0.005)
      .sort((a, b) => b.spendUsd - a.spendUsd);
    const users = data.users.filter((u) => u.team === team);
    return ok({ team: t, models, users, daily: data.daily, providers: data.providers });
  }

  return ok({ teams: data.teams, users: data.users });
});
