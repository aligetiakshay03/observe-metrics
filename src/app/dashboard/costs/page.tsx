"use client";

import { useEffect, useState } from "react";
import { useSession } from "../../providers";
import {
  MetricCard, ChartCard, SectionHeader, EmptyState, PageSkeleton, RangePicker,
  FilterDropdown, PROVIDER_FILTER_OPTIONS, fmtUsd, fmtUsd0, fmtCompact,
} from "@/components/ui";
import { SpendAreaChart, ProviderDonut, RankedBars, ModelBars, ForecastChart } from "@/components/charts";
import { IconDownload } from "@/components/icons";

interface OrgData {
  stats: { spendUsd: number; deltaPct: number | null; requests: number };
  providers: { provider: string; spendUsd: number }[];
  models: { model: string; provider: string; spendUsd: number; requests: number }[];
  teams: { team: string; spendUsd: number }[];
  applications: { app: string; spendUsd: number }[];
  monthly: { month: string; spendUsd: number }[];
  daily: { day: string; spendUsd: number }[];
}

function forecastFrom(monthly: { month: string; spendUsd: number }[]): { month: string; spendUsd: number; projected: boolean }[] {
  const out = monthly.map((m) => ({ ...m, projected: false }));
  if (monthly.length >= 2) {
    const n = monthly.length;
    const xs = monthly.map((_, i) => i);
    const ys = monthly.map((m) => m.spendUsd);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = ys.reduce((a, b) => a + b, 0) / n;
    const slope = xs.reduce((acc, x, i) => acc + (x - xMean) * (ys[i]! - yMean), 0) / (xs.reduce((acc, x) => acc + (x - xMean) ** 2, 0) || 1);
    const intercept = yMean - slope * xMean;
    const last = new Date(monthly[n - 1]!.month + "-01T00:00:00Z");
    for (let k = 1; k <= 3; k++) {
      const d = new Date(last);
      d.setUTCMonth(d.getUTCMonth() + k);
      out.push({
        month: d.toISOString().slice(0, 7),
        spendUsd: Math.max(0, Math.round((intercept + slope * (n - 1 + k)) * 100) / 100),
        projected: true,
      });
    }
  }
  return out;
}

export default function CostsPage() {
  const { me, loading: sessionLoading } = useSession();
  const [days, setDays] = useState(90);
  const [provider, setProvider] = useState("");
  const [data, setData] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionLoading || !me) return;
    setLoading(true);
    const params = new URLSearchParams({ from: isoDaysAgo(days), to: isoToday() });
    if (provider) params.set("provider", provider);
    fetch("/api/v1/analytics/org?" + params.toString(), { cache: "no-store" })
      .then(async (res) => (res.ok ? (await res.json()).data : null))
      .then((d) => setData(d?.empty ? null : d))
      .finally(() => setLoading(false));
  }, [me, sessionLoading, days, provider]);

  if (sessionLoading || loading) return <PageSkeleton />;

  if (!data || data.stats.spendUsd <= 0) {
    return (
      <div>
        <SectionHeader title="Cost analytics" subtitle="Where every AI dollar goes — by provider, model, team and application." />
        <EmptyState
          title="No cost data yet"
          body="Connect a provider and sync usage to see cost breakdowns and projections."
          ctaHref="/dashboard/settings"
          ctaLabel="Connect provider"
        />
      </div>
    );
  }

  const s = data.stats;
  const monthDays = Math.max(1, data.daily.length);
  const projectedMonthly = days >= 28 ? (s.spendUsd / monthDays) * 30 : s.spendUsd * (30 / Math.min(days, 30));
  const savings = data.models.length >= 3 ? data.models[0]!.spendUsd * 0.18 : 0;
  const forecast = forecastFrom(data.monthly);

  return (
    <div>
      <SectionHeader
        title="Cost analytics"
        subtitle="Where every AI dollar goes — by provider, model, team and application."
        actions={
          <>
            <FilterDropdown value={provider} onChange={setProvider} options={PROVIDER_FILTER_OPTIONS} allLabel="All providers" />
            <RangePicker value={days} onChange={setDays} />
            <ExportMenu />
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total spend" value={fmtUsd0(s.spendUsd)} delta={s.deltaPct} goodWhenDown spark={data.daily.slice(-14).map((d) => d.spendUsd)} />
        <MetricCard label="Projected monthly spend" value={fmtUsd0(projectedMonthly)} />
        <MetricCard label="Spend growth" value={(s.deltaPct == null ? "—" : (s.deltaPct >= 0 ? "+" : "") + s.deltaPct.toFixed(1) + "%")} delta={s.deltaPct} goodWhenDown />
        <MetricCard label="Potential savings" value={fmtUsd0(savings)} spark={data.daily.slice(-14).map((d) => d.spendUsd * 0.82)} sparkColor="#16a34a" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Spend over time" subtitle={"Daily · last " + days + " days"} className="lg:col-span-2">
          <SpendAreaChart data={data.daily} />
        </ChartCard>
        <ChartCard title="Spend by provider">
          <ProviderDonut data={data.providers} />
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Spend by model">
          <ModelBars data={data.models.slice(0, 8)} />
        </ChartCard>
        <ChartCard title="Spend by team">
          <RankedBars data={data.teams.map((t) => ({ name: t.team, value: t.spendUsd }))} />
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Spend by application">
          <RankedBars data={data.applications.map((a) => ({ name: a.app, value: a.spendUsd }))} color="#8b5cf6" />
        </ChartCard>
        <ChartCard title="Monthly spend & forecast" subtitle="Linear projection, 3 months">
          <ForecastChart data={forecast} />
        </ChartCard>
      </div>
    </div>
  );
}

function ExportMenu() {
  const [open, setOpen] = useState(false);
  function csv(view: string) {
    const params = new URLSearchParams({ view, from: isoDaysAgo(90), to: isoToday() });
    window.location.href = "/api/v1/exports/csv?" + params.toString();
    setOpen(false);
  }
  return (
    <div className="relative">
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)}>
        <IconDownload size={13} /> Export
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border p-1 shadow-lg" style={{ background: "var(--surface)" }}>
          {[
            ["Daily spend (CSV)", () => csv("overview")],
            ["Cost by model (CSV)", () => csv("costs")],
            ["Cost by team (CSV)", () => csv("costs_by_team")],
            ["Monthly summary (PDF)", () => { window.location.href = "/api/v1/exports/pdf"; setOpen(false); }],
          ].map(([label, fn]) => (
            <button key={label as string} onClick={fn as () => void} className="w-full rounded-md px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-[var(--surface-2)]">
              {label as string}
            </button>
          ))}
        </div>
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
