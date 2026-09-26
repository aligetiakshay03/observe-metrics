"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useApi } from "@/lib/api-client";
import { useFilters, withRange } from "@/lib/use-filters";
import { fmtUsd, fmtUsd0, prettyModel, providerColor, providerLabel } from "@/lib/format";
import type { CostsView } from "@/lib/types";
import { BasisBadge, Card, Delta, ErrorState, Notice, PageHeader } from "@/components/ui/primitives";
import { BarList, Donut, MonthlyBars, TrendChart, Waterfall } from "@/components/charts";
import { FilterBar, KpiCard, PageSkeleton } from "@/components/dashboard/blocks";
import { EmptyUsage } from "@/components/dashboard/EmptyUsage";

export default function CostsPage() {
  const { query, values } = useFilters();
  const { data, error, loading, refresh } = useApi<CostsView>(`/api/v1/analytics/costs?${query}`);
  const r = (href: string) => withRange(href, values);

  const header = (
    <PageHeader
      title="Costs"
      description="Where AI spend goes, how it's trending and what it's projected to be."
      eyebrow={data ? <BasisBadge basis={data.basis} /> : undefined}
      actions={<FilterBar lookups={data?.lookups} exportDataset={["costs", "models", "teams", "applications"]} />}
    />
  );

  if (loading && !data) return <PageSkeleton />;
  if (error && !data)
    return (
      <>
        {header}
        <div className="card">
          <ErrorState message={error.message} onRetry={refresh} />
        </div>
      </>
    );
  if (!data) return null;
  if (data.empty && !values.provider && !values.team && !values.app)
    return (
      <>
        {header}
        <EmptyUsage />
      </>
    );

  const k = data.kpis;
  const reportedPct = Math.round(k.reportedShare * 100);

  return (
    <div>
      {header}

      {data.basis !== "demo" && (
        <div className="mb-4">
          <Notice tone="info" title={reportedPct >= 99 ? "All costs are provider-reported" : reportedPct > 0 ? `${reportedPct}% of spend is provider-reported` : "Costs are estimates"}>
            {reportedPct >= 99
              ? "Figures come from provider cost APIs for the selected range."
              : "Where a provider doesn't report cost, ObserveMetrics estimates it from recorded tokens and current list prices. Estimates are not invoices."}
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total spend" value={fmtUsd(k.spend.value)} kpi={k.spend} inverse tip="Sum of cost for the selected range. Provider-reported where available, otherwise estimated." />
        <KpiCard
          label="Projected spend"
          value={fmtUsd0(k.projectedMonthlyUsd)}
          sub={<span className="text-faint">{fmtUsd0(k.mtdUsd)} month to date</span>}
          tip="Estimate for this calendar month: month-to-date spend plus the trailing 7-day daily average for the remaining days."
          sparkColor="var(--c2)"
        />
        <KpiCard label="Daily average" value={fmtUsd(k.dailyAvg.value)} kpi={k.dailyAvg} inverse tip="Total spend in range ÷ number of days." sparkColor="var(--c3)" />
        <KpiCard
          label="Potential savings"
          value={k.potentialSavingsUsd > 0 ? `${fmtUsd0(k.potentialSavingsUsd)}/mo` : "—"}
          sub={<span className="text-faint">{k.savingsInsightCount ? `${k.savingsInsightCount} open optimization${k.savingsInsightCount === 1 ? "" : "s"}` : "No open optimizations"}</span>}
          tip="Sum of estimated monthly savings from open optimization insights. Estimates, not guarantees."
          href="/dashboard/insights"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Spend over time" subtitle={`${fmtUsd(k.spend.value)} across ${data.series.length} days`}>
          <TrendChart data={data.series} metric="costUsd" unit="usd" label="Spend" height={268} />
        </Card>
        <Card title="Spend by provider" subtitle="Share of spend in range">
          <Donut
            centerLabel="Spend"
            items={data.byProvider.map((p, i) => ({
              id: p.id,
              label: providerLabel(p.id),
              value: p.costUsd,
              color: providerColor(p.id, i),
              href: withRange(`/dashboard/costs?provider=${p.id}`, values),
            }))}
          />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="What changed" subtitle="Spend vs previous period, by application">
          {data.waterfall.steps.length || data.waterfall.previous || data.waterfall.current ? (
            <Waterfall {...data.waterfall} />
          ) : (
            <p className="py-6 text-center text-sm text-muted">No spend in either period.</p>
          )}
        </Card>
        <Card
          title="Spend by model"
          actions={
            <Link href={r("/dashboard/models")} className="inline-flex items-center gap-1 text-xs font-medium text-accent">
              Compare models <ArrowRight size={12} />
            </Link>
          }
        >
          <BarList
            max={8}
            items={data.models.map((m) => ({
              id: `${m.provider}:${m.model}`,
              label: prettyModel(m.model),
              value: m.costUsd,
              color: providerColor(m.provider),
              href: r(`/dashboard/models/${encodeURIComponent(m.provider)}/${encodeURIComponent(m.model)}`),
            }))}
            secondary={(id) => <Delta value={data.models.find((m) => `${m.provider}:${m.model}` === id)?.change} inverse />}
          />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Spend by team" actions={<Link href={r("/dashboard/teams")} className="text-xs font-medium text-accent">View teams</Link>}>
          <BarList
            color="var(--c2)"
            items={data.teams.map((t) => ({ id: t.id, label: t.name, value: t.costUsd, href: t.id ? r(`/dashboard/teams/${t.id}`) : undefined }))}
            secondary={(id) => <Delta value={data.teams.find((t) => t.id === id)?.change} inverse />}
          />
        </Card>
        <Card title="Spend by application" actions={<Link href={r("/dashboard/applications")} className="text-xs font-medium text-accent">View applications</Link>}>
          <BarList
            color="var(--c3)"
            items={data.apps.map((a) => ({ id: a.id, label: a.name, value: a.costUsd, href: a.id ? r(`/dashboard/applications/${a.id}`) : undefined }))}
            secondary={(id) => <Delta value={data.apps.find((a) => a.id === id)?.change} inverse />}
          />
        </Card>
      </div>

      {data.monthly.length >= 2 && data.filters.days >= 90 && (
        <Card className="mt-4" title="Monthly spend" subtitle="Calendar months within the selected range (first and last may be partial)">
          <MonthlyBars data={data.monthly} />
        </Card>
      )}
    </div>
  );
}
