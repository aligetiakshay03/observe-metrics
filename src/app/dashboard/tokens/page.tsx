"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel, EmptyState, Spinner } from "@/components/ui";
import { TokenStackedArea, CHART_COLORS } from "@/components/charts";
import { useSession } from "../../providers";

interface TokenAnalytics {
  byModel: { model: string; provider: string; inputTokens: number; outputTokens: number; total: number }[];
  series: { day: string; inputTokens: number; outputTokens: number }[];
  byProvider: { provider: string; inputTokens: number; outputTokens: number }[];
  totals: { inputTokens: number; outputTokens: number; total: number };
}

const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "6mo", days: 180 },
];

export default function TokensPage() {
  const { me, loading: sessionLoading } = useSession();
  const [range, setRange] = useState(30);
  const [provider, setProvider] = useState("");
  const [data, setData] = useState<TokenAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionLoading || !me) return;
    setLoading(true);
    const params = new URLSearchParams({ from: daysAgo(range), to: today() });
    if (provider) params.set("provider", provider);
    fetch("/api/v1/analytics/tokens?" + params.toString(), { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (res.ok) setData(json.data);
      })
      .finally(() => setLoading(false));
  }, [me, sessionLoading, range, provider]);

  if (sessionLoading || loading) return <Spinner />;

  const hasData = (data?.totals.total ?? 0) > 0;

  return (
    <div>
      <PageHeader
        title="Token Analytics"
        subtitle="Tokens consumed per model and per day"
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

      {!hasData ? (
        <EmptyState
          icon="◔"
          title="No token data yet"
          body="Once a provider connection syncs, token consumption by model appears here."
          ctaHref="/dashboard/settings"
          ctaLabel="Connect a provider"
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="panel p-5">
              <div className="text-xs muted">Total tokens</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{compact(data!.totals.total)}</div>
            </div>
            <div className="panel p-5">
              <div className="text-xs muted">Input tokens</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{compact(data!.totals.inputTokens)}</div>
            </div>
            <div className="panel p-5">
              <div className="text-xs muted">Output tokens</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{compact(data!.totals.outputTokens)}</div>
            </div>
          </div>

          <div className="mt-6">
            <Panel title="Daily token consumption (stacked input/output)">
              <TokenStackedArea data={data!.series} />
            </Panel>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel title="By model">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs muted">
                    <th className="pb-2">Model</th>
                    <th className="pb-2">Provider</th>
                    <th className="pb-2 text-right">Input</th>
                    <th className="pb-2 text-right">Output</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.byModel.map((m, i) => (
                    <tr key={m.model} className="border-t">
                      <td className="py-2">
                        <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        {m.model}
                      </td>
                      <td className="muted">{m.provider}</td>
                      <td className="py-2 text-right tabular-nums">{compact(m.inputTokens)}</td>
                      <td className="py-2 text-right tabular-nums">{compact(m.outputTokens)}</td>
                      <td className="py-2 text-right font-medium tabular-nums">{compact(m.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="By provider">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs muted">
                    <th className="pb-2">Provider</th>
                    <th className="pb-2 text-right">Input</th>
                    <th className="pb-2 text-right">Output</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.byProvider.map((p) => (
                    <tr key={p.provider} className="border-t">
                      <td className="py-2">{p.provider}</td>
                      <td className="py-2 text-right tabular-nums">{compact(p.inputTokens)}</td>
                      <td className="py-2 text-right tabular-nums">{compact(p.outputTokens)}</td>
                      <td className="py-2 text-right font-medium tabular-nums">{compact(p.inputTokens + p.outputTokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function compact(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(Math.round(v));
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
