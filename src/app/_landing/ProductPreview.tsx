"use client";

import { useMemo } from "react";
import { ArrowRight, Boxes, CircleDollarSign, LayoutDashboard, Lightbulb, PiggyBank, Siren, TrendingUp, Users, Activity, AppWindow, Wallet } from "lucide-react";
import { Donut, TrendChart } from "@/components/charts";
import { Delta, ModelName, ProviderName, Sparkline } from "@/components/ui/primitives";
import { LogoMark } from "@/components/brand/Logo";
import { fmtCompact, fmtMs, fmtNumber, fmtRate, fmtUsd, providerColor } from "@/lib/format";
import { SAMPLE, SAMPLE_MODELS, SAMPLE_PROVIDERS, sampleSeries } from "./sample";

/**
 * Landing-page product preview built from the real chart and UI components
 * with static sample data (labelled "Sample workspace").
 */
export function ProductPreview() {
  const series = useMemo(() => sampleSeries(), []);
  const spark = (k: "costUsd" | "requests" | "tokens") => series.slice(-14).map((p) => p[k]);
  const latSpark = [1.98, 1.96, 1.97, 1.93, 1.92, 1.95, 1.9, 1.89, 1.88, 1.9, 1.86, 1.85, 1.84, 1.84];

  return (
    <div className="relative mx-auto max-w-[1200px]">
      <div className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[40px] bg-accent-soft opacity-60 blur-3xl" aria-hidden />
      <div className="overflow-hidden rounded-xl border border-border-strong bg-bg shadow-pop" role="img" aria-label="ObserveMetrics dashboard preview with sample data: $4,182.50 AI spend, 128,902 requests, 412M tokens, 1.84s average latency.">
        <div className="flex">
          {/* mini sidebar */}
          <div className="hidden w-[168px] shrink-0 border-r border-border bg-surface p-2.5 md:block" aria-hidden>
            <div className="mb-3 flex items-center gap-1.5 px-1.5 pt-0.5">
              <LogoMark size={18} />
              <span className="text-xs font-semibold">ObserveMetrics</span>
            </div>
            <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-surface-2/60 px-2 py-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-accent-soft text-[9px] font-semibold text-accent">HL</span>
              <span className="text-[11px] font-medium">Helix Labs</span>
            </div>
            {[
              [LayoutDashboard, "Overview", true],
              [Activity, "Usage"],
              [CircleDollarSign, "Costs"],
              [Boxes, "Models"],
              [Users, "Teams"],
              [AppWindow, "Applications"],
              [Wallet, "Budgets"],
              [Siren, "Alerts"],
            ].map(([Icon, label, active]) => {
              const I = Icon as typeof LayoutDashboard;
              return (
                <div key={label as string} className={`mb-0.5 flex h-7 items-center gap-2 rounded-md px-2 text-[11px] ${active ? "bg-accent-soft font-medium text-accent" : "text-muted"}`}>
                  <I size={13} />
                  {label as string}
                </div>
              );
            })}
          </div>

          <div className="min-w-0 flex-1 p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Overview</p>
                <p className="text-2xs text-muted">Sample workspace · Last 30 days</p>
              </div>
              <div className="flex h-7 rounded-md border border-border bg-surface p-0.5 text-2xs font-medium" aria-hidden>
                {["7D", "30D", "90D", "12M"].map((r) => (
                  <span key={r} className={`flex items-center rounded-[4px] px-2 ${r === "30D" ? "bg-surface-3 text-fg" : "text-muted"}`}>
                    {r}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Tile label="AI spend" value={fmtUsd(SAMPLE.spendUsd)} change={SAMPLE.spendChange} inverse spark={spark("costUsd")} color="var(--c1)" />
              <Tile label="Requests" value={fmtNumber(SAMPLE.requests)} change={SAMPLE.requestsChange} spark={spark("requests")} color="var(--c3)" />
              <Tile label="Tokens" value={fmtCompact(SAMPLE.tokens)} change={SAMPLE.tokensChange} spark={spark("tokens")} color="var(--c2)" neutral />
              <Tile label="Avg latency" value={fmtMs(SAMPLE.latencyMs)} change={SAMPLE.latencyChange} inverse spark={latSpark} color="var(--c4)" />
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-5">
              <div className="card p-3 lg:col-span-3">
                <p className="text-xs font-semibold">AI spend over time</p>
                <p className="mb-1 text-2xs text-muted">{fmtUsd(SAMPLE.spendUsd)} across 30 days</p>
                <TrendChart data={series} height={176} />
              </div>
              <div className="card p-3 lg:col-span-2">
                <p className="mb-2 text-xs font-semibold">Spend by provider</p>
                <Donut height={124} centerLabel="Spend" items={SAMPLE_PROVIDERS.map((p, i) => ({ ...p, color: providerColor(p.id, i) }))} />
              </div>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-5">
              <div className="card overflow-hidden lg:col-span-3">
                <p className="px-3 pb-1 pt-2.5 text-xs font-semibold">Model performance</p>
                <div className="overflow-x-auto">
                  <table className="table text-xs [&_td]:h-9 [&_th]:h-7">
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th className="hidden sm:table-cell">Provider</th>
                        <th className="text-right">Requests</th>
                        <th className="text-right">Spend</th>
                        <th className="hidden text-right sm:table-cell">Latency</th>
                        <th className="hidden text-right md:table-cell">Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SAMPLE_MODELS.map((m) => (
                        <tr key={m.model}>
                          <td className="text-xs">
                            <ModelName model={m.model} sub={false} />
                          </td>
                          <td className="hidden text-xs sm:table-cell">
                            <ProviderName provider={m.provider} />
                          </td>
                          <td className="num">{fmtNumber(m.requests)}</td>
                          <td className="num font-medium">{fmtUsd(m.costUsd)}</td>
                          <td className="num hidden sm:table-cell">{fmtMs(m.latencyMs)}</td>
                          <td className="num hidden md:table-cell">{fmtRate(m.errorRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="card p-3 lg:col-span-2">
                <p className="mb-2 text-xs font-semibold">AI insights</p>
                <div className="space-y-2">
                  <MiniInsight
                    icon={<TrendingUp size={11} />}
                    type="Cost anomaly"
                    sev="Critical"
                    title="Claude usage increased 38%"
                    scope="Customer Support Agent"
                    impact="+$740/mo est. impact"
                    tone="danger"
                  />
                  <MiniInsight
                    icon={<PiggyBank size={11} />}
                    type="Model routing"
                    sev="Info"
                    title="Route short Marketing Copilot requests to Gemini 2.5 Flash"
                    scope="Marketing Copilot · Gemini 2.5 Pro"
                    impact="Save ~$210/mo est."
                    tone="success"
                  />
                  <MiniInsight icon={<Lightbulb size={11} />} type="Duplicate requests" sev="Info" title="890 duplicate prompts in Internal Knowledge Agent" scope="GPT-4.1" impact="Save ~$60/mo est." tone="success" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, change, inverse, neutral, spark, color }: { label: string; value: string; change: number; inverse?: boolean; neutral?: boolean; spark: number[]; color: string }) {
  return (
    <div className="card flex flex-col justify-between gap-2 p-3">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold leading-none tracking-tight tabular-nums">{value}</div>
          <div className="mt-1.5">
            <Delta value={change} inverse={inverse} neutral={neutral} />
          </div>
        </div>
        <span className="hidden sm:block">
          <Sparkline data={spark} color={color} width={64} height={24} />
        </span>
      </div>
    </div>
  );
}

function MiniInsight({ icon, type, sev, title, scope, impact, tone }: { icon: React.ReactNode; type: string; sev: string; title: string; scope: string; impact: string; tone: "danger" | "success" }) {
  return (
    <div className="rounded-md border border-border bg-surface p-2.5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted">
          {icon}
          {type}
        </span>
        <span className={`badge ${sev === "Critical" ? "badge-danger" : "badge-accent"}`}>{sev}</span>
      </div>
      <p className="mt-1 text-xs font-medium leading-snug">{title}</p>
      <p className="mt-0.5 truncate text-[10px] text-faint">{scope}</p>
      <div className="mt-1.5 flex items-center justify-between">
        <span className={`text-[11px] font-medium ${tone === "danger" ? "text-danger" : "text-success"}`}>{impact}</span>
        <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-accent">
          View insight <ArrowRight size={10} />
        </span>
      </div>
    </div>
  );
}
