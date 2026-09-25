"use client";

import { useEffect, useState } from "react";
import { useSession } from "../../providers";
import {
  ChartCard, SectionHeader, DataTable, PageSkeleton, EmptyState, RangePicker,
  fmtUsd, fmtCompact, fmtPct,
  type Column,
} from "@/components/ui";
import { RankedBars } from "@/components/charts";

interface AppRow {
  app: string;
  requests: number;
  tokens: number;
  spendUsd: number;
  latencyMs: number;
  errorRate: number;
}

const cols: Column<AppRow>[] = [
  { key: "app", header: "Application", render: (a) => <span className="font-medium">{a.app}</span> },
  { key: "requests", header: "Requests", numeric: true, render: (a) => fmtCompact(a.requests) },
  { key: "tokens", header: "Tokens", numeric: true, render: (a) => fmtCompact(a.tokens) },
  { key: "spend", header: "Spend", numeric: true, render: (a) => <span className="font-semibold">{fmtUsd(a.spendUsd)}</span> },
  { key: "latency", header: "Avg latency", numeric: true, render: (a) => (a.latencyMs / 1000).toFixed(2) + "s" },
  { key: "errors", header: "Error rate", numeric: true, render: (a) => (
      <span style={{ color: a.errorRate > 0.5 ? "var(--warning)" : undefined }}>{fmtPct(a.errorRate)}</span>
    ) },
];

export default function ApplicationsPage() {
  const { me, loading: sessionLoading } = useSession();
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<AppRow[] | null>(null);

  useEffect(() => {
    if (sessionLoading || !me) return;
    const params = new URLSearchParams({ from: isoDaysAgo(days), to: isoToday() });
    fetch("/api/v1/analytics/applications?" + params.toString(), { cache: "no-store" })
      .then(async (res) => (res.ok ? (await res.json()).data.applications : []))
      .then(setRows)
      .catch(() => setRows([]));
  }, [me, sessionLoading, days]);

  if (sessionLoading) return <PageSkeleton />;

  return (
    <div>
      <SectionHeader
        title="Applications"
        subtitle="Cost and performance of the AI workflows inside your products."
        actions={<RangePicker value={days} onChange={setDays} />}
      />

      {rows !== null && rows.length === 0 ? (
        <EmptyState
          title="No application usage yet"
          body="Applications are derived from your model usage patterns — connect a provider to populate this view."
          ctaHref="/dashboard/settings"
          ctaLabel="Connect provider"
        />
      ) : (
        <>
          <div className="surface mb-4 p-2">
            <DataTable columns={cols} rows={rows ?? []} rowKey={(a) => a.app} emptyMessage="No data" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Spend by application">
              <RankedBars data={(rows ?? []).map((a) => ({ name: a.app, value: a.spendUsd }))} color="#8b5cf6" />
            </ChartCard>
            <ChartCard title="Requests by application">
              <RankedBars data={(rows ?? []).map((a) => ({ name: a.app, value: a.requests }))} currency={false} color="#06b6d4" />
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
