"use client";

import { Boxes, ListFilter } from "lucide-react";
import { useApi } from "@/lib/api-client";
import { useFilters, withRange } from "@/lib/use-filters";
import { fmtCompact, fmtDate, fmtMs, fmtNumber, fmtRate, fmtUsd, prettyModel } from "@/lib/format";
import type { ModelDetailView } from "@/lib/types";
import { BasisBadge, ButtonLink, Card, EmptyState, ErrorState, PageHeader, ProviderName } from "@/components/ui/primitives";
import { BarList, TrendChart } from "@/components/charts";
import { InsightCard, KpiCard, PageSkeleton, RangePicker } from "@/components/dashboard/blocks";

export default function ModelDetailPage({ params }: { params: { provider: string; model: string } }) {
  const provider = decodeURIComponent(params.provider);
  const model = decodeURIComponent(params.model);
  const { values } = useFilters();
  const q = new URLSearchParams({ provider, id: model });
  for (const k of ["range", "from", "to"] as const) if (values[k]) q.set(k, values[k]!);
  const { data, error, loading, refresh } = useApi<ModelDetailView>(`/api/v1/analytics/models/detail?${q}`);
  const r = (href: string) => withRange(href, values);
  const requestsHref = r(`/dashboard/requests?provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}`);

  const header = (
    <PageHeader
      back={{ href: r("/dashboard/models"), label: "Models" }}
      title={prettyModel(model)}
      description={
        <span className="inline-flex flex-wrap items-center gap-x-2">
          <ProviderName provider={provider} /> <span className="font-mono text-xs text-faint">{model}</span>
        </span>
      }
      eyebrow={data ? <BasisBadge basis={data.basis} /> : undefined}
      actions={
        <>
          <RangePicker />
          <ButtonLink href={requestsHref} icon={<ListFilter size={14} />}>
            View requests
          </ButtonLink>
        </>
      }
    />
  );

  if (loading && !data) return <PageSkeleton kpis={6} />;
  if (error?.status === 404)
    return (
      <>
        {header}
        <div className="card">
          <EmptyState
            icon={<Boxes size={18} />}
            title="No usage recorded for this model"
            body="This model hasn't appeared in this workspace's usage data."
            actions={<ButtonLink href="/dashboard/models" variant="primary">Back to models</ButtonLink>}
          />
        </div>
      </>
    );
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

  const t = data.totals;
  const c = data.change;
  const kpi = (value: number, change: number | null) => ({ value, prev: 0, change, spark: [] });

  return (
    <div>
      {header}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Spend" value={fmtUsd(t.costUsd)} kpi={kpi(t.costUsd, c.costUsd)} inverse tip="Cost for this model in the selected range." />
        <KpiCard label="Requests" value={fmtNumber(t.requests)} kpi={kpi(t.requests, c.requests)} tip="Requests recorded for this model." />
        <KpiCard label="Tokens" value={fmtCompact(t.tokens)} kpi={kpi(t.tokens, c.tokens)} tip="Input + output tokens." />
        <KpiCard
          label="Avg latency"
          value={fmtMs(t.latencyMs)}
          kpi={t.latencyMs != null ? kpi(t.latencyMs, c.latencyMs) : undefined}
          sub={<span className="text-faint">Not measured</span>}
          inverse
          tip="Request-weighted average latency from instrumented traffic."
        />
        <KpiCard label="Error rate" value={fmtRate(t.errorRate)} kpi={kpi(t.errorRate, c.errorRate)} inverse tip="Failed requests ÷ total requests." />
        <KpiCard label="Cost / request" value={fmtUsd(t.costPerRequest)} sub={<span className="text-faint">in range</span>} tip="Spend ÷ requests." />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Spend over time">
          <TrendChart data={data.series} metric="costUsd" unit="usd" label="Spend" height={240} />
        </Card>
        <Card title="List price" subtitle="From the ObserveMetrics pricing catalog">
          {data.price ? (
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Input / 1M tokens</dt>
                <dd className="font-medium tabular-nums">{fmtUsd(data.price.inputPer1M)}</dd>
              </div>
              {data.price.cachedInputPer1M != null && (
                <div className="flex justify-between">
                  <dt className="text-muted">Cached input / 1M</dt>
                  <dd className="font-medium tabular-nums">{fmtUsd(data.price.cachedInputPer1M)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">Output / 1M tokens</dt>
                <dd className="font-medium tabular-nums">{fmtUsd(data.price.outputPer1M)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Effective from</dt>
                <dd className="tabular-nums">{fmtDate(data.price.effectiveFrom, { month: "short", day: "numeric", year: "numeric" })}</dd>
              </div>
              <p className="border-t border-border pt-2.5 text-xs text-muted">Source: {data.price.verified}. Used for estimated costs when the provider doesn&apos;t report cost.</p>
            </dl>
          ) : (
            <p className="py-4 text-sm text-muted">No list price in catalog — costs shown only when provider-reported.</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Average latency" subtitle="Measured requests only">
          <TrendChart data={data.series} metric="latencyMs" unit="ms" label="Avg latency" color="var(--c4)" height={200} />
        </Card>
        <Card title="Error rate">
          <TrendChart data={data.series.map((p) => ({ ...p, errorRate: p.errorRate * 100 }))} metric="errorRate" unit="pct" label="Error rate" color="var(--c2)" height={200} />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Applications using this model">
          <BarList color="var(--c3)" items={data.apps.map((a) => ({ id: a.id, label: a.name, value: a.costUsd, href: a.id ? r(`/dashboard/applications/${a.id}`) : undefined }))} />
        </Card>
        <Card title="Teams using this model">
          <BarList color="var(--c2)" items={data.teams.map((tm) => ({ id: tm.id, label: tm.name, value: tm.costUsd, href: tm.id ? r(`/dashboard/teams/${tm.id}`) : undefined }))} />
        </Card>
      </div>

      <Card className="mt-4" title="Related insights">
        {data.insights.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.insights.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted">No insights for this model.</p>
        )}
      </Card>
    </div>
  );
}
