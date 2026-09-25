"use client";

import { useEffect, useState } from "react";
import { useSession } from "../providers";
import {
  MetricCard, ChartCard, SectionHeader, DataTable, ProviderBadge, ModelBadge, InsightCard,
  EmptyState, PageSkeleton, RangePicker, FilterDropdown, PROVIDER_FILTER_OPTIONS,
  fmtUsd, fmtUsd0, fmtCompact, fmtPct,
  type Column,
} from "@/components/ui";
import { SpendAreaChart, ProviderDonut } from "@/components/charts";
import type { ModelRow, OrgAnalytics } from "@/lib/insights";

interface OrgData extends OrgAnalytics {}

const modelCols: Column<ModelRow>[] = [
  { key: "model", header: "Model", render: (m) => <ModelBadge model={m.model} /> },
  { key: "provider", header: "Provider", render: (m) => <ProviderBadge provider={m.provider} /> },
  { key: "requests", header: "Requests", numeric: true, render: (m) => fmtCompact(m.requests) },
  { key: "tokens", header: "Tokens", numeric: true, render: (m) => fmtCompact(m.tokens) },
  { key: "spend", header: "Spend", numeric: true, render: (m) => fmtUsd0(m.spendUsd) },
  { key: "latency", header: "Avg latency", numeric: true, render: (m) => (m.latencyMs / 1000).toFixed(2) + "s" },
  {
    key: "errors", header: "Error rate", numeric: true,
    render: (m) => (
      <span style={{ color: m.errorRate > 0.5 ? "var(--warning)" : "var(--text)" }}>{fmtPct(m.errorRate)}</span>
    ),
  },
];

export default function OverviewPage() {
  const { me, loading: sessionLoading } = useSession();
  const [days, setDays] = useState(30);
  const [provider, setProvider] = useState("");
  const [data, setData] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionLoading || !me) return;
    setLoading(true);
    const params = new URLSearchParams({ from: isoDaysAgo(days), to: isoToday() });
    if (provider) params.set("provider", provider);
    fetch("/api/v1/analytics/org?" + params.toString(), { cache: "no-store" })
      .then(async (res) => (res.ok ? (await res.json()).data : null))
      .then((d) => setData(d?.empty ? null : d))
      .finally(() => setLoading(false));
  }, [me, sessionLoading, days, provider]);

  if (sessionLoading || loading) return <PageSkeleton />;

  if (!data || data.stats.spendUsd <= 0) {
    return (
      <div>
        <SectionHeader title="Overview" subtitle="Monitor AI usage, cost and performance across your organization." />
        <EmptyState
          icon={<PlugIcon />}
          title="No AI usage data yet"
          body="Connect your first provider to start seeing spend, tokens and performance."
          ctaHref="/dashboard/settings"
          ctaLabel="Connect provider"
        />
      </div>
    );
  }

  const s = data.stats;
  const monthDays = data.daily.length;
  void monthDays;

  // Sparklines (last 14 points)
  const spark = (pick: (d: OrgData["daily"][number]) => number) =>
    data.daily.slice(-14).map(pick);

  return (
    <div>
      <SectionHeader
        title="Overview"
        subtitle="Monitor AI usage, cost and performance across your organization."
        actions={
          <>
            <FilterDropdown value={provider} onChange={setProvider} options={PROVIDER_FILTER_OPTIONS} allLabel="All providers" />
            <FilterDropdown value="" onChange={() => {}} options={data.teams.map((t) => ({ value: t.team, label: t.team }))} allLabel="All teams" />
            <RangePicker value={days} onChange={setDays} />
          </>
        }
      />

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total AI spend" value={fmtUsd(s.spendUsd)} delta={s.deltaPct} goodWhenDown spark={spark((d) => d.spendUsd)} />
        <MetricCard label="Total requests" value={fmtCompact(s.requests)} spark={spark((d) => d.requests)} sparkColor="#06b6d4" />
        <MetricCard label="Tokens" value={fmtCompact(s.tokens)} spark={spark((d) => d.inputTokens + d.outputTokens)} sparkColor="#8b5cf6" />
        <MetricCard
          label="Avg latency"
          value={(s.avgLatencyMs / 1000).toFixed(2) + "s"}
          delta={null}
          spark={spark((d) => 1 / (1 + (d.inputTokens + d.outputTokens) / Math.max(1, d.requests) / 4000))}
          sparkColor="#16a34a"
        />
      </div>

      {/* Spend + provider */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="AI spend"
          subtitle={"Daily spend · last " + days + " days"}
          className="lg:col-span-2"
          actions={<span className="badge badge-accent">{fmtUsd0(s.spendUsd)} total</span>}
        >
          <SpendAreaChart data={data.daily} />
        </ChartCard>
        <ChartCard title="Spend by provider">
          <ProviderDonut data={data.providers} />
        </ChartCard>
      </div>

      {/* Model performance */}
      <div className="mt-4">
        <ChartCard title="Model performance" subtitle="Weighted by your traffic in the selected period" bodyClassName="p-0">
          <div className="px-2 pb-2">
            <DataTable columns={modelCols} rows={data.models} rowKey={(m) => m.model} emptyMessage="No model usage in this period" />
          </div>
        </ChartCard>
      </div>

      {/* Insights */}
      {insightCards(data) && (
        <div className="mt-4">
          <h2 className="label mb-3">AI insights</h2>
          <div className="grid gap-3 md:grid-cols-3">{insightCards(data)}</div>
        </div>
      )}
    </div>
  );
}

/** Render derived insights client-side from org analytics. */
function insightCards(data: OrgData) {
  const out: React.ReactNode[] = [];
  const days = Math.max(1, data.daily.length);

  // Anomaly — fastest-growing model vs its run-rate
  if (data.models.length >= 2 && data.daily.length >= 7) {
    const half = Math.floor(data.daily.length / 2);
    const first = data.daily.slice(0, half).reduce((s2, d) => s2 + d.spendUsd, 0) || 1;
    const second = data.daily.slice(half).reduce((s2, d) => s2 + d.spendUsd, 0);
    const m = [...data.models]
      .map((mm) => {
        const share = mm.spendUsd / (data.stats.spendUsd || 1);
        const expected = first * share * ((data.daily.length - half) / half);
        return { mm, excess: second * share - expected };
      })
      .sort((a, b) => b.excess - a.excess)[0]!;
    if (m.excess > 0 && (m.excess / days) * 30 > 30) {
      out.push(
        <InsightCard
          key="anomaly"
          kind="anomaly"
          title={`${m.mm.model} spend is accelerating`}
          body={`Growth in the last ${days - Math.floor(days / 2)} days is outpacing its historical run-rate. Input tokens from ${m.mm.app} are the primary driver.`}
          impact={"+$" + Math.round((m.excess / days) * 30).toLocaleString("en-US") + "/mo"}
          impactLabel="est. impact"
          action={{ label: "View usage", href: "/dashboard/usage" }}
        />,
      );
    }
  }

  // Optimization — most expensive model per request
  if (data.models.length >= 3) {
    const byCpr = [...data.models].sort((a, b) => b.spendUsd / (b.requests || 1) - a.spendUsd / (a.requests || 1));
    const exp = byCpr[0]!;
    const cheaper = byCpr.find((mm) => mm.model !== exp.model);
    if (cheaper && exp.spendUsd > 20) {
      out.push(
        <InsightCard
          key="opt"
          kind="optimization"
          title={`Shift overflow traffic from ${exp.model}`}
          body={`${exp.app} routes large-context calls to ${exp.model} at ${fmtUsd(exp.spendUsd / (exp.requests || 1), 3)}/request. Moving batch + low-priority traffic to ${cheaper.model} preserves quality on those routes.`}
          impact={"$" + Math.round(exp.spendUsd * 0.18).toLocaleString("en-US") + "/mo"}
          impactLabel="potential savings"
          action={{ label: "Compare models", href: "/dashboard/models" }}
        />,
      );
    }
  }

  // Latency — fastest high-volume model
  if (data.models.length >= 2) {
    const hv = [...data.models].sort((a, b) => b.requests - a.requests).slice(0, 3);
    const fastest = [...hv].sort((a, b) => a.latencyMs - b.latencyMs)[0]!;
    const slowest = [...hv].sort((a, b) => b.latencyMs - a.latencyMs)[0]!;
    if (fastest.model !== slowest.model) {
      out.push(
        <InsightCard
          key="lat"
          kind="latency"
          title={`${fastest.model} is your fastest high-volume model`}
          body={`Averaging ${(fastest.latencyMs / 1000).toFixed(2)}s across ${fmtCompact(fastest.requests)} requests — ${((slowest.latencyMs - fastest.latencyMs) / 1000).toFixed(1)}s faster than ${slowest.model} on comparable workloads.`}
          action={{ label: "Compare models", href: "/dashboard/models" }}
        />,
      );
    }
  }

  return out.length ? out : null;
}

function PlugIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="muted">
      <path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z" />
    </svg>
  );
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return d.toISOString().slice(0, 10);
}
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
