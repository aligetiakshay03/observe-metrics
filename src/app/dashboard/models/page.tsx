"use client";

import { useEffect, useState } from "react";
import { useSession } from "../../providers";
import {
  ChartCard, SectionHeader, DataTable, ProviderBadge, ModelBadge, PageSkeleton,
  EmptyState, FilterDropdown, PROVIDER_FILTER_OPTIONS, RangePicker,
  fmtUsd, fmtCompact, fmtPct,
  type Column,
} from "@/components/ui";
import { RankedBars } from "@/components/charts";

interface ModelRow {
  model: string;
  provider: string;
  requests: number;
  tokens: number;
  spendUsd: number;
  latencyMs: number;
  errorRate: number;
  costPerRequest: number;
}

const cols: Column<ModelRow>[] = [
  { key: "model", header: "Model", render: (m) => <ModelBadge model={m.model} /> },
  { key: "provider", header: "Provider", render: (m) => <ProviderBadge provider={m.provider} /> },
  { key: "cost", header: "Spend", numeric: true, render: (m) => <span className="font-semibold">{fmtUsd(m.spendUsd)}</span> },
  { key: "cpr", header: "Cost / request", numeric: true, render: (m) => "$" + m.costPerRequest.toFixed(3) },
  { key: "latency", header: "Latency", numeric: true, render: (m) => (
      <span style={{ color: m.latencyMs <= 1200 ? "var(--success)" : m.latencyMs >= 3000 ? "var(--warning)" : undefined }}>
        {(m.latencyMs / 1000).toFixed(2)}s
      </span>
    ) },
  { key: "requests", header: "Requests", numeric: true, render: (m) => fmtCompact(m.requests) },
  { key: "tokens", header: "Tokens", numeric: true, render: (m) => fmtCompact(m.tokens) },
  { key: "errors", header: "Error rate", numeric: true, render: (m) => (
      <span style={{ color: m.errorRate > 0.5 ? "var(--warning)" : undefined }}>{fmtPct(m.errorRate)}</span>
    ) },
];

export default function ModelsPage() {
  const { me, loading: sessionLoading } = useSession();
  const [days, setDays] = useState(30);
  const [provider, setProvider] = useState("");
  const [rows, setRows] = useState<ModelRow[] | null>(null);

  useEffect(() => {
    if (sessionLoading || !me) return;
    const params = new URLSearchParams({ from: isoDaysAgo(days), to: isoToday() });
    if (provider) params.set("provider", provider);
    fetch("/api/v1/analytics/models?" + params.toString(), { cache: "no-store" })
      .then(async (res) => (res.ok ? (await res.json()).data.models : []))
      .then(setRows)
      .catch(() => setRows([]));
  }, [me, sessionLoading, days, provider]);

  if (sessionLoading) return <PageSkeleton />;

  const filtered = (rows ?? []).filter((m) => !provider || m.provider === provider);
  const cheapest = [...filtered].sort((a, b) => a.costPerRequest - b.costPerRequest)[0];
  const fastest = [...filtered].sort((a, b) => a.latencyMs - b.latencyMs)[0];

  return (
    <div>
      <SectionHeader
        title="Models"
        subtitle="Compare cost, latency and reliability across every model you use."
        actions={
          <>
            <FilterDropdown value={provider} onChange={setProvider} options={PROVIDER_FILTER_OPTIONS} allLabel="All providers" />
            <RangePicker value={days} onChange={setDays} />
          </>
        }
      />

      {rows !== null && rows.length === 0 ? (
        <EmptyState
          title="No model usage yet"
          body="Model comparisons appear after your first usage sync."
          ctaHref="/dashboard/settings"
          ctaLabel="Connect provider"
        />
      ) : (
        <>
          {/* Comparison highlights */}
          {cheapest && fastest && (
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="surface flex items-center justify-between px-4 py-3">
                <div>
                  <span className="label">Cheapest per request</span>
                  <div className="mt-1 text-[15px] font-semibold">{cheapest.model}</div>
                </div>
                <span className="badge badge-success">${cheapest.costPerRequest.toFixed(3)}/req</span>
              </div>
              <div className="surface flex items-center justify-between px-4 py-3">
                <div>
                  <span className="label">Fastest</span>
                  <div className="mt-1 text-[15px] font-semibold">{fastest.model}</div>
                </div>
                <span className="badge badge-accent">{(fastest.latencyMs / 1000).toFixed(2)}s</span>
              </div>
            </div>
          )}

          <div className="surface mb-4 p-2">
            <DataTable columns={cols} rows={filtered} rowKey={(m) => m.model} emptyMessage="No models match this filter" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Spend by model">
              <RankedBars data={filtered.map((m) => ({ name: m.model, value: m.spendUsd }))} />
            </ChartCard>
            <ChartCard title="Latency by model" subtitle="Lower is better">
              <RankedBars data={filtered.map((m) => ({ name: m.model, value: m.latencyMs }))} currency={false} color="#06b6d4" />
            </ChartCard>
          </div>
        </>
      )}
    </div>
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
