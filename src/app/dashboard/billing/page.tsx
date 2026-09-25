"use client";

import { useEffect, useState } from "react";
import { useSession } from "../../providers";
import { SectionHeader, StatusBadge, PageSkeleton } from "@/components/ui";
import { IconCheck } from "@/components/icons";

const PLANS = [
  { id: "FREE", name: "Free", price: 0, features: ["1 provider connection", "1 team member", "30-day retention", "Overview dashboard"] },
  { id: "STARTER", name: "Starter", price: 29, features: ["3 provider connections", "5 team members", "6-month retention", "Token & cost analytics"] },
  { id: "GROWTH", name: "Growth", price: 149, features: ["Unlimited providers & members", "Budgets & email alerts", "CSV & PDF export", "1-year retention"] },
] as const;

export default function BillingPage() {
  const { me, refresh } = useSession();
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("status") === "success") void refresh();
  }, [refresh]);

  if (!me) return <PageSkeleton />;

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
      <SectionHeader
        title="Billing"
        subtitle={"ObserveMetrics subscription for " + (me.activeOrg?.name ?? "")}
        actions={
          billingReady && currentPlan !== "FREE" && isAdmin ? (
            <button onClick={openPortal} className="btn btn-secondary btn-sm">Manage in Stripe</button>
          ) : undefined
        }
      />

      {!billingReady && (
        <div className="surface mb-4 p-4 text-[13px] muted">
          Stripe is not configured on this deployment, so plan changes are disabled — every workspace is on
          the Free plan. Set <code className="mono">STRIPE_SECRET_KEY</code> and the price IDs (see DEPLOYMENT.md) to enable upgrades.
        </div>
      )}
      {error && <p className="surface mb-4 p-3 text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = p.id === currentPlan;
          return (
            <div key={p.id} className="surface p-5" style={isCurrent ? { borderColor: "var(--accent)", borderWidth: 1.5 } : undefined}>
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-semibold">{p.name}</h3>
                {isCurrent && <StatusBadge status="accent">Current</StatusBadge>}
              </div>
              <div className="mt-2.5 flex items-baseline gap-1">
                <span className="text-[28px] font-bold tracking-tight">${p.price}</span>
                <span className="text-[13px] muted">/mo</span>
              </div>
              <ul className="mt-4 space-y-2 text-[13px]">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <IconCheck size={14} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} />
                    <span className="muted">{f}</span>
                  </li>
                ))}
              </ul>
              {isAdmin && !isCurrent && p.id !== "FREE" && billingReady && (
                <button onClick={() => checkout(p.id)} disabled={busyPlan !== null} className="btn btn-primary mt-5 w-full">
                  {busyPlan === p.id ? "Redirecting…" : "Upgrade to " + p.name}
                </button>
              )}
              {isAdmin && isCurrent && currentPlan !== "FREE" && billingReady && (
                <button onClick={openPortal} disabled={busyPlan !== null} className="btn btn-secondary mt-5 w-full">Manage subscription</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
