"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, KpiCard, Panel, EmptyState, Spinner } from "@/components/ui";
import { SpendTrendChart, ProviderPie, ModelBar } from "@/components/charts";
import { useSession } from "../providers";

interface Overview {
  totals: {
    spendUsd: number;
    inputTokens: number;
    outputTokens: number;
    requests: number;
    prevSpendUsd: number;
    deltaPct: number | null;
  };
  trend: { day: string; spendUsd: number; tokens: number }[];
  byProvider: { provider: string; spendUsd: number; tokens: number }[];
  byModel: { model: string; provider: string; spendUsd: number; tokens: number }[];
}

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export default function OverviewPage() {
  const { me, loading: sessionLoading } = useSession();
  const [range, setRange] = useState(30);
  const [provider, setProvider] = useState<string>("");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionLoading || !me) return;
    setLoading(true);
    const params = new URLSearchParams({ from: daysAgo(range), to: today() });
    if (provider) params.set("provider", provider);
    fetch("/api/v1/analytics/overview?" + params.toString(), { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (res.ok) setData(json.data);
      })
      .finally(() => setLoading(false));
  }, [me, sessionLoading, range, provider]);

  const hasData = useMemo(() => (data?.trend.length ?? 0) > 0, [data]);

  if (sessionLoading || loading) return <Spinner />;

  if (!hasData) {
    return (
      <div>
        <PageHeader title="Overview" subtitle="Spend and usage across your AI providers" />
        <EmptyState
          icon="🔌"
          title="Connect your first AI provider"
          body="Connect OpenAI, Anthropic, Google Gemini or the Demo sandbox to see spend, tokens and trends here."
          ctaHref="/dashboard/settings"
          ctaLabel="Connect a provider"
        />
      </div>
    );
  }

  const fmtUsd = (v: number) =>
    "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtCompact = (v: number) => {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return String(v);
  };

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle={me?.activeOrg ? me.activeOrg.name + " · last " + range + " days" : ""}
        actions={
          <>
            <select className="input w-auto" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="">All providers</option>
              {["OPENAI", "ANTHROPIC", "GOOGLE", "MISTRAL", "DEMO"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <div className="flex rounded-lg border" style={{ borderColor: "var(--border)" }}>
              {RANGES.map((r) => (
                <button
                  key={r.days}
                  onClick={() => setRange(r.days)}
                  className="px-3 py-2 text-sm"
                  style={range === r.days ? { background: "var(--accent)", color: "#fff", borderRadius: 8 } : { borderRadius: 8 }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Spend (period)" value={fmtUsd(data!.totals.spendUsd)} delta={data!.totals.deltaPct} />
        <KpiCard label="Total requests" value={fmtCompact(data!.totals.requests)} />
        <KpiCard label="Input tokens" value={fmtCompact(data!.totals.inputTokens)} />
        <KpiCard label="Output tokens" value={fmtCompact(data!.totals.outputTokens)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Spend trend (daily)" className="lg:col-span-2">
          <SpendTrendChart data={data!.trend} />
        </Panel>
        <Panel title="Spend by provider">
          <ProviderPie data={data!.byProvider} />
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Spend by model">
          <ModelBar data={data!.byModel.slice(0, 10)} />
        </Panel>
      </div>
    </div>
  );
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
