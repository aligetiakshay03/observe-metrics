"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Download, Lightbulb, TrendingUp, Gauge, AlertOctagon, PiggyBank, Wallet, Server } from "lucide-react";
import { Button, Card, cx, Delta, InfoTip, SeverityBadge, Skeleton, Sparkline } from "../ui/primitives";
import { Popover, MenuItem } from "../ui/overlay";
import { useToast } from "../providers/Toaster";
import { downloadExport } from "@/lib/api-client";
import { useFilters, withRange } from "@/lib/use-filters";
import { fmtRelative, fmtUsd0, prettyModel, providerLabel } from "@/lib/format";
import type { InsightSummary, Kpi, Lookups } from "@/lib/types";

// ── KPI card ─────────────────────────────────────────────────

export function KpiCard({
  label,
  value,
  kpi,
  inverse,
  tip,
  sparkColor,
  sub,
  href,
}: {
  label: string;
  value: string;
  kpi?: Kpi;
  inverse?: boolean;
  tip: string;
  sparkColor?: string;
  sub?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <div className={cx("card flex h-full flex-col justify-between gap-3 p-4 transition-colors", href && "hover:border-border-strong")}>
      <div className="flex items-center gap-1.5">
        <span className="text-2xs font-medium uppercase tracking-wide text-muted">{label}</span>
        <InfoTip label={`About ${label}`}>{tip}</InfoTip>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold leading-none tracking-tight tabular-nums sm:text-[22px]">{value}</div>
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            {kpi ? (
              <>
                <Delta value={kpi.change} inverse={inverse} />
                <span className="hidden text-faint sm:inline">vs prev. period</span>
              </>
            ) : (
              sub
            )}
          </div>
        </div>
        {kpi && kpi.spark.length > 1 && (
          <div className="hidden sm:block">
            <Sparkline data={kpi.spark} color={sparkColor} />
          </div>
        )}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-lg">
      {body}
    </Link>
  ) : (
    body
  );
}

export function KpiSkeleton() {
  return (
    <div className="card space-y-3 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-6 w-28" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function PageSkeleton({ kpis = 4, table = true }: { kpis?: number; table?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-5 space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: kpis }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-2">
          <Skeleton className="mb-4 h-4 w-32" />
          <Skeleton className="h-[240px] w-full" />
        </div>
        <div className="card p-4">
          <Skeleton className="mb-4 h-4 w-28" />
          <Skeleton className="mx-auto h-[160px] w-[160px] rounded-full" />
        </div>
      </div>
      {table && (
        <div className="card p-4">
          <Skeleton className="mb-4 h-4 w-36" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="mb-2 h-8 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Filters ──────────────────────────────────────────────────

const RANGES = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "12m", label: "12M" },
];

export function RangePicker() {
  const { range, set } = useFilters();
  return (
    <div className="inline-flex h-8 rounded-md border border-border bg-surface p-0.5 shadow-xs" role="radiogroup" aria-label="Date range">
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          role="radio"
          aria-checked={range === r.key}
          onClick={() => set({ range: r.key })}
          className={cx(
            "rounded-[4px] px-2.5 text-xs font-medium transition-colors",
            range === r.key ? "bg-surface-3 text-fg" : "text-muted hover:text-fg",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <select className="select h-8 w-auto min-w-[120px] max-w-[180px] py-0 text-xs" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function FilterBar({ lookups, exportDataset, show = { provider: true, team: true, app: true } }: { lookups?: Lookups; exportDataset?: string | string[]; show?: { provider?: boolean; team?: boolean; app?: boolean } }) {
  const { values, set } = useFilters();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <RangePicker />
      {show.provider && (
        <FilterSelect
          label="All providers"
          value={values.provider ?? ""}
          options={(lookups?.providers ?? []).map((p) => ({ value: p, label: providerLabel(p) }))}
          onChange={(v) => set({ provider: v })}
        />
      )}
      {show.team && <FilterSelect label="All teams" value={values.team ?? ""} options={(lookups?.teams ?? []).map((t) => ({ value: t.id, label: t.name }))} onChange={(v) => set({ team: v })} />}
      {show.app && (
        <FilterSelect label="All applications" value={values.app ?? ""} options={(lookups?.apps ?? []).map((a) => ({ value: a.id, label: a.name }))} onChange={(v) => set({ app: v })} />
      )}
      {exportDataset && <ExportButton datasets={Array.isArray(exportDataset) ? exportDataset : [exportDataset]} />}
    </div>
  );
}

const DATASET_LABEL: Record<string, string> = {
  usage: "Usage (daily)",
  costs: "Costs (daily)",
  models: "Models",
  teams: "Teams",
  applications: "Applications",
  events: "Raw events",
};

export function ExportButton({ datasets }: { datasets: string[] }) {
  const { query } = useFilters();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (ds: string) => {
    setBusy(ds);
    try {
      await downloadExport(ds, query);
      toast({ tone: "success", title: "Export downloaded", body: `${DATASET_LABEL[ds] ?? ds} CSV for the selected range.` });
    } catch (e) {
      toast({ tone: "error", title: "Export failed", body: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };
  if (datasets.length === 1) {
    return (
      <Button size="md" icon={<Download size={14} />} loading={!!busy} onClick={() => run(datasets[0]!)}>
        {busy ? "Preparing export…" : "Export"}
      </Button>
    );
  }
  return (
    <Popover
      label="Export CSV"
      width="w-52"
      trigger={({ toggle, ref, ...aria }) => (
        <Button ref={ref} onClick={toggle} icon={<Download size={14} />} loading={!!busy} {...aria}>
          {busy ? "Preparing export…" : "Export"}
        </Button>
      )}
    >
      {(close) => (
        <>
          <p className="px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-faint">Download CSV</p>
          {datasets.map((d) => (
            <MenuItem
              key={d}
              onSelect={() => {
                close();
                void run(d);
              }}
            >
              {DATASET_LABEL[d] ?? d}
            </MenuItem>
          ))}
        </>
      )}
    </Popover>
  );
}

// ── Insights ─────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; Icon: typeof TrendingUp }> = {
  cost_anomaly: { label: "Cost anomaly", Icon: TrendingUp },
  usage_spike: { label: "Usage spike", Icon: TrendingUp },
  latency_regression: { label: "Latency regression", Icon: Gauge },
  error_spike: { label: "Error spike", Icon: AlertOctagon },
  provider_outage: { label: "Provider incident", Icon: Server },
  oversized_context: { label: "Oversized context", Icon: Lightbulb },
  high_cost_model: { label: "Model routing", Icon: PiggyBank },
  duplicate_requests: { label: "Duplicate requests", Icon: Lightbulb },
  budget_threshold: { label: "Budget", Icon: Wallet },
};

export function insightTypeLabel(type: string) {
  return TYPE_META[type]?.label ?? type;
}

export function ImpactText({ i }: { i: Pick<InsightSummary, "estimatedImpactUsd" | "impactKind"> }) {
  if (i.estimatedImpactUsd == null) return null;
  const savings = i.impactKind === "savings";
  return (
    <span className={cx("text-xs font-medium tabular-nums", savings ? "text-success" : "text-danger")}>
      {savings ? "Save ~" : "+"}
      {fmtUsd0(i.estimatedImpactUsd)}/mo
      <span className="ml-1 font-normal text-faint">{savings ? "est." : "est. impact"}</span>
    </span>
  );
}

export function InsightCard({ insight, compact }: { insight: InsightSummary; compact?: boolean }) {
  const { values } = useFilters();
  const meta = TYPE_META[insight.type] ?? { label: insight.type, Icon: Lightbulb };
  const scope = [insight.applicationName, insight.model ? prettyModel(insight.model) : null, insight.teamName].filter(Boolean).join(" · ");
  return (
    <Link
      href={withRange(`/dashboard/insights/${insight.id}`, values)}
      className="group flex h-full flex-col gap-2 rounded-lg border border-border bg-surface p-3.5 transition-colors hover:border-border-strong hover:bg-surface-2/40"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted">
          <meta.Icon size={12} aria-hidden />
          {meta.label}
        </span>
        <SeverityBadge severity={insight.severity} />
      </div>
      <p className="text-sm font-medium leading-snug">{insight.title}</p>
      {!compact && <p className="line-clamp-2 text-xs text-muted">{insight.summary}</p>}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <ImpactText i={insight} />
        <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-accent">
          View insight <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
      {scope && !compact && <p className="truncate text-2xs text-faint">{scope} · {fmtRelative(insight.detectedAt)}</p>}
    </Link>
  );
}

export function SectionCard(props: React.ComponentProps<typeof Card>) {
  return <Card {...props} />;
}
