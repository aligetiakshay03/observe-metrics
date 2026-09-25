"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel, Spinner } from "@/components/ui";
import { useSession } from "../../providers";

interface PlanInfo {
  id: string;
  name: string;
  priceMonthly: number;
  features: string[];
}

const PLAN_CARDS: PlanInfo[] = [
  { id: "FREE", name: "Free", priceMonthly: 0, features: ["1 provider connection", "1 team member", "30-day retention", "Overview dashboard"] },
  { id: "STARTER", name: "Starter", priceMonthly: 2900, features: ["3 provider connections", "5 team members", "6-month retention", "Token & cost analytics"] },
  { id: "GROWTH", name: "Growth", priceMonthly: 14900, features: ["Unlimited providers & members", "Budgets & email alerts", "CSV & PDF export", "1-year retention"] },
];

export default function BillingPage() {
  const { me, refresh } = useSession();
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("status") === "success") {
      void refresh();
    }
  }, [refresh]);

  if (!me) return <Spinner />;

  const currentPlan = me.activeOrg?.plan ?? "FREE";
  const isAdmin = me.activeOrg?.role === "ADMIN";
  const billingReady = me.billingEnabled;

  async function checkout(plan: string) {
    setBusyPlan(plan);
    setError(null);
    try {
      const res = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Could not start checkout");
      window.location.href = json.data.url;
    } catch (e) {
      setError((e as Error).message);
      setBusyPlan(null);
    }
  }

  async function openPortal() {
    setBusyPlan("portal");
    setError(null);
    try {
      const res = await fetch("/api/v1/billing/portal", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Could not open billing portal");
      window.location.href = json.data.url;
    } catch (e) {
      setError((e as Error).message);
      setBusyPlan(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Billing"
        subtitle={"ObserveMetrics subscription for " + (me.activeOrg?.name ?? "")}
        actions={
          billingReady && currentPlan !== "FREE" && isAdmin ? (
            <button onClick={openPortal} className="btn btn-outline">Manage subscription</button>
          ) : undefined
        }
      />

      {!billingReady && (
        <div className="panel mb-4 p-4 text-sm muted">
          ⚙️ Stripe is not configured on this deployment, so plan changes are disabled. Everyone is on
          the <strong>Free</strong> plan — set <code>STRIPE_SECRET_KEY</code> and the price IDs (see
          DEPLOYMENT.md) to enable upgrades. Budgets &amp; exports below still reflect the current plan.
        </div>
      )}

      {error && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_CARDS.map((p) => {
          const isCurrent = p.id === currentPlan;
          return (
            <div key={p.id} className="panel p-6" style={isCurrent ? { borderColor: "var(--accent)", borderWidth: 2 } : undefined}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{p.name}</h3>
                {isCurrent && <span className="badge">Current plan</span>}
              </div>
              <div className="mt-3">
                <span className="text-3xl font-bold">${p.priceMonthly / 100}</span>
                <span className="text-sm muted">/mo</span>
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span style={{ color: "var(--accent)" }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              {isAdmin && !isCurrent && p.id !== "FREE" && billingReady && (
                <button onClick={() => checkout(p.id)} disabled={busyPlan !== null} className="btn btn-primary mt-6 w-full disabled:opacity-60">
                  {busyPlan === p.id ? "Redirecting…" : "Upgrade to " + p.name}
                </button>
              )}
              {isAdmin && isCurrent && currentPlan !== "FREE" && billingReady && (
                <button onClick={openPortal} disabled={busyPlan !== null} className="btn btn-outline mt-6 w-full">
                  {busyPlan === "portal" ? "Opening…" : "Manage in Stripe"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <Panel title="About billing" className="mt-6">
        <p className="text-sm muted">
          Payments are processed by Stripe. Upgrades apply immediately via Stripe Checkout; downgrades and
          cancellations are handled in the Stripe customer portal. If Stripe is not configured on this
          deployment, plan changes are disabled and the org stays on the Free plan.
        </p>
      </Panel>
    </div>
  );
}
