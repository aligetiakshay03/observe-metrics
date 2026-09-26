"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitCompare, X } from "lucide-react";
import { useApi } from "@/lib/api-client";
import { useFilters, withRange } from "@/lib/use-filters";
import { fmtCompact, fmtMs, fmtNumber, fmtRate, fmtUsd } from "@/lib/format";
import type { Filters, Lookups, ModelRow } from "@/lib/types";
import { Button, Card, cx, Delta, ErrorState, InfoTip, ModelName, PageHeader, ProviderName } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { FilterBar, PageSkeleton } from "@/components/dashboard/blocks";
import { EmptyUsage } from "@/components/dashboard/EmptyUsage";

interface ModelsView {
  filters: Filters;
  lookups: Lookups;
  models: ModelRow[];
  isDemo: boolean;
}

const keyOf = (m: ModelRow) => `${m.provider}:${m.model}`;

export default function ModelsPage() {
  const router = useRouter();
  const { query, values } = useFilters();
  const { data, error, loading, refresh } = useApi<ModelsView>(`/api/v1/analytics/models?${query}`);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const r = (href: string) => withRange(href, values);

  const toggle = (k: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else if (n.size < 4) n.add(k);
      return n;
    });
  const compare = () => router.push(r(`/dashboard/models/compare?m=${encodeURIComponent([...selected].join(","))}`));

  const header = (
    <PageHeader
      title="Models"
      description="Compare cost, usage, latency and reliability across every model you use."
      actions={<FilterBar lookups={data?.lookups} exportDataset="models" show={{ provider: true }} />}
    />
  );

  if (loading && !data) return <PageSkeleton kpis={0} />;
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
  if (!data.models.length && !values.provider)
    return (
      <>
        {header}
        <EmptyUsage title="No model usage yet" />
      </>
    );

  const cols: Column<ModelRow>[] = [
    { key: "model", header: "Model", cell: (m) => <ModelName model={m.model} />, sort: (m) => m.model },
    { key: "provider", header: "Provider", cell: (m) => <ProviderName provider={m.provider} />, sort: (m) => m.provider, hideBelow: "md" },
    { key: "requests", header: "Requests", numeric: true, cell: (m) => fmtNumber(m.requests), sort: (m) => m.requests },
    { key: "tokens", header: "Tokens", numeric: true, cell: (m) => fmtCompact(m.tokens), sort: (m) => m.tokens, hideBelow: "lg" },
    {
      key: "spend",
      header: "Spend",
      numeric: true,
      cell: (m) => (
        <span className="font-medium">
          {fmtUsd(m.costUsd)}
          {!m.priced && m.costUsd === 0 && <span className="ml-1 text-2xs font-normal text-faint">unpriced</span>}
        </span>
      ),
      sort: (m) => m.costUsd,
    },
    { key: "cpr", header: "Cost / req", numeric: true, cell: (m) => fmtUsd(m.costPerRequest), sort: (m) => m.costPerRequest, hideBelow: "md" },
    { key: "latency", header: "Avg latency", numeric: true, cell: (m) => fmtMs(m.latencyMs), sort: (m) => m.latencyMs, hideBelow: "sm" },
    {
      key: "err",
      header: "Error rate",
      numeric: true,
      cell: (m) => <span className={cx(m.errorRate >= 0.02 && "font-medium text-danger")}>{fmtRate(m.errorRate)}</span>,
      sort: (m) => m.errorRate,
      hideBelow: "sm",
    },
    { key: "change", header: "Spend Δ", numeric: true, cell: (m) => <Delta value={m.change} inverse />, sort: (m) => m.change, hideBelow: "lg" },
  ];

  return (
    <div>
      {header}
      <Card
        title="Model comparison"
        subtitle={`${data.models.length} models in range · select up to 4 to compare side by side`}
        bodyClassName="pb-0"
        actions={
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            Latency & errors
            <InfoTip label="About latency and error rate">
              Latency and error rate are measured from instrumented traffic (ingestion API). Provider usage APIs don&apos;t report them, so models synced only from provider billing show “—”.
            </InfoTip>
          </span>
        }
      >
        <DataTable
          caption="Models"
          rows={data.models}
          columns={cols}
          rowKey={keyOf}
          href={(m) => r(`/dashboard/models/${encodeURIComponent(m.provider)}/${encodeURIComponent(m.model)}`)}
          initialSort={{ key: "spend", dir: "desc" }}
          searchable={(m) => `${m.model} ${m.provider}`}
          searchPlaceholder="Search models…"
          pageSize={15}
          selectable={{ selected, onToggle: toggle, max: 4 }}
          toolbar={
            <div className="ml-auto flex items-center gap-2">
              {selected.size > 0 && (
                <Button size="sm" variant="ghost" icon={<X size={13} />} onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              )}
              <Button size="sm" variant="primary" icon={<GitCompare size={13} />} disabled={selected.size < 2} onClick={compare}>
                Compare ({selected.size})
              </Button>
            </div>
          }
        />
      </Card>
      <p className="mt-3 text-xs text-muted">ObserveMetrics measures cost, usage, latency and reliability — not output quality. Validate quality on your own evaluation set before switching models.</p>

      {selected.size >= 2 && (
        <div className="sticky bottom-4 z-30 mt-4 flex justify-center">
          <div className="card flex items-center gap-3 px-3 py-2 shadow-pop">
            <span className="text-sm text-muted">{selected.size} models selected</span>
            <Button size="sm" variant="primary" icon={<GitCompare size={13} />} onClick={compare}>
              Compare
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
