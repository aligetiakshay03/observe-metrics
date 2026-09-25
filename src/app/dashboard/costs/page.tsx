"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel, EmptyState, Spinner } from "@/components/ui";
import { ModelBar, ForecastLine } from "@/components/charts";
import { useSession } from "../../providers";

interface CostAnalytics {
  byModel: { model: string; provider: string; spendUsd: number }[];
  byTeam: { team: string; spendUsd: number }[];
  monthly: { month: string; spendUsd: number }[];
  forecast: { month: string; spendUsd: number; projected: boolean }[];
  totals: { spendUsd: number; avgCostPerRequest: number };
}

const RANGES = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "6mo", days: 180 },
  { label: "1y", days: 365 },
];

export default function CostsPage() {
  const { me, loading: sessionLoading } = useSession();
  const [range, setRange] = useState(90);
  const [provider, setProvider] = useState("");
  const [data, setData] = useState<CostAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (sessionLoading || !me) return;
    setLoading(true);
    const params = new URLSearchParams({ from: daysAgo(range), to: today() });
    if (provider) params.set("provider", provider);
    fetch("/api/v1/analytics/costs?" + params.toString(), { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (res.ok) setData(json.data);
      })
      .finally(() => setLoading(false));
  }, [me, sessionLoading, range, provider]);

  if (sessionLoading || loading) return <Spinner />;

  const hasData = (data?.totals.spendUsd ?? 0) > 0;
  const canExport = me?.activeOrg?.limits?.exports ?? false;
  const fmtUsd = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function exportCsv(view: string) {
    const params = new URLSearchParams({ view, from: daysAgo(range), to: today() });
    if (provider) params.set("provider", provider);
    window.location.href = "/api/v1/exports/csv?" + params.toString();
  }

  return (
    <div>
      <PageHeader
        title="Cost Analytics"
        subtitle="Where the money goes — by model, team, and month"
        actions={
          <>
            {canExport && (
              <div className="relative">
                <button onClick={() => setExportOpen((o) => !o)} className="btn btn-outline">
                  Export ▾
                </button>
                {exportOpen && (
                  <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border p-1 shadow-lg" style={{ background: "var(--panel)" }}>
                    <button onClick={() => { setExportOpen(false); exportCsv("overview"); }} className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5">Daily spend (CSV)</button>
                    <button onClick={() => { setExportOpen(false); exportCsv("costs"); }} className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5">Cost by model (CSV)</button>
                    <button onClick={() => { setExportOpen(false); exportCsv("costs_by_team"); }} className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5">Cost by team (CSV)</button>
                    <button
                      onClick={() => { setExportOpen(false); window.location.href = "/api/v1/exports/pdf"; }}
                      className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      Monthly summary (PDF)
                    </button>
                  </div>
                )}
              </div>
            )}
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
          icon="▤"
          title="No cost data yet"
          body="Cost by model, team and forecast appear once a provider connection has synced usage."
          ctaHref="/dashboard/settings"
          ctaLabel="Connect a provider"
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="panel p-5">
              <div className="text-xs muted">Total spend (period)</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{fmtUsd(data!.totals.spendUsd)}</div>
            </div>
            <div className="panel p-5">
              <div className="text-xs muted">Avg cost per request</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{fmtUsd(data!.totals.avgCostPerRequest)}</div>
            </div>
            <div className="panel p-5">
              <div className="text-xs muted">Projected next month</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {data!.forecast.filter((f) => f.projected).length > 0
                  ? fmtUsd(data!.forecast.filter((f) => f.projected)[0]!.spendUsd)
                  : "—"}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Panel title="Cost by model">
              <ModelBar data={data!.byModel.slice(0, 10)} />
            </Panel>
            <Panel title="Cost by team">
              {data!.byTeam.length ? (
                <div className="space-y-4 pt-2">
                  {data!.byTeam.map((t) => {
                    const max = data!.byTeam[0]!.spendUsd || 1;
                    return (
                      <div key={t.team}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span>{t.team}</span>
                          <span className="font-medium tabular-nums">{fmtUsd(t.spendUsd)}</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "rgba(128,128,128,0.15)" }}>
                          <div className="h-full rounded-full" style={{ width: (t.spendUsd / max) * 100 + "%", background: "var(--accent)" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-10 text-center text-sm muted">
                  No team tagging yet. Set a team on members in Settings → Team.
                </p>
              )}
            </Panel>
          </div>

          <div className="mt-4">
            <Panel title="Monthly spend & forecast">
              <ForecastLine data={data!.forecast} />
              <p className="mt-2 text-xs muted">
                Dashed region beyond the last complete month is a linear-regression projection (3 months).
              </p>
            </Panel>
          </div>
        </>
      )}
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
