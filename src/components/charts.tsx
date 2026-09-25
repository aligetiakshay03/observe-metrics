"use client";

import {
  ResponsiveContainer,
  AreaChart,
  BarChart,
  PieChart,
  LineChart,
  Area,
  Bar,
  Pie,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  Legend,
} from "recharts";
import { fmtUsd, fmtCompact, fmtUsd0, PROVIDER_COLORS } from "./ui";

/* Shared neutral chart theme */
const axis = { fontSize: 11, fill: "var(--muted)" } as const;
const grid = { stroke: "var(--border)", strokeDasharray: "3 4", vertical: false } as const;

function tipStyle() {
  return {
    contentStyle: {
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      fontSize: 12,
      boxShadow: "var(--shadow-sm)",
      color: "var(--text)",
      padding: "8px 10px",
    },
    labelStyle: { color: "var(--muted)", fontSize: 11, fontWeight: 600, marginBottom: 2 },
    itemStyle: { color: "var(--text)", padding: "2px 0" },
    cursor: { stroke: "var(--border-strong)", strokeWidth: 1 },
  };
}

const SHORT_MONTH = (key: string) => {
  const d = new Date(key + (key.length === 7 ? "-01" : "T00:00:00"));
  if (isNaN(d.getTime())) return key;
  return d.toLocaleDateString("en-US", { month: "short", day: key.length === 7 ? undefined : "numeric" });
};

/* ── Spend over time (area) ── */

export function SpendAreaChart({ data, height = 260 }: { data: { day: string; spendUsd: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="spendA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5b4bff" stopOpacity={0.16} />
            <stop offset="100%" stopColor="#5b4bff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...grid} />
        <XAxis dataKey="day" tickFormatter={SHORT_MONTH} tick={axis} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={46} tickFormatter={(v: number) => "$" + fmtCompact(v)} />
        <Tooltip {...tipStyle()} formatter={(v) => [fmtUsd(Number(v)), "Spend"]} labelFormatter={(l) => String(l)} />
        <Area type="monotone" dataKey="spendUsd" stroke="#5b4bff" strokeWidth={1.8} fill="url(#spendA)" activeDot={{ r: 3, strokeWidth: 0 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Provider donut with center label + legend ── */

const DONUT_COLORS = ["#5b4bff", "#8b5cf6", "#06b6d4", "#f59e0b", "#64748b"];

export function ProviderDonut({
  data,
  height = 210,
}: {
  data: { provider: string; spendUsd: number }[];
  height?: number;
}) {
  const total = data.reduce((a, b) => a + b.spendUsd, 0);
  const colorOf = (p: string, i: number) => PROVIDER_COLORS[p] ?? DONUT_COLORS[i % DONUT_COLORS.length];
  return (
    <div>
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie data={data} dataKey="spendUsd" nameKey="provider" innerRadius="68%" outerRadius="92%" paddingAngle={2} strokeWidth={0}>
              {data.map((d, i) => (
                <Cell key={d.provider} fill={colorOf(d.provider, i)} />
              ))}
            </Pie>
            <Tooltip {...tipStyle()} formatter={(v) => [fmtUsd(Number(v)), "Spend"]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="label">Total</span>
          <span className="text-lg font-bold tabular-nums">{fmtUsd0(total)}</span>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {data.map((d, i) => (
          <div key={d.provider} className="flex items-center justify-between text-[13px]">
            <span className="flex items-center gap-2">
              <span className="dot" style={{ background: colorOf(d.provider, i) }} />
              {d.provider === "GOOGLE" ? "Google Gemini" : d.provider.charAt(0) + d.provider.slice(1).toLowerCase()}
            </span>
            <span className="tabular-nums muted">
              {total > 0 ? ((d.spendUsd / total) * 100).toFixed(0) + "%" : "0%"}
              <span className="ml-2 font-medium" style={{ color: "var(--text)" }}>{fmtUsd0(d.spendUsd)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Horizontal bars for by-team / by-model / by-application ── */

export function RankedBars({
  data,
  currency = true,
  color = "var(--accent)",
  maxRows = 8,
}: {
  data: { name: string; value: number }[];
  currency?: boolean;
  color?: string;
  maxRows?: number;
}) {
  const rows = data.slice(0, maxRows);
  const max = rows[0]?.value || 1;
  const fmt = currency ? fmtUsd0 : fmtCompact;
  if (rows.length === 0) return <p className="py-10 text-center text-[13px] muted">No data for this period</p>;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="mb-1 flex items-center justify-between text-[13px]">
            <span className="truncate">{r.name}</span>
            <span className="ml-3 shrink-0 font-medium tabular-nums">{fmt(r.value)}</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: Math.max(2, (r.value / max) * 100) + "%", background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Tokens stacked (input vs output) ── */

export function TokenStackedArea({ data, height = 260 }: { data: { day: string; inputTokens: number; outputTokens: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="tokIn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5b4bff" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#5b4bff" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="tokOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16a34a" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...grid} />
        <XAxis dataKey="day" tickFormatter={SHORT_MONTH} tick={axis} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={46} tickFormatter={(v: number) => fmtCompact(v)} />
        <Tooltip {...tipStyle()} formatter={(v, name) => [fmtCompact(Number(v)), name === "inputTokens" ? "Input" : "Output"]} />
        <Legend formatter={(v) => <span style={{ color: "var(--muted)", fontSize: 12 }}>{v === "inputTokens" ? "Input tokens" : "Output tokens"}</span>} />
        <Area type="monotone" dataKey="inputTokens" stackId="t" stroke="#5b4bff" strokeWidth={1.6} fill="url(#tokIn)" />
        <Area type="monotone" dataKey="outputTokens" stackId="t" stroke="#16a34a" strokeWidth={1.6} fill="url(#tokOut)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Monthly spend + forecast (solid actual, dashed projection) ── */

export function ForecastChart({ data, height = 240 }: { data: { month: string; spendUsd: number; projected: boolean }[]; height?: number }) {
  const lastActual = data.reduce((acc, d, i) => (d.projected ? acc : i), 0);
  const mapped = data.map((d, i) => ({
    month: d.month,
    actual: d.projected ? null : d.spendUsd,
    projected: d.projected || i === lastActual ? d.spendUsd : null,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={mapped} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => "$" + fmtCompact(v)} />
        <Tooltip {...tipStyle()} formatter={(v) => [fmtUsd(Number(v)), "Spend"]} />
        <Legend formatter={(v) => <span style={{ color: "var(--muted)", fontSize: 12 }}>{v === "actual" ? "Actual" : "Projected"}</span>} />
        <Line type="monotone" dataKey="actual" stroke="#5b4bff" strokeWidth={1.8} dot={{ r: 2.5 }} connectNulls={false} name="actual" />
        <Line type="monotone" dataKey="projected" stroke="#8b5cf6" strokeWidth={1.8} strokeDasharray="5 5" dot={{ r: 2.5 }} connectNulls={true} name="projected" />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ── Simple vertical bars (models) ── */

export function ModelBars({ data, height = 240 }: { data: { model: string; spendUsd: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="model" tick={axis} tickLine={false} axisLine={false} interval={0} angle={-18} textAnchor="end" height={54} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={46} tickFormatter={(v: number) => "$" + fmtCompact(v)} />
        <Tooltip {...tipStyle()} formatter={(v) => [fmtUsd(Number(v)), "Spend"]} cursor={{ fill: "var(--surface-2)" }} />
        <Bar dataKey="spendUsd" radius={[4, 4, 0, 0]} maxBarSize={44}>
          {data.map((_, i) => (
            <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
