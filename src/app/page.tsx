"use client";

import Link from "next/link";
import { useSession } from "./providers";
import { SpendAreaChart, ProviderDonut, RankedBars } from "@/components/charts";
import { PROVIDER_COLORS, PROVIDER_LABELS, LogoMark } from "@/components/ui";
import { IconZap, IconClock, IconLightbulb } from "@/components/icons";

/* ── Demo dataset: one coherent story, reused by the preview sections ── */

const PREVIEW_KPI = [
  { label: "AI spend", value: "$4,182.50", delta: "+12.4%", down: false },
  { label: "Requests", value: "128,902", delta: "+3.1%", down: false },
  { label: "Tokens", value: "412M", delta: "+8.9%", down: false },
  { label: "Avg latency", value: "1.84s", delta: "-6.2%", down: true },
];

const PREVIEW_PROVIDERS = [
  { provider: "OPENAI", spendUsd: 1757 },
  { provider: "ANTHROPIC", spendUsd: 1297 },
  { provider: "GOOGLE", spendUsd: 753 },
  { provider: "MISTRAL", spendUsd: 376 },
];

const PREVIEW_TREND = [
  78, 92, 85, 110, 96, 71, 88, 104, 118, 101, 94, 123, 132, 118, 109, 141, 135, 128, 149, 142, 156, 138, 131, 160, 171, 154, 166, 178, 169, 182,
].map((v, i) => {
  const d = new Date(Date.UTC(2026, 7, 27 + i));
  return { day: d.toISOString().slice(0, 10), spendUsd: v };
});

const PREVIEW_MODELS = [
  { name: "gpt-4o", value: 1840 },
  { name: "claude-sonnet-4-5", value: 1120 },
  { name: "claude-opus-4-1", value: 620 },
  { name: "gemini-2.5-pro", value: 418 },
  { name: "gemini-2.5-flash", value: 335 },
  { name: "mistral-large-2", value: 245 },
];

const CAPABILITIES = [
  {
    kicker: "Cost",
    title: "Know what every model and workflow costs",
    body: "Attribute every dollar to a model, team, or application. Cost per request, cost per token, projected spend — computed continuously from provider usage APIs.",
  },
  {
    kicker: "Performance",
    title: "Track latency, errors and reliability",
    body: "Request latency and error rates per model, weighted by your real traffic. Spot degradation before your users do.",
  },
  {
    kicker: "Usage",
    title: "See who consumes AI — and how much",
    body: "Token consumption by team, user and application. Input vs output split, tokens per request, and the workflows driving your bill.",
  },
  {
    kicker: "Optimization",
    title: "Reduce cost without sacrificing quality",
    body: "Route suggestions, oversized-context detection, and model comparisons based on your actual usage patterns — not benchmarks.",
  },
];

const NAV_LINKS = ["Product", "Solutions", "Pricing", "Docs"];

export default function LandingPage() {
  const { me, loading } = useSession();
  const authed = !loading && !!me;

  return (
    <main className="min-h-screen">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b" style={{ background: "color-mix(in srgb, var(--surface) 86%, transparent)", backdropFilter: "blur(10px)" }}>
        <div className="mx-auto flex h-[52px] max-w-[1120px] items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2">
            <LogoMark />
            <span className="text-[14px] font-semibold tracking-tight">ObserveMetrics</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((l) => (
              <a key={l} href={"#" + l.toLowerCase()} className="rounded-md px-2.5 py-1.5 text-[13px] muted transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
                {l}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {authed ? (
              <Link href="/dashboard" className="btn btn-primary btn-sm">Open dashboard</Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>
                <Link href="/register" className="btn btn-primary btn-sm">Start free</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="mx-auto max-w-[1120px] px-5 pb-10 pt-14">
        <div className="mx-auto max-w-[720px] text-center">
          <span className="label" style={{ color: "var(--accent)" }}>AI usage &amp; cost intelligence</span>
          <h1 className="mt-3 text-[38px] font-semibold leading-[1.12] tracking-[-0.03em] md:text-[44px]">
            Know exactly what your AI is costing you.
            <br />
            <span style={{ color: "var(--accent)" }}>Then find where to optimize it.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[560px] text-[15px] leading-relaxed muted">
            ObserveMetrics tracks models, tokens, spend, latency and usage across your entire AI stack — in one place.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2.5">
            <Link href={authed ? "/dashboard" : "/register"} className="btn btn-primary btn-lg">Start free</Link>
            <a href="#preview" className="btn btn-secondary btn-lg">View demo</a>
          </div>
        </div>

        {/* ── Product preview: real UI, real numbers ── */}
        <div id="preview" className="mx-auto mt-12 max-w-[980px] scroll-mt-20">
          <div className="surface overflow-hidden" style={{ boxShadow: "0 1px 2px rgba(17,17,17,0.04), 0 12px 40px rgba(17,17,17,0.09)" }}>
            {/* preview topbar */}
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <LogoMark size={18} />
                <span className="text-[12.5px] font-semibold">ObserveMetrics</span>
                <span className="faint">/</span>
                <span className="text-[12.5px] muted">Overview</span>
              </div>
              <div className="hidden items-center gap-1.5 sm:flex">
                <span className="badge badge-neutral">Last 30 days</span>
                <span className="badge badge-neutral">All providers</span>
              </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 gap-px border-b lg:grid-cols-4" style={{ background: "var(--border)" }}>
              {PREVIEW_KPI.map((k) => (
                <div key={k.label} className="px-4 py-3" style={{ background: "var(--surface)" }}>
                  <div className="label">{k.label}</div>
                  <div className="mt-1 text-[20px] font-bold leading-none tracking-tight tabular-nums">{k.value}</div>
                  <div className="mt-1.5 text-[11.5px] font-medium" style={{ color: k.down ? "var(--success)" : "var(--warning)" }}>
                    {k.delta}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-px lg:grid-cols-3" style={{ background: "var(--border)" }}>
              {/* spend chart */}
              <div className="p-4 lg:col-span-2" style={{ background: "var(--surface)" }}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold">AI spend over time</h3>
                  <div className="segmented">
                    <button data-active={false}>7D</button>
                    <button data-active={true}>30D</button>
                    <button data-active={false}>90D</button>
                  </div>
                </div>
                <SpendAreaChart data={PREVIEW_TREND} height={190} />
              </div>
              {/* provider donut */}
              <div className="p-4" style={{ background: "var(--surface)" }}>
                <h3 className="mb-2 text-[13px] font-semibold">Spend by provider</h3>
                <ProviderDonut data={PREVIEW_PROVIDERS} height={150} />
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs faint">Live product view — your data, every provider, one place.</p>
        </div>
      </section>

      {/* ── Section: where spend goes ── */}
      <section id="product" className="border-t py-16">
        <div className="mx-auto max-w-[1120px] px-5">
          <div className="max-w-[560px]">
            <span className="label">Visibility</span>
            <h2 className="mt-2 text-[26px] font-semibold tracking-tight">See where your AI spend is going.</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed muted">
              Every request is broken down by provider, model, team and day — so the invoice is never a surprise.
            </p>
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <div className="surface p-4 lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold">Daily spend by period</h3>
                <span className="badge badge-neutral">Rolling 30 days</span>
              </div>
              <SpendAreaChart data={PREVIEW_TREND} height={210} />
            </div>
            <div className="surface p-4">
              <h3 className="mb-3 text-[13px] font-semibold">By provider</h3>
              <ProviderDonut data={PREVIEW_PROVIDERS} height={140} />
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="surface p-4">
              <h3 className="mb-3 text-[13px] font-semibold">By model</h3>
              <RankedBars data={PREVIEW_MODELS} />
            </div>
            <div className="surface p-4">
              <h3 className="mb-3 text-[13px] font-semibold">By team</h3>
              <RankedBars
                data={[
                  { name: "Engineering", value: 1820 },
                  { name: "Support", value: 1120 },
                  { name: "Marketing", value: 740 },
                  { name: "Sales", value: 502 },
                ]}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Section: anomalies ── */}
      <section id="solutions" className="border-t py-16">
        <div className="mx-auto max-w-[1120px] px-5">
          <div className="max-w-[560px]">
            <span className="label">Intelligence</span>
            <h2 className="mt-2 text-[26px] font-semibold tracking-tight">Find expensive patterns before they become expensive problems.</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed muted">
              ObserveMetrics continuously analyzes your usage and surfaces anomalies, optimizations and performance shifts.
            </p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {/* Anomaly card */}
            <div className="surface p-4">
              <div className="flex items-center justify-between">
                <span className="badge badge-danger"><IconZap size={11} />Cost anomaly</span>
              </div>
              <h3 className="mt-3 text-[14px] font-semibold leading-snug">Claude usage increased 38%</h3>
              <p className="mt-1 text-[13px] muted">Customer Support Agent</p>
              <dl className="mt-3 space-y-1.5 border-t pt-3 text-[13px]">
                <div className="flex justify-between"><dt className="muted">Input tokens</dt><dd className="font-medium" style={{ color: "var(--warning)" }}>+42%</dd></div>
                <div className="flex justify-between"><dt className="muted">Est. monthly impact</dt><dd className="font-semibold tabular-nums">+$740</dd></div>
              </dl>
              <button className="btn btn-secondary btn-sm mt-4 w-full">View insight</button>
            </div>
            {/* Optimization card */}
            <div className="surface p-4">
              <div className="flex items-center justify-between">
                <span className="badge badge-accent"><IconLightbulb size={11} />Optimization</span>
              </div>
              <h3 className="mt-3 text-[14px] font-semibold leading-snug">Oversized context windows</h3>
              <p className="mt-1 text-[13px] muted">Customer Support Agent sends 3.2× more input than needed on routine tickets.</p>
              <dl className="mt-3 space-y-1.5 border-t pt-3 text-[13px]">
                <div className="flex justify-between"><dt className="muted">Potential savings</dt><dd className="font-semibold tabular-nums" style={{ color: "var(--success)" }}>$430/mo</dd></div>
              </dl>
              <button className="btn btn-secondary btn-sm mt-4 w-full">View insight</button>
            </div>
            {/* Latency card */}
            <div className="surface p-4">
              <div className="flex items-center justify-between">
                <span className="badge badge-success"><IconClock size={11} />Performance</span>
              </div>
              <h3 className="mt-3 text-[14px] font-semibold leading-snug">Gemini leads on latency</h3>
              <p className="mt-1 text-[13px] muted">Lowest average latency for your high-volume workloads — 1.2s vs 1.8s fleet average.</p>
              <dl className="mt-3 space-y-1.5 border-t pt-3 text-[13px]">
                <div className="flex justify-between"><dt className="muted">High-volume requests</dt><dd className="font-medium tabular-nums">29,840</dd></div>
              </dl>
              <button className="btn btn-secondary btn-sm mt-4 w-full">View insight</button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section: capabilities ── */}
      <section id="pricing" className="border-t py-16">
        <div className="mx-auto max-w-[1120px] px-5">
          <div className="max-w-[560px]">
            <span className="label">Platform</span>
            <h2 className="mt-2 text-[26px] font-semibold tracking-tight">Measure more than tokens.</h2>
          </div>
          <div className="mt-8 grid gap-px overflow-hidden rounded-[10px] border md:grid-cols-2" style={{ background: "var(--border)" }}>
            {CAPABILITIES.map((c) => (
              <div key={c.kicker} className="p-5" style={{ background: "var(--surface)" }}>
                <span className="label" style={{ color: "var(--accent)" }}>{c.kicker}</span>
                <h3 className="mt-2 text-[15px] font-semibold">{c.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed muted">{c.body}</p>
              </div>
            ))}
          </div>

          {/* Provider support strip */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t pt-8">
            {Object.entries(PROVIDER_LABELS).filter(([k]) => k !== "DEMO").map(([k, label]) => (
              <span key={k} className="flex items-center gap-2 text-[13px] font-medium muted">
                <span className="dot" style={{ background: PROVIDER_COLORS[k] }} />
                {label}
              </span>
            ))}
          </div>

          {/* Final CTA */}
          <div className="surface mt-10 flex flex-col items-center justify-between gap-4 p-6 sm:flex-row">
            <div>
              <h3 className="text-[16px] font-semibold">Start tracking your AI spend in minutes.</h3>
              <p className="mt-0.5 text-[13px] muted">Connect a provider key — first insights within the hour. Free plan, no card.</p>
            </div>
            <Link href={authed ? "/dashboard" : "/register"} className="btn btn-primary shrink-0">Start free</Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-3 px-5">
          <div className="flex items-center gap-2">
            <LogoMark size={16} />
            <span className="text-[13px] font-medium">ObserveMetrics</span>
          </div>
          <p className="text-xs faint">© 2026 ObserveMetrics · AI usage &amp; cost intelligence</p>
        </div>
      </footer>
    </main>
  );
}

