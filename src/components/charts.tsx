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

export const CHART_COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6"];

const axisStyle = { fontSize: 11, fill: "var(--muted)" };

function tooltipStyle() {
  return {
    contentStyle: {
      background: "var(--panel)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      fontSize: 12,
      color: "var(--text)",
    },
    labelStyle: { color: "var(--muted)", fontSize: 11 },
  };
}

export function SpendTrendChart({
  data,
}: {
  data: { day: string; spendUsd: number; tokens: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="day" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => "$" + v} />
        <Tooltip {...tooltipStyle()} formatter={(value: number | string) => ["$" + Number(value).toFixed(2), "Spend"]} />
        <Area type="monotone" dataKey="spendUsd" stroke="#6366f1" strokeWidth={2} fill="url(#spendFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ProviderPie({ data }: { data: { provider: string; spendUsd: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="spendUsd" nameKey="provider" innerRadius={55} outerRadius={85} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle()} formatter={(value: number | string) => ["$" + Number(value).toFixed(2), "Spend"]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ModelBar({
  data,
  valueKey = "spendUsd",
  label = "Spend",
  currency = true,
}: {
  data: Record<string, unknown>[];
  valueKey?: string;
  label?: string;
  currency?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="model" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v: number) => (currency ? "$" + v : compact(v))}
        />
        <Tooltip
          {...tooltipStyle()}
          formatter={(value: number | string) => [currency ? "$" + Number(value).toFixed(2) : compact(Number(value)), label]}
        />
        <Bar dataKey={valueKey} radius={[6, 6, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TokenStackedArea({
  data,
}: {
  data: { day: string; inputTokens: number; outputTokens: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="inFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.03} />
          </linearGradient>
          <linearGradient id="outFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="day" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => compact(v)} />
        <Tooltip {...tooltipStyle()} formatter={(value: number | string) => [compact(Number(value))]} />
        <Area type="monotone" dataKey="inputTokens" stackId="t" stroke="#6366f1" fill="url(#inFill)" />
        <Area type="monotone" dataKey="outputTokens" stackId="t" stroke="#10b981" fill="url(#outFill)" />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ForecastLine({
  data,
}: {
  data: { month: string; spendUsd: number; projected: boolean }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tick={axisStyle} tickLine={false} axisLine={false} />
        <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => "$" + compact(v)} />
        <Tooltip {...tooltipStyle()} formatter={(value: number | string) => ["$" + Number(value).toFixed(2), "Spend"]} />
        <Line type="monotone" dataKey="spendUsd" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function compact(v: number): string {
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(Math.round(v));
}
