"use client";

import Link from "next/link";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCompact, fmtDate, fmtMs, fmtNumber, fmtUsd, fmtUsd0 } from "@/lib/format";
import type { SeriesPoint } from "@/lib/types";
import { cx } from "../ui/primitives";

export type Unit = "usd" | "tokens" | "count" | "ms" | "pct" | "ratio";

export function fmtUnit(v: number | null | undefined, unit: Unit, compact = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (unit) {
    case "usd":
      return compact ? (Math.abs(v) >= 1000 ? "$" + fmtCompact(v) : fmtUsd0(v)) : fmtUsd(v);
    case "tokens":
    case "count":
      return compact ? fmtCompact(v) : fmtNumber(v);
    case "ms":
      return fmtMs(v);
    case "pct":
      return v.toFixed(v < 10 ? 2 : 1) + "%";
    case "ratio":
      return v.toFixed(1) + "×";
  }
}

const axis = { stroke: "var(--chart-axis)", fontSize: 11, tickLine: false, axisLine: false } as const;

function tickDate(d: string, days: number) {
  if (days > 120) return fmtDate(d, { month: "short" });
  return fmtDate(d, { month: "short", day: "numeric" });
}

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="min-w-[160px] rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1.5 font-medium text-fg">{title}</p>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              {r.color && <span className="h-2 w-2 rounded-[2px]" style={{ background: r.color }} />}
              {r.label}
            </span>
            <span className="font-medium tabular-nums text-fg">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Screen-reader summary for a series (charts are aria-hidden visuals). */
function SrSummary({ label, data, get, unit }: { label: string; data: SeriesPoint[]; get: (p: SeriesPoint) => number; unit: Unit }) {
  if (!data.length) return null;
  const vals = data.map(get);
  const total = vals.reduce((a, b) => a + b, 0);
  const max = Math.max(...vals);
  const maxDay = data[vals.indexOf(max)]?.day;
  return (
    <p className="sr-only">
      {label}: {data.length} days from {data[0]!.day} to {data[data.length - 1]!.day}. {unit === "ms" || unit === "pct" ? "" : `Total ${fmtUnit(total, unit)}. `}Peak {fmtUnit(max, unit)} on {maxDay}.
    </p>
  );
}

// ── Main trend (single series + context tooltip) ─────────────

export function TrendChart({
  data,
  metric = "costUsd",
  unit = "usd",
  height = 260,
  color = "var(--c1)",
  label = "Spend",
}: {
  data: SeriesPoint[];
  metric?: keyof SeriesPoint;
  unit?: Unit;
  height?: number;
  color?: string;
  label?: string;
}) {
  const get = (p: SeriesPoint) => Number(p[metric] ?? 0);
  return (
    <div>
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`trend-${String(metric)}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="day" {...axis} tickFormatter={(d) => tickDate(d, data.length)} minTickGap={28} />
            <YAxis {...axis} width={52} tickFormatter={(v) => fmtUnit(v, unit, true)} />
            <Tooltip
              cursor={{ stroke: "var(--chart-cursor)", strokeWidth: 1 }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as SeriesPoint | undefined;
                if (!active || !p) return null;
                return (
                  <TooltipBox
                    title={fmtDate(p.day, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) + (p.day === new Date().toISOString().slice(0, 10) ? " · so far" : "")}
                    rows={[
                      { label, value: fmtUnit(get(p), unit), color },
                      ...(metric !== "costUsd" ? [{ label: "Spend", value: fmtUsd(p.costUsd) }] : []),
                      ...(metric !== "requests" ? [{ label: "Requests", value: fmtNumber(p.requests) }] : []),
                      ...(metric !== "tokens" ? [{ label: "Tokens", value: fmtCompact(p.tokens) }] : []),
                    ]}
                  />
                );
              }}
            />
            <Area type="monotone" dataKey={metric as string} stroke={color} strokeWidth={2} fill={`url(#trend-${String(metric)})`} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} animationDuration={500} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <SrSummary label={label} data={data} get={get} unit={unit} />
    </div>
  );
}

// ── Input vs output tokens ───────────────────────────────────

export function TokensChart({ data, height = 260 }: { data: SeriesPoint[]; height?: number }) {
  return (
    <div>
      <Legend items={[{ label: "Input tokens", color: "var(--c1)" }, { label: "Output tokens", color: "var(--c2)" }]} />
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="day" {...axis} tickFormatter={(d) => tickDate(d, data.length)} minTickGap={28} />
            <YAxis {...axis} width={48} tickFormatter={(v) => fmtCompact(v)} />
            <Tooltip
              cursor={{ stroke: "var(--chart-cursor)" }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as SeriesPoint | undefined;
                if (!active || !p) return null;
                return (
                  <TooltipBox
                    title={fmtDate(p.day, { weekday: "short", month: "short", day: "numeric" })}
                    rows={[
                      { label: "Input", value: fmtCompact(p.inputTokens), color: "var(--c1)" },
                      { label: "Output", value: fmtCompact(p.outputTokens), color: "var(--c2)" },
                      { label: "Requests", value: fmtNumber(p.requests) },
                    ]}
                  />
                );
              }}
            />
            <Area type="monotone" dataKey="inputTokens" stackId="t" stroke="var(--c1)" strokeWidth={2} fill="var(--c1)" fillOpacity={0.14} />
            <Area type="monotone" dataKey="outputTokens" stackId="t" stroke="var(--c2)" strokeWidth={2} fill="var(--c2)" fillOpacity={0.14} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <SrSummary label="Input tokens" data={data} get={(p) => p.inputTokens} unit="tokens" />
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: i.color }} aria-hidden />
          {i.label}
          {i.value && <span className="font-medium tabular-nums text-fg">{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}

// ── Donut with labeled legend ────────────────────────────────

export function Donut({
  items,
  unit = "usd",
  centerLabel = "Total",
  height = 176,
}: {
  items: { id: string; label: string; value: number; color: string; href?: string }[];
  unit?: Unit;
  centerLabel?: string;
  height?: number;
}) {
  const total = items.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative shrink-0" style={{ width: height, height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items.length ? items : [{ id: "none", label: "", value: 1, color: "var(--surface-3)" }]}
              dataKey="value"
              nameKey="label"
              innerRadius="70%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive
              animationDuration={500}
            >
              {(items.length ? items : [{ id: "none", color: "var(--surface-3)" }]).map((i) => (
                <Cell key={i.id} fill={i.color} />
              ))}
            </Pie>
            {items.length > 0 && (
              <Tooltip
                isAnimationActive={false}
                content={({ active, payload }) => {
                  const p = payload?.[0]?.payload as (typeof items)[number] | undefined;
                  if (!active || !p) return null;
                  return <TooltipBox title={p.label} rows={[{ label: "Value", value: fmtUnit(p.value, unit), color: p.color }, { label: "Share", value: ((p.value / total) * 100).toFixed(1) + "%" }]} />;
                }}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xs uppercase tracking-wide text-muted">{centerLabel}</span>
          <span className="text-lg font-semibold tabular-nums">{fmtUnit(total, unit, true)}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1" aria-label={`${centerLabel} breakdown`}>
        {items.map((i) => {
          const pct = total > 0 ? (i.value / total) * 100 : 0;
          const inner = (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: i.color }} aria-hidden />
                <span className="truncate">{i.label}</span>
              </span>
              <span className="flex items-center gap-3 tabular-nums">
                <span className="w-12 text-right text-muted">{pct.toFixed(1)}%</span>
                <span className="w-20 text-right font-medium">{fmtUnit(i.value, unit)}</span>
              </span>
            </>
          );
          return (
            <li key={i.id}>
              {i.href ? (
                <Link href={i.href} className="-mx-2 flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm hover:bg-surface-2">
                  {inner}
                </Link>
              ) : (
                <div className="flex items-center justify-between gap-3 py-1.5 text-sm">{inner}</div>
              )}
            </li>
          );
        })}
        {!items.length && <li className="py-2 text-sm text-muted">No data for this period.</li>}
      </ul>
    </div>
  );
}

// ── Ranked horizontal bars (HTML — crisp, accessible, linkable) ──

export function BarList({
  items,
  unit = "usd",
  color = "var(--c1)",
  max: maxItems = 6,
  secondary,
}: {
  items: { id: string; label: React.ReactNode; value: number; href?: string; color?: string; sub?: string }[];
  unit?: Unit;
  color?: string;
  max?: number;
  secondary?: (id: string) => React.ReactNode;
}) {
  const shown = items.slice(0, maxItems);
  const top = Math.max(...shown.map((i) => i.value), 0) || 1;
  if (!shown.length) return <p className="py-6 text-center text-sm text-muted">No data for this period.</p>;
  return (
    <ul className="space-y-1">
      {shown.map((i) => {
        const body = (
          <div className="relative flex h-9 items-center justify-between gap-3 overflow-hidden rounded px-2.5">
            <div className="absolute inset-y-1 left-0 rounded-r" style={{ width: `${Math.max(1.5, (i.value / top) * 100)}%`, background: i.color ?? color, opacity: 0.14 }} aria-hidden />
            <span className="relative min-w-0 truncate text-sm">{i.label}</span>
            <span className="relative flex shrink-0 items-center gap-3 text-sm tabular-nums">
              {secondary?.(i.id)}
              <span className="font-medium">{fmtUnit(i.value, unit)}</span>
            </span>
          </div>
        );
        return <li key={i.id}>{i.href ? <Link href={i.href} className="block rounded transition-colors hover:bg-surface-2">{body}</Link> : body}</li>;
      })}
    </ul>
  );
}

// ── Multi-series lines (model comparison) ────────────────────

export function MultiLine({
  series,
  unit,
  height = 240,
}: {
  series: { id: string; label: string; color: string; points: { day: string; value: number | null }[] }[];
  unit: Unit;
  height?: number;
}) {
  const days = series[0]?.points.map((p) => p.day) ?? [];
  const data = days.map((day, i) => {
    const row: Record<string, string | number | null> = { day };
    for (const s of series) row[s.id] = s.points[i]?.value ?? null;
    return row;
  });
  return (
    <div>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="day" {...axis} tickFormatter={(d) => tickDate(d, data.length)} minTickGap={28} />
            <YAxis {...axis} width={52} tickFormatter={(v) => fmtUnit(v, unit, true)} />
            <Tooltip
              cursor={{ stroke: "var(--chart-cursor)" }}
              isAnimationActive={false}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <TooltipBox
                    title={fmtDate(String(label), { month: "short", day: "numeric" })}
                    rows={series.map((s) => ({ label: s.label, value: fmtUnit(payload.find((p) => p.dataKey === s.id)?.value as number, unit), color: s.color }))}
                  />
                );
              }}
            />
            {series.map((s) => (
              <Line key={s.id} type="monotone" dataKey={s.id} stroke={s.color} strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Insight evidence trend (value + dashed baseline) ─────────

export function EvidenceChart({ points, unit, label, height = 220 }: { points: { day: string; value: number; baseline?: number }[]; unit: Unit; label: string; height?: number }) {
  const baseline = points.find((p) => p.baseline != null)?.baseline;
  return (
    <div>
      <Legend items={[{ label, color: "var(--c1)" }, ...(baseline != null ? [{ label: "Baseline", color: "var(--chart-axis)" }] : [])]} />
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="day" {...axis} tickFormatter={(d) => tickDate(d, points.length)} minTickGap={24} />
            <YAxis {...axis} width={56} tickFormatter={(v) => fmtUnit(v, unit, true)} />
            <Tooltip
              cursor={{ stroke: "var(--chart-cursor)" }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof points)[number] | undefined;
                if (!active || !p) return null;
                return (
                  <TooltipBox
                    title={fmtDate(p.day, { weekday: "short", month: "short", day: "numeric" })}
                    rows={[{ label, value: fmtUnit(p.value, unit), color: "var(--c1)" }, ...(p.baseline != null ? [{ label: "Baseline", value: fmtUnit(p.baseline, unit) }] : [])]}
                  />
                );
              }}
            />
            {baseline != null && <ReferenceLine y={baseline} stroke="var(--chart-axis)" strokeDasharray="4 4" />}
            <Line type="monotone" dataKey="value" stroke="var(--c1)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Monthly bars ─────────────────────────────────────────────

export function MonthlyBars({ data, height = 220 }: { data: { month: string; costUsd: number }[]; height?: number }) {
  return (
    <div style={{ height }} aria-label={`Monthly spend: ${data.map((d) => `${d.month} ${fmtUsd0(d.costUsd)}`).join(", ")}`} role="img">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="month" {...axis} tickFormatter={(m) => fmtDate(m + "-01", { month: "short" })} />
          <YAxis {...axis} width={52} tickFormatter={(v) => fmtUnit(v, "usd", true)} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as { month: string; costUsd: number } | undefined;
              if (!active || !p) return null;
              return <TooltipBox title={fmtDate(p.month + "-01", { month: "long", year: "numeric" })} rows={[{ label: "Spend", value: fmtUsd(p.costUsd), color: "var(--c1)" }]} />;
            }}
          />
          <Bar dataKey="costUsd" fill="var(--c1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Spend change waterfall (HTML) ────────────────────────────

export function Waterfall({ previous, current, steps, otherDelta }: { previous: number; current: number; steps: { id: string; name: string; delta: number }[]; otherDelta: number }) {
  const all = [...steps, ...(Math.abs(otherDelta) >= 0.01 ? [{ id: "other", name: "Other", delta: otherDelta }] : [])];
  let run = previous;
  const bars = all.map((s) => {
    const start = run;
    run += s.delta;
    return { ...s, start, end: run };
  });
  const maxV = Math.max(previous, current, ...bars.map((b) => Math.max(b.start, b.end))) || 1;
  const pct = (v: number) => `${(v / maxV) * 100}%`;
  const Row = ({ label, left, width, tone, value }: { label: string; left: string; width: string; tone: string; value: string }) => (
    <li className="grid grid-cols-[minmax(0,150px)_1fr_80px] items-center gap-3 text-sm">
      <span className="truncate text-muted">{label}</span>
      <span className="relative h-5 rounded bg-surface-2/60">
        <span className={cx("absolute inset-y-0 rounded", tone)} style={{ left, width }} />
      </span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </li>
  );
  return (
    <ul className="space-y-2" aria-label="Spend change by application">
      <Row label="Previous period" left="0%" width={pct(previous)} tone="bg-chart-axis/40" value={fmtUsd0(previous)} />
      {bars.map((b) => (
        <Row
          key={b.id}
          label={b.name}
          left={pct(Math.min(b.start, b.end))}
          width={`max(2px, ${pct(Math.abs(b.delta))})`}
          tone={b.delta >= 0 ? "bg-st-critical/70" : "bg-st-good/70"}
          value={(b.delta >= 0 ? "+" : "−") + fmtUsd0(Math.abs(b.delta))}
        />
      ))}
      <Row label="This period" left="0%" width={pct(current)} tone="bg-c1" value={fmtUsd0(current)} />
    </ul>
  );
}
