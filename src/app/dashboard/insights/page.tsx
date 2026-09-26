"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { useApi } from "@/lib/api-client";
import { fmtUsd0 } from "@/lib/format";
import type { InsightSummary } from "@/lib/types";
import { cx, EmptyState, ErrorState, Notice, PageHeader, Skeleton } from "@/components/ui/primitives";
import { InsightCard, insightTypeLabel } from "@/components/dashboard/blocks";

const TYPES = ["cost_anomaly", "usage_spike", "latency_regression", "error_spike", "provider_outage", "oversized_context", "high_cost_model", "duplicate_requests", "budget_threshold"];
type Status = "OPEN" | "DISMISSED" | "RESOLVED";

export default function InsightsPage() {
  const [status, setStatus] = useState<Status>("OPEN");
  const [type, setType] = useState("");
  const [severity, setSeverity] = useState("");
  const qs = new URLSearchParams({ status });
  if (type) qs.set("type", type);
  if (severity) qs.set("severity", severity);
  const { data, error, loading, refresh } = useApi<{ insights: InsightSummary[]; isDemo: boolean }>(`/api/v1/insights?${qs}`);

  const list = data?.insights ?? [];
  const increases = list.filter((i) => i.impactKind === "cost_increase").reduce((a, i) => a + (i.estimatedImpactUsd ?? 0), 0);
  const savings = list.filter((i) => i.impactKind === "savings").reduce((a, i) => a + (i.estimatedImpactUsd ?? 0), 0);
  const risks = list.filter((i) => i.impactKind === "risk").length;

  return (
    <div>
      <PageHeader title="Insights" description="Anomalies, regressions and optimization opportunities detected from your AI usage." />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Strip label="Est. monthly cost increase" value={increases ? `+${fmtUsd0(increases)}` : "—"} tone={increases ? "danger" : undefined} />
        <Strip label="Est. monthly savings available" value={savings ? fmtUsd0(savings) : "—"} tone={savings ? "success" : undefined} />
        <Strip label="Reliability & budget risks" value={String(risks)} tone={risks ? "warning" : undefined} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex h-8 rounded-md border border-border bg-surface p-0.5 shadow-xs" role="radiogroup" aria-label="Insight status">
          {(["OPEN", "DISMISSED", "RESOLVED"] as Status[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)} className={cx("rounded-[4px] px-3 text-xs font-medium capitalize", status === s ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}>
              {s.toLowerCase()}
            </button>
          ))}
        </div>
        <select className="select h-8 w-auto py-0 text-xs" value={type} onChange={(e) => setType(e.target.value)} aria-label="Insight type">
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {insightTypeLabel(t)}
            </option>
          ))}
        </select>
        <select className="select h-8 w-auto py-0 text-xs" value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity">
          <option value="">All severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="WARNING">Warning</option>
          <option value="INFO">Info</option>
        </select>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card space-y-3 p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      ) : error && !data ? (
        <div className="card">
          <ErrorState message={error.message} onRetry={refresh} />
        </div>
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Lightbulb size={18} />}
            title={status === "OPEN" ? "No open insights" : `No ${status.toLowerCase()} insights`}
            body={
              status === "OPEN"
                ? "ObserveMetrics runs its detection rules whenever new usage arrives. Cost anomalies, latency or error regressions and optimization opportunities will appear here."
                : "Insights you dismiss or resolve are kept here for reference."
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </div>
      )}

      <div className="mt-4">
        <Notice tone="info">Insights are produced by deterministic rules over your usage data (no ML model). Impact figures are estimates based on recent run-rates and list prices.</Notice>
      </div>
    </div>
  );
}

function Strip({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" | "warning" }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-2xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cx("mt-1 text-lg font-semibold tabular-nums", tone === "danger" && "text-danger", tone === "success" && "text-success", tone === "warning" && "text-warning")}>{value}</p>
    </div>
  );
}
