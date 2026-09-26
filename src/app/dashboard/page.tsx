"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useApi } from "@/lib/api-client";
import { useFilters, withRange } from "@/lib/use-filters";
import { fmtCompact, fmtMs, fmtNumber, fmtRate, fmtUsd, fmtUsd0, providerColor, providerLabel } from "@/lib/format";
import type { ModelRow, OverviewView } from "@/lib/types";
import { BasisBadge, Card, cx, Delta, ErrorState, ModelName, PageHeader, ProviderName } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { BarList, Donut, TrendChart } from "@/components/charts";
import { FilterBar, InsightCard, KpiCard, PageSkeleton } from "@/components/dashboard/blocks";
import { EmptyUsage } from "@/components/dashboard/EmptyUsage";

export default function OverviewPage() {
  const { query, values } = useFilters();
  const { data, error, loading, refresh } = useApi<OverviewView>(`/api/v1/analytics/overview?${query}`);
  const r = (href: string) => withRange(href, values);

  const header = (
    <PageHeader
      title="Overview"
      description="Monitor AI usage, cost and performance across your organization."
      eyebrow={data ? <BasisBadge basis={data.basis} /> : undefined}
      actions={<FilterBar lookups={data?.lookups} exportDataset={["usage", "costs", "models", "teams", "applications"]} />}
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
  const modelCols: Column<ModelRow>[] = [
    { key: "model", header: "Model", cell: (m) => <ModelName model={m.model} />, sort: (m) => m.model },
    { key: "provider", header: "Provider", cell: (m) => <ProviderName provider={m.provider} />, sort: (m) => m.provider, hideBelow: "md" },
    { key: "requests", header: "Requests", numeric: true, cell: (m) => fmtNumber(m.requests), sort: (m) => m.requests },
    { key: "in", header: "Input tokens", numeric: true, cell: (m) => fmtCompact(m.inputTokens), sort: (m) => m.inputTokens, hideBelow: "lg" },
    { key: "out", header: "Output tokens", numeric: true, cell: (m) => fmtCompact(m.outputTokens), sort: (m) => m.outputTokens, hideBelow: "lg" },
    { key: "spend", header: "Spend", numeric: true, cell: (m) => <span className="font-medium">{fmtUsd(m.costUsd)}</span>, sort: (m) => m.costUsd },
    { key: "latency", header: "Avg latency", numeric: true, cell: (m) => fmtMs(m.latencyMs), sort: (m) => m.latencyMs, hideBelow: "sm" },
    {
      key: "err",
      header: "Error rate",
      numeric: true,
      cell: (m) => <span className={cx(m.errorRate >= 0.02 && "font-medium text-danger")}>{fmtRate(m.errorRate)}</span>,
      sort: (m) => m.errorRate,
      hideBelow: "sm",
    },
  ];

  return (
    <div>
      {header}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Total AI spend" value={fmtUsd(k.spend.value)} kpi={k.spend} inverse tip="Sum of cost for the selected range. Provider-reported where available, otherwise estimated from tokens × list price." href={r("/dashboard/costs")} />
        <KpiCard label="Requests" value={fmtNumber(k.requests.value)} kpi={k.requests} tip="Model requests recorded by instrumented apps and providers that report request counts." sparkColor="var(--c3)" href={r("/dashboard/usage")} />
        <KpiCard label="Tokens" value={fmtCompact(k.tokens.value)} kpi={k.tokens} tip="Input + output tokens across all providers." sparkColor="var(--c2)" href={r("/dashboard/usage")} />
        <KpiCard
          label="Avg latency"
          value={k.latencyMeasured ? fmtMs(k.latencyMs.value) : "—"}
          kpi={k.latencyMeasured ? k.latencyMs : undefined}
          sub={<span className="text-faint">Send latency_ms via the ingestion API</span>}
          inverse
          tip="Request-weighted average latency measured by instrumented applications. Provider usage APIs don't report latency."
          sparkColor="var(--c4)"
          href={r("/dashboard/models")}
        />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MiniStat label="Projected monthly spend" value={fmtUsd0(k.projectedMonthlyUsd)} tip="Estimate: month-to-date spend plus the trailing 7-day daily average for the remaining days of the month." href={r("/dashboard/costs")} />
        <MiniStat
          label="Potential savings"
          value={k.potentialSavingsUsd > 0 ? `${fmtUsd0(k.potentialSavingsUsd)}/mo` : "—"}
          tip="Sum of estimated monthly savings from open optimization insights. Estimates, not guarantees."
          sub={k.savingsInsightCount ? `${k.savingsInsightCount} optimization ${k.savingsInsightCount === 1 ? "insight" : "insights"}` : "No open optimizations"}
          tone="success"
          href="/dashboard/insights"
        />
        <MiniStat label="Error rate" value={fmtRate(k.errorRate.value)} delta={<Delta value={k.errorRate.change} inverse />} tip="Failed requests ÷ total requests in the selected range." href={r("/dashboard/models")} />
      </div>

      {/* Spend over time + providers */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="AI spend over time"
          subtitle={`${fmtUsd(k.spend.value)} across ${data.series.length} days`}
          actions={
            <Link href={r("/dashboard/costs")} className="inline-flex items-center gap-1 text-xs font-medium text-accent">
              Cost breakdown <ArrowRight size={12} />
            </Link>
          }
        >
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

      {/* Insights */}
      <Card
        className="mt-4"
        title="AI insights"
        subtitle="Anomalies and optimizations detected from your usage"
        actions={
          <Link href="/dashboard/insights" className="inline-flex items-center gap-1 text-xs font-medium text-accent">
            All insights <ArrowRight size={12} />
          </Link>
        }
      >
        {data.insights.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {data.insights.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted">No open insights. ObserveMetrics checks for anomalies and optimizations every time new usage arrives.</p>
        )}
      </Card>

      {/* Model performance */}
      <Card
        className="mt-4"
        title="Model performance"
        subtitle="Usage, spend and measured performance per model"
        bodyClassName="pb-0"
        actions={
          <Link href={r("/dashboard/models")} className="inline-flex items-center gap-1 text-xs font-medium text-accent">
            Compare models <ArrowRight size={12} />
          </Link>
        }
      >
        <DataTable
          caption="Model performance"
          rows={data.models}
          columns={modelCols}
          rowKey={(m) => `${m.provider}:${m.model}`}
          href={(m) => r(`/dashboard/models/${encodeURIComponent(m.provider)}/${encodeURIComponent(m.model)}`)}
          initialSort={{ key: "spend", dir: "desc" }}
          searchable={(m) => `${m.model} ${m.provider}`}
          searchPlaceholder="Search models…"
          pageSize={8}
        />
      </Card>

      {/* Teams & applications */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Spend by team" actions={<Link href={r("/dashboard/teams")} className="text-xs font-medium text-accent">View teams</Link>}>
          <BarList
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
    </div>
  );
}

function MiniStat({ label, value, tip, sub, delta, tone, href }: { label: string; value: string; tip: string; sub?: string; delta?: React.ReactNode; tone?: "success"; href?: string }) {
  const body = (
    <div className="card flex h-full items-center justify-between gap-3 px-4 py-3 transition-colors hover:border-border-strong">
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-2xs font-medium uppercase tracking-wide text-muted" title={tip}>
          {label}
        </p>
        <p className={cx("mt-1 text-lg font-semibold tabular-nums", tone === "success" && value !== "—" && "text-success")}>{value}</p>
      </div>
      <div className="text-right text-xs text-muted">{delta ?? sub}</div>
    </div>
  );
  return href ? <Link href={href} className="block rounded-lg" aria-label={`${label}: ${value}. ${tip}`}>{body}</Link> : body;
}
