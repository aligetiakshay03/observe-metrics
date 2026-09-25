"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "./providers";

const FEATURES = [
  {
    title: "Unified visibility",
    body: "Connect OpenAI, Anthropic, Google Gemini and Mistral. See every token and every dollar in one dashboard.",
  },
  {
    title: "Know who spends what",
    body: "Break down cost by model, team, and time period. Spot the expensive patterns before they become surprises.",
  },
  {
    title: "Budgets that warn you",
    body: "Set monthly budgets per org or per team. Get email alerts at 80% and 100% — before the invoice lands.",
  },
  {
    title: "Fast, pre-aggregated data",
    body: "Dashboards read from daily rollup tables, so charts render in well under a second even with millions of events.",
  },
];

const PRICING = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["1 provider connection", "1 team member", "30-day data retention", "Overview dashboard"],
  },
  {
    name: "Starter",
    price: "$29",
    period: "per month",
    features: ["3 provider connections", "Up to 5 team members", "6-month retention", "Token & cost analytics"],
    highlight: true,
  },
  {
    name: "Growth",
    price: "$149",
    period: "per month",
    features: ["Unlimited providers & members", "Budgets & email alerts", "CSV & PDF export", "1-year retention"],
  },
];

export default function LandingPage() {
  const { me, loading } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-40 border-b" style={{ background: "var(--panel)" }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Logo /> ObserveMetrics
          </Link>
          <nav className="hidden items-center gap-6 text-sm muted md:flex">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            {mounted && !loading && me ? (
              <Link href="/dashboard" className="btn btn-primary">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-outline">
                  Log in
                </Link>
                <Link href="/register" className="btn btn-primary">
                  Start free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-24 text-center">
        <span className="badge">AI cost intelligence for teams</span>
        <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-bold leading-tight tracking-tight md:text-6xl">
          Every token. Every dollar.
          <br />
          <span style={{ color: "var(--accent)" }}>One dashboard.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg muted">
          ObserveMetrics gives your team unified visibility into AI spend across OpenAI, Anthropic,
          Google Gemini and Mistral — by model, by team, over time — with budgets and alerts that keep
          you on track.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link href="/register" className="btn btn-primary px-6 py-3 text-base">
            Start free — no credit card
          </Link>
          <a href="#features" className="btn btn-outline px-6 py-3 text-base">
            See how it works
          </a>
        </div>

        {/* Mock dashboard preview */}
        <div className="panel mx-auto mt-16 max-w-4xl p-6 text-left shadow-2xl">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <span className="h-3 w-3 rounded-full bg-red-400" />
              <span className="h-3 w-3 rounded-full bg-yellow-400" />
              <span className="h-3 w-3 rounded-full bg-green-400" />
            </div>
            <span className="text-xs muted">observemetrics.dev/dashboard</span>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4">
            {[
              ["Spend this month", "$4,182.50", "+12.4%"],
              ["Total requests", "128,902", "+3.1%"],
              ["Input tokens", "412M", "+8.9%"],
            ].map(([label, value, delta]) => (
              <div key={label} className="rounded-lg border p-4">
                <div className="text-xs muted">{label}</div>
                <div className="mt-1 text-2xl font-semibold">{value}</div>
                <div className="mt-1 text-xs" style={{ color: "#f59e0b" }}>
                  {delta}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border p-6">
            <div className="mb-4 h-32 w-full rounded-md" style={{ background: "linear-gradient(90deg, rgba(99,102,241,0.5), rgba(139,92,246,0.25), rgba(99,102,241,0.5))" }} />
            <div className="flex gap-3">
              <div className="h-2 w-1/3 rounded" style={{ background: "var(--accent)", opacity: 0.7 }} />
              <div className="h-2 w-1/4 rounded" style={{ background: "var(--accent)", opacity: 0.4 }} />
              <div className="h-2 w-1/5 rounded" style={{ background: "var(--accent)", opacity: 0.25 }} />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-bold">Built for teams shipping with AI</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="panel p-6">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-bold">Simple pricing that scales with you</h2>
          <p className="mt-2 muted">Start free. Upgrade when your AI spend does.</p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PRICING.map((p) => (
              <div
                key={p.name}
                className="panel p-6"
                style={p.highlight ? { borderColor: "var(--accent)", borderWidth: 2 } : undefined}
              >
                {p.highlight && <span className="badge">Most popular</span>}
                <h3 className="mt-2 text-lg font-semibold">{p.name}</h3>
                <div className="mt-3">
                  <span className="text-4xl font-bold">{p.price}</span>{" "}
                  <span className="text-sm muted">{p.period}</span>
                </div>
                <ul className="mt-6 space-y-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span style={{ color: "var(--accent)" }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register"
                  className={"btn mt-6 w-full " + (p.highlight ? "btn-primary" : "btn-outline")}
                >
                  Get started
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t py-10 text-center text-sm muted">
        © {new Date().getFullYear()} ObserveMetrics · Multi-tenant AI spend analytics
      </footer>
    </main>
  );
}

function Logo() {
  return (
    <span
      className="inline-block h-6 w-6 rounded-md"
      style={{ background: "linear-gradient(135deg, var(--accent), #a855f7)" }}
    />
  );
}
