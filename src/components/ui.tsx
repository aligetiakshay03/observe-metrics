"use client";

import Link from "next/link";
import React from "react";
import { IconTrendUp, IconTrendDown } from "./icons";

export function PageHeader(props: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
        {props.subtitle && <p className="mt-1 text-sm muted">{props.subtitle}</p>}
      </div>
      {props.actions && <div className="flex items-center gap-2">{props.actions}</div>}
    </div>
  );
}

export function KpiCard(props: {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  hint?: string;
}) {
  // For spend metrics, a decrease is good (green); an increase is a warning (amber).
  const positive = (props.delta ?? 0) <= 0;
  const TrendIcon = props.delta != null && props.delta >= 0 ? IconTrendUp : IconTrendDown;
  return (
    <div className="panel p-5 transition-shadow hover:shadow-[var(--shadow-md)]">
      <div className="text-[11px] font-medium uppercase tracking-wider muted">{props.label}</div>
      <div className="mt-2 text-[26px] font-bold leading-none tracking-tight tabular-nums">{props.value}</div>
      {props.delta != null && (
        <div className="mt-2.5 flex items-center gap-1 text-xs font-medium" style={{ color: positive ? "#10b981" : "#f59e0b" }}>
          <TrendIcon size={13} />
          {Math.abs(props.delta).toFixed(1)}%
          <span className="font-normal muted">{props.deltaLabel ?? "vs previous period"}</span>
        </div>
      )}
      {props.hint && <div className="mt-2 text-xs muted">{props.hint}</div>}
    </div>
  );
}

export function Panel(props: { title?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={"panel p-5 " + (props.className ?? "")}>
      {(props.title || props.actions) && (
        <div className="mb-5 flex items-center justify-between gap-3">
          {props.title && <h2 className="text-[13px] font-semibold uppercase tracking-wider muted">{props.title}</h2>}
          {props.actions}
        </div>
      )}
      {props.children}
    </div>
  );
}

export function EmptyState(props: {
  icon?: string;
  title: string;
  body: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="panel flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="text-4xl">{props.icon ?? "📊"}</div>
      <h3 className="mt-4 font-semibold">{props.title}</h3>
      <p className="mt-1 max-w-sm text-sm muted">{props.body}</p>
      {props.ctaHref && props.ctaLabel && (
        <Link href={props.ctaHref} className="btn btn-primary mt-6">
          {props.ctaLabel}
        </Link>
      )}
    </div>
  );
}

export function ProgressBar(props: { percent: number; danger?: boolean }) {
  const pct = Math.min(100, Math.max(0, props.percent));
  const color = props.danger || props.percent >= 100 ? "#ef4444" : props.percent >= 80 ? "#f59e0b" : "var(--accent)";
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(128,128,128,0.15)" }}>
      <div className="h-full rounded-full transition-all" style={{ width: pct + "%", background: color }} />
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
        style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
      />
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{message}</p>;
}
