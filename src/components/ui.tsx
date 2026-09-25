"use client";

import Link from "next/link";
import React from "react";
import { IconTrendUp, IconTrendDown, IconZap, IconClock, IconLightbulb } from "./icons";

/* ─────────────────────────────────────────────────────────────
   Metric display
   ───────────────────────────────────────────────────────────── */

/** Inline SVG sparkline — no chart library overhead for tiny trends. */
export function Sparkline({
  data,
  color = "var(--accent)",
  width = 96,
  height = 28,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`);
  const id = React.useId();
  return (
    <svg width={width} height={height} className="shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts.join(" ")} ${width},${height}`} fill={`url(#${id})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Change indicator: green = good, amber/red = bad. `goodWhenDown` for spend metrics. */
export function Delta({ value, goodWhenDown = false, suffix = "" }: { value?: number | null; goodWhenDown?: boolean; suffix?: string }) {
  if (value == null) return <span className="faint text-xs">—</span>;
  const positive = goodWhenDown ? value <= 0 : value >= 0;
  const color = positive ? "var(--success)" : Math.abs(value) > 25 ? "var(--danger)" : "var(--warning)";
  const Icon = value >= 0 ? IconTrendUp : IconTrendDown;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color }}>
      <Icon size={12} />
      {Math.abs(value).toFixed(1)}%{suffix ? <span className="font-normal muted">{suffix}</span> : null}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  delta,
  goodWhenDown = false,
  deltaLabel = "vs prev. 30d",
  spark,
  sparkColor,
}: {
  label: string;
  value: string;
  delta?: number | null;
  goodWhenDown?: boolean;
  deltaLabel?: string;
  spark?: number[];
  sparkColor?: string;
}) {
  return (
    <div className="surface px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <span className="label">{label}</span>
        {spark && <Sparkline data={spark} color={sparkColor} width={72} height={24} />}
      </div>
      <div className="mt-1.5 text-[24px] font-bold leading-none tracking-tight tabular-nums">{value}</div>
      <div className="mt-2 flex items-center gap-1.5">
        <Delta value={delta} goodWhenDown={goodWhenDown} />
        <span className="faint text-xs">{deltaLabel}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Cards & sections
   ───────────────────────────────────────────────────────────── */

export function ChartCard({
  title,
  subtitle,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={"surface " + className}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="truncate text-[13px] font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 truncate text-xs muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={"p-4 " + bodyClassName}>{children}</div>
    </section>
  );
}

export function SectionHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Badges
   ───────────────────────────────────────────────────────────── */

export const PROVIDER_COLORS: Record<string, string> = {
  OPENAI: "#10a37f",
  ANTHROPIC: "#d97757",
  GOOGLE: "#4285f4",
  MISTRAL: "#ff7000",
  DEMO: "#6c5ce7",
};

export const PROVIDER_LABELS: Record<string, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  GOOGLE: "Google Gemini",
  MISTRAL: "Mistral",
  DEMO: "Demo",
};

export function ProviderBadge({ provider }: { provider: string }) {
  const color = PROVIDER_COLORS[provider] ?? "#6c5ce7";
  const label = PROVIDER_LABELS[provider] ?? provider;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
      <span className="dot" style={{ background: color }} />
      {label}
    </span>
  );
}

export function ModelBadge({ model }: { model: string }) {
  return <span className="mono text-[12.5px] font-medium">{model}</span>;
}

export function StatusBadge({ status, children }: { status: "success" | "warning" | "danger" | "neutral" | "accent"; children: React.ReactNode }) {
  return <span className={"badge badge-" + status}>{children}</span>;
}

/* ─────────────────────────────────────────────────────────────
   Table
   ───────────────────────────────────────────────────────────── */

export interface Column<T> {
  key: string;
  header: string;
  numeric?: boolean;
  render: (row: T) => React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = "No data",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-10 text-center text-[13px] muted">{emptyMessage}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.numeric ? "num" : ""}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "cursor-pointer" : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.numeric ? "num" : ""}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Insights
   ───────────────────────────────────────────────────────────── */

export function InsightCard({
  kind,
  title,
  body,
  impact,
  impactLabel,
  action,
}: {
  kind: "anomaly" | "optimization" | "latency";
  title: string;
  body: string;
  impact?: string;
  impactLabel?: string;
  action?: { label: string; href: string };
}) {
  const meta =
    kind === "anomaly"
      ? { icon: <IconZap size={13} />, label: "Cost anomaly", cls: "badge-danger" }
      : kind === "optimization"
        ? { icon: <IconLightbulb size={13} />, label: "Optimization", cls: "badge-accent" }
        : { icon: <IconClock size={13} />, label: "Performance", cls: "badge-success" };
  return (
    <div className="surface surface-hover p-4 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className={"badge " + meta.cls}>{meta.icon}{meta.label}</span>
        {impact && (
          <span className="text-[13px] font-semibold tabular-nums">
            {impact}
            {impactLabel && <span className="ml-1 text-[11px] font-normal muted">{impactLabel}</span>}
          </span>
        )}
      </div>
      <h3 className="mt-2.5 text-[13.5px] font-semibold leading-snug">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed muted">{body}</p>
      {action && (
        <Link href={action.href} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium" style={{ color: "var(--accent)" }}>
          {action.label} →
        </Link>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Budget progress
   ───────────────────────────────────────────────────────────── */

export function BudgetProgress({ percent, showMarker = true }: { percent: number; showMarker?: boolean }) {
  const pct = Math.min(100, Math.max(0, percent));
  const color = percent >= 100 ? "var(--danger)" : percent >= 80 ? "var(--warning)" : "var(--accent)";
  return (
    <div className="relative">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: pct + "%", background: color }} />
      </div>
      {showMarker && percent > 100 && (
        <span className="absolute right-0 -top-0.5 h-[9px] w-[9px] rounded-full" style={{ background: "var(--danger)" }} />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Empty & loading states
   ───────────────────────────────────────────────────────────── */

export function EmptyState({
  title,
  body,
  ctaHref,
  ctaLabel,
  icon,
}: {
  title: string;
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="surface flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border" style={{ background: "var(--surface-2)" }}>
        {icon ?? <IconZap size={18} className="muted" />}
      </div>
      <h3 className="mt-4 text-[14px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed muted">{body}</p>
      {ctaHref && ctaLabel && (
        <Link href={ctaHref} className="btn btn-primary btn-sm mt-5">{ctaLabel}</Link>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={"skeleton " + className} />;
}

/** Page-level skeleton: KPI row + chart grid. Never a giant spinner. */
export function PageSkeleton() {
  return (
    <div>
      <div className="mb-5 space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="surface px-4 py-3.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-6 w-32" />
            <Skeleton className="mt-2.5 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface p-4 lg:col-span-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-[240px] w-full" />
        </div>
        <div className="surface p-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mx-auto mt-4 h-[180px] w-[180px] rounded-full" />
          <Skeleton className="mx-auto mt-4 h-3 w-40" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Controls
   ───────────────────────────────────────────────────────────── */

export const RANGE_OPTIONS = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "12M", days: 365 },
] as const;

export function RangePicker({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  return (
    <div className="segmented" role="tablist" aria-label="Date range">
      {RANGE_OPTIONS.map((r) => (
        <button key={r.days} data-active={value === r.days} onClick={() => onChange(r.days)}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function FilterDropdown({
  value,
  onChange,
  options,
  allLabel,
  width = 150,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
  width?: number;
}) {
  return (
    <select className="input" style={{ width }} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filter">
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export const PROVIDER_FILTER_OPTIONS = ["OPENAI", "ANTHROPIC", "GOOGLE", "MISTRAL", "DEMO"].map((p) => ({
  value: p,
  label: PROVIDER_LABELS[p] ?? p,
}));

/* ─────────────────────────────────────────────────────────────
   Formatting helpers
   ───────────────────────────────────────────────────────────── */

export const fmtUsd = (v: number, dp = 2) =>
  "$" + v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtUsd0 = (v: number) =>
  "$" + Math.round(v).toLocaleString("en-US");

export const fmtCompact = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(abs >= 1e10 ? 0 : 1) + "B";
  if (abs >= 1e6) return (v / 1e6).toFixed(abs >= 1e7 ? 0 : 1) + "M";
  if (abs >= 1e3) return (v / 1e3).toFixed(abs >= 1e4 ? 0 : 1) + "K";
  return String(Math.round(v));
};

export const fmtPct = (v: number, dp = 1) => v.toFixed(dp) + "%";

/* ─────────────────────────────────────────────────────────────
   Brand
   ───────────────────────────────────────────────────────────── */

export function LogoMark({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-[6px]"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
      }}
      aria-hidden="true"
    />
  );
}
