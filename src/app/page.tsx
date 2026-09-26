import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CircleDollarSign,
  Gauge,
  KeyRound,
  Lightbulb,
  Lock,
  PiggyBank,
  Plug,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  Activity,
  FileLock2,
  ChevronDown,
} from "lucide-react";
import { getServerAuth } from "@/server/auth/server";
import { SiteFooter, SiteHeader } from "./_landing/SiteHeader";
import { ProductPreview } from "./_landing/ProductPreview";

export const metadata: Metadata = {
  title: { absolute: "ObserveMetrics — AI Usage & Cost Intelligence" },
  description:
    "Track models, tokens, spend, latency and usage across your AI stack — then uncover the patterns driving cost and performance. Free during launch.",
  alternates: { canonical: "/" },
};

export const dynamic = "force-dynamic";

const PROVIDERS = ["OpenAI", "Anthropic", "Google Gemini", "Mistral"];

const FEATURES = [
  {
    id: "cost",
    icon: CircleDollarSign,
    title: "AI cost visibility",
    body: "Spend by provider, model, team and application with daily trends, month-end projections and a change waterfall that shows exactly where the increase came from.",
    points: ["Provider-reported costs where available", "Estimates clearly labelled as estimates", "CSV export for finance"],
  },
  {
    id: "models",
    icon: Boxes,
    title: "Model performance",
    body: "Compare models side by side on cost per request, measured latency, error rate and usage — using data from your own traffic, not benchmarks.",
    points: ["Cost per request and per token", "Latency and error rate from instrumented apps", "2–4 model comparison view"],
  },
  {
    id: "attribution",
    icon: Users,
    title: "Team & application attribution",
    body: "Tag requests with an application, team and user. See which product surface or group drives spend, and who the top consumers are.",
    points: ["Applications created on first event", "Team and app budgets", "Top users per team"],
  },
  {
    id: "insights",
    icon: Lightbulb,
    title: "AI insights",
    body: "Deterministic rules detect cost anomalies, usage spikes, latency regressions, error spikes and provider incidents — each with evidence, cause and a recommended action.",
    points: ["Every number traceable to your data", "Severity and estimated impact", "Alerts and notifications"],
  },
  {
    id: "optimization",
    icon: PiggyBank,
    title: "Optimization",
    body: "Find oversized context windows, duplicate prompts and expensive models used for short-output tasks, with estimated monthly savings you can act on.",
    points: ["Oversized context detection", "Duplicate-prompt detection via prompt hashes", "Cheaper-model routing candidates"],
  },
  {
    id: "security",
    icon: ShieldCheck,
    title: "Security by default",
    body: "Provider keys are encrypted server-side and never sent back to the browser. Workspaces are isolated, roles are enforced on the server, and every sensitive action is audit-logged.",
    points: ["AES-256-GCM encrypted credentials", "Owner / Admin / Member / Viewer roles", "Audit log of sensitive changes"],
  },
];

const FAQ = [
  {
    q: "Is ObserveMetrics free?",
    a: "Yes. ObserveMetrics is free during launch — every feature, including budgets, alerts, insights and exports. There is no credit card or trial to manage.",
  },
  {
    q: "Can it read my personal ChatGPT or Claude subscription usage?",
    a: "No. ObserveMetrics works with provider APIs and company API usage: organization usage and cost APIs (OpenAI and Anthropic Admin keys) and applications you instrument with the ingestion API. Consumer chat subscriptions don't expose usage to third parties.",
  },
  {
    q: "How are costs calculated?",
    a: "When a provider's cost API reports spend, that figure is used and labelled “Provider reported”. Otherwise cost is estimated from recorded tokens and the model's list price and labelled “Estimated”. Estimates are never presented as an invoice.",
  },
  {
    q: "Where are API keys stored?",
    a: "Server-side only, encrypted with AES-256-GCM and bound to your workspace. Keys are never returned to the browser after saving, never written to logs and never placed in URLs — you'll only ever see the last four characters.",
  },
  {
    q: "Which providers are supported?",
    a: "OpenAI and Anthropic usage and costs sync automatically with an Admin key. Google Gemini and Mistral keys are verified and their models listed; usage for those providers — and any other provider — is sent through the ingestion API.",
  },
  {
    q: "Do you store my prompts?",
    a: "No. The ingestion API accepts token counts, latency, status and metadata. For duplicate detection you can send a hash of the prompt, computed in your application — never the prompt itself.",
  },
];

export default async function LandingPage() {
  const auth = await getServerAuth().catch(() => null);
  const authed = !!auth && !auth.user.isGuest;
  const primary = authed ? { href: "/dashboard", label: "Open dashboard" } : { href: "/signup", label: "Start free" };

  return (
    <div className="min-h-screen overflow-x-hidden">
      <SiteHeader authed={authed} />
      <main id="main">
        {/* Hero */}
        <section className="relative border-b border-border">
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
            aria-hidden
          />
          <div className="mx-auto max-w-[1200px] px-4 pb-14 pt-14 sm:px-6 md:pt-20">
            <div className="mx-auto max-w-3xl text-center">
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-2xs font-semibold uppercase tracking-[0.12em] text-muted shadow-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                AI usage &amp; cost intelligence
              </p>
              <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-5xl md:text-[56px]">
                Know exactly what your AI is costing you.
                <span className="block text-muted">Then find where to optimize it.</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
                Observe every model, request, token, dollar and millisecond across your AI stack — in one place.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Link href={primary.href} className="btn btn-primary btn-lg">
                  {primary.label} <ArrowRight size={15} aria-hidden />
                </Link>
                <Link href="/demo" className="btn btn-secondary btn-lg">
                  View demo
                </Link>
              </div>
              <p className="mt-4 text-xs text-faint">Free during launch · No credit card · Works with {PROVIDERS.join(", ")}</p>
            </div>
            <div className="mt-12 md:mt-14">
              <ProductPreview />
            </div>
          </div>
        </section>

        {/* Positioning */}
        <section id="product" className="scroll-mt-16 border-b border-border">
          <div className="mx-auto grid grid-cols-1 max-w-[1200px] gap-8 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.4fr] md:py-20">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-accent">Track. Understand. Optimize.</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">We make AI usage understandable.</h2>
              <p className="mt-3 text-muted">
                Not another token counter. ObserveMetrics combines observability, cost intelligence, usage analytics and performance data so engineering and finance can answer the same questions from the same numbers.
              </p>
            </div>
            <ul className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              {[
                "How much are we spending on AI — and what will this month cost?",
                "Which provider, model, team or application costs the most?",
                "Which models are fastest, and which fail most often?",
                "Why did our AI spend increase last week?",
                "Where are we wasting tokens on oversized context or repeats?",
                "Which anomalies should we investigate first?",
              ].map((q) => (
                <li key={q} className="flex gap-2.5 border-t border-border pt-3 text-fg/90">
                  <ScanSearch size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                  {q}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section id="solutions" className="scroll-mt-16 border-b border-border bg-surface/50">
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 md:py-20">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight">Everything between the API bill and the product that caused it.</h2>
              <p className="mt-3 text-muted">One workspace for every provider, with every metric labelled by where it came from.</p>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.id} id={f.id} className="scroll-mt-20 bg-surface p-6">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-2 text-fg">
                    <f.icon size={16} aria-hidden />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
                  <ul className="mt-4 space-y-1.5 text-sm">
                    {f.points.map((p) => (
                      <li key={p} className="flex items-center gap-2 text-fg/90">
                        <span className="h-1 w-1 rounded-full bg-accent" aria-hidden />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Insight explainer */}
        <section className="border-b border-border">
          <div className="mx-auto grid grid-cols-1 max-w-[1200px] items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-20">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-accent">Insights that explain themselves</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">From “spend went up” to “here’s why, and what to do”.</h2>
              <p className="mt-3 text-muted">
                Every insight shows what happened, why it matters, what caused it and the recommended action — with the evidence metrics and the affected model, team and application one click away.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs">
                {["Cost anomaly", "Usage spike", "Latency regression", "Error spike", "Oversized context", "High-cost model", "Duplicate requests", "Budget threshold", "Provider incident"].map((t) => (
                  <span key={t} className="badge badge-neutral h-6 px-2 text-xs">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="card overflow-hidden shadow-sm">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <span className="text-2xs font-semibold uppercase tracking-wide text-muted">Cost anomaly</span>
                <span className="badge badge-danger">Critical</span>
              </div>
              <div className="space-y-4 p-5 text-sm">
                <div>
                  <p className="text-base font-semibold">Claude usage increased 38%</p>
                  <p className="text-xs text-muted">Customer Support Agent · Claude Sonnet 4.6 · Support</p>
                </div>
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wide text-faint">What caused it</p>
                  <p className="mt-1 text-fg/90">Average input tokens per request increased while request volume grew only slightly.</p>
                </div>
                <dl className="grid grid-cols-3 gap-2">
                  {[
                    ["Input tokens", "+42%"],
                    ["Requests", "+8%"],
                    ["Avg context", "+36%"],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-md border border-border bg-surface-2/50 px-3 py-2">
                      <dt className="text-2xs text-muted">{k}</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-danger">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wide text-faint">Recommended action</p>
                  <p className="mt-1 text-fg/90">Review retained conversation context and reduce unnecessary context for routine support requests.</p>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <span className="text-xs text-muted">Estimated monthly impact</span>
                  <span className="font-semibold tabular-nums text-danger">+$740</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-b border-border bg-surface/50">
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 md:py-20">
            <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
            <ol className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
              {[
                { n: "01", icon: Plug, t: "Connect", b: "Add an OpenAI or Anthropic Admin key to sync organization usage and costs, or send events from your apps with a workspace ingestion key." },
                { n: "02", icon: Activity, t: "Observe", b: "Usage is normalized into one schema — provider, model, application, team, user, tokens, cost, latency, status — and rolled up daily." },
                { n: "03", icon: Sparkles, t: "Optimize", b: "Insights, budgets and alerts point to the anomalies worth investigating and the changes most likely to save money." },
              ].map((s) => (
                <li key={s.n} className="card p-6">
                  <div className="flex items-center justify-between">
                    <s.icon size={18} className="text-accent" aria-hidden />
                    <span className="font-mono text-xs text-faint">{s.n}</span>
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{s.t}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.b}</p>
                </li>
              ))}
            </ol>
            <div className="mt-8 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: KeyRound, t: "Keys never leave the server" },
                { icon: Lock, t: "Workspace-isolated data" },
                { icon: FileLock2, t: "Audit log for sensitive actions" },
                { icon: Wallet, t: "Budgets with 80% / 100% alerts" },
              ].map((x) => (
                <div key={x.t} className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-3">
                  <x.icon size={15} className="text-muted" aria-hidden />
                  {x.t}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 border-b border-border">
          <div className="mx-auto grid grid-cols-1 max-w-[1200px] gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_1.6fr] md:py-20">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Questions</h2>
              <p className="mt-3 text-muted">
                More in the <Link href="/docs" className="link">documentation</Link>.
              </p>
            </div>
            <div className="divide-y divide-border rounded-xl border border-border bg-surface">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
                    {f.q}
                    <ChevronDown size={16} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section>
          <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 md:py-20">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-surface px-6 py-12 text-center shadow-sm md:px-12">
              <Gauge size={22} className="mx-auto text-accent" aria-hidden />
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">See your AI spend clearly — today.</h2>
              <p className="mx-auto mt-3 max-w-lg text-muted">Create a workspace in under a minute, or explore a fully populated demo first. ObserveMetrics is free during launch.</p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link href={primary.href} className="btn btn-primary btn-lg">
                  {primary.label} <ArrowRight size={15} aria-hidden />
                </Link>
                <Link href="/demo" className="btn btn-secondary btn-lg">
                  Explore the demo
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
