"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GitCompare } from "lucide-react";
import { useApi } from "@/lib/api-client";
import { useFilters, withRange } from "@/lib/use-filters";
import { fmtCompact, fmtMs, fmtNumber, fmtRate, fmtUsd, prettyModel } from "@/lib/format";
import type { CompareModel, Filters } from "@/lib/types";
import { ButtonLink, Card, cx, EmptyState, ErrorState, InfoTip, PageHeader, ProviderName } from "@/components/ui/primitives";
import { MultiLine } from "@/components/charts";
import { PageSkeleton, RangePicker } from "@/components/dashboard/blocks";

const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)"];

interface Row {
  label: string;
  tip?: string;
  value: (m: CompareModel) => number | null;
  fmt: (v: number | null) => string;
  /** "min" = lower is better, "max" = higher is informative only (no badge). */
  best?: "min";
}

const ROWS: { group: string; rows: Row[] }[] = [
  {
    group: "Cost",
    rows: [
      { label: "Spend", value: (m) => m.totals.costUsd, fmt: (v) => fmtUsd(v) },
      { label: "Cost / request", value: (m) => m.totals.costPerRequest, fmt: (v) => fmtUsd(v), best: "min" },
      { label: "List price · input / 1M", value: (m) => m.price?.inputPer1M ?? null, fmt: (v) => (v == null ? "—" : fmtUsd(v)), best: "min" },
      { label: "List price · output / 1M", value: (m) => m.price?.outputPer1M ?? null, fmt: (v) => (v == null ? "—" : fmtUsd(v)), best: "min" },
    ],
  },
  {
    group: "Latency",
    rows: [{ label: "Avg latency", tip: "Measured from instrumented requests.", value: (m) => m.totals.latencyMs, fmt: (v) => fmtMs(v), best: "min" }],
  },
  {
    group: "Usage",
    rows: [
      { label: "Requests", value: (m) => m.totals.requests, fmt: (v) => fmtNumber(v) },
      { label: "Tokens", value: (m) => m.totals.tokens, fmt: (v) => fmtCompact(v) },
      { label: "Tokens / request", value: (m) => (m.totals.requests ? m.totals.tokens / m.totals.requests : null), fmt: (v) => fmtCompact(v) },
    ],
  },
  {
    group: "Reliability",
    rows: [{ label: "Error rate", value: (m) => (m.totals.requests ? m.totals.errorRate : null), fmt: (v) => fmtRate(v), best: "min" }],
  },
];

export default function ComparePage() {
  const sp = useSearchParams();
  const { values } = useFilters();
  const m = sp.get("m") ?? "";
  const count = m.split(",").filter(Boolean).length;
  const q = new URLSearchParams({ m });
  for (const k of ["range", "from", "to"] as const) if (values[k]) q.set(k, values[k]!);
  const { data, error, loading, refresh } = useApi<{ filters: Filters; models: CompareModel[] }>(count >= 2 && count <= 4 ? `/api/v1/analytics/models/compare?${q}` : null);

  const header = (
    <PageHeader
      title="Compare models"
      description="Measured cost, latency, usage and reliability side by side."
      back={{ href: withRange("/dashboard/models", values), label: "Models" }}
      actions={<RangePicker />}
    />
  );

  if (count < 2 || count > 4)
    return (
      <>
        {header}
        <div className="card">
          <EmptyState
            icon={<GitCompare size={18} />}
            title="Select 2–4 models to compare"
            body="Pick models from the Models table, then choose Compare."
            actions={<ButtonLink href="/dashboard/models" variant="primary">Choose models</ButtonLink>}
          />
        </div>
      </>
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
  const models = data.models;

  const series = (pick: (p: CompareModel["series"][number]) => number | null) =>
    models.map((mm, i) => ({ id: `s${i}`, label: prettyModel(mm.model), color: COLORS[i]!, points: mm.series.map((p) => ({ day: p.day, value: pick(p) })) }));

  return (
    <div>
      {header}

      <div className={cx("grid gap-3", models.length === 2 ? "sm:grid-cols-2" : models.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4")}>
        {models.map((mm, i) => (
          <Link
            key={`${mm.provider}:${mm.model}`}
            href={withRange(`/dashboard/models/${encodeURIComponent(mm.provider)}/${encodeURIComponent(mm.model)}`, values)}
            className="card block p-4 transition-colors hover:border-border-strong"
          >
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COLORS[i] }} aria-hidden />
              <span className="truncate text-sm font-semibold">{prettyModel(mm.model)}</span>
            </div>
            <div className="mt-1 text-xs text-muted">
              <ProviderName provider={mm.provider} showDot={false} /> · <span className="font-mono">{mm.model}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-faint">Spend</p>
                <p className="text-sm font-semibold tabular-nums">{fmtUsd(mm.totals.costUsd)}</p>
              </div>
              <div>
                <p className="text-faint">Avg latency</p>
                <p className="text-sm font-semibold tabular-nums">{fmtMs(mm.totals.latencyMs)}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <Card className="mt-4" title="Side-by-side" subtitle="Best value per row is marked where lower is better" bodyClassName="pb-0">
        <div className="overflow-x-auto">
          <table className="table">
            <caption className="sr-only">Model comparison</caption>
            <thead>
              <tr>
                <th scope="col">Metric</th>
                {models.map((mm, i) => (
                  <th key={i} scope="col" className="text-right">
                    <span className="inline-flex items-center gap-1.5 normal-case">
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: COLORS[i] }} aria-hidden />
                      {prettyModel(mm.model)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((g) => (
                <GroupRows key={g.group} group={g.group} rows={g.rows} models={models} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-1 py-2.5 text-xs text-muted">
          List prices come from the ObserveMetrics pricing catalog{models.some((mm) => mm.price?.verified.startsWith("unverified")) ? "; some entries are unverified — confirm on the provider's pricing page" : ""}. ObserveMetrics doesn&apos;t measure output quality.
        </p>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Daily spend">
          <MultiLine unit="usd" series={series((p) => p.costUsd)} />
        </Card>
        <Card title="Daily average latency" subtitle="Measured requests only">
          <MultiLine unit="ms" series={series((p) => p.latencyMs)} />
        </Card>
        <Card title="Daily requests">
          <MultiLine unit="count" series={series((p) => p.requests)} />
        </Card>
        <Card title="Daily error rate">
          <MultiLine unit="pct" series={series((p) => (p.requests ? p.errorRate * 100 : null))} />
        </Card>
      </div>
    </div>
  );
}

function GroupRows({ group, rows, models }: { group: string; rows: Row[]; models: CompareModel[] }) {
  return (
    <>
      <tr>
        <td colSpan={models.length + 1} className="h-8 bg-surface-2/60 text-2xs font-medium uppercase tracking-wide text-muted">
          {group}
        </td>
      </tr>
      {rows.map((row) => {
        const vals = models.map(row.value);
        const valid = vals.filter((v): v is number => v != null && Number.isFinite(v));
        const best = row.best === "min" && valid.length >= 2 ? Math.min(...valid) : null;
        return (
          <tr key={row.label}>
            <td className="text-muted">
              <span className="inline-flex items-center gap-1">
                {row.label}
                {row.tip && <InfoTip>{row.tip}</InfoTip>}
              </span>
            </td>
            {vals.map((v, i) => (
              <td key={i} className="num">
                <span className="inline-flex items-center justify-end gap-1.5">
                  {best != null && v === best && <span className="badge badge-success">Lowest</span>}
                  {row.fmt(v)}
                </span>
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}
