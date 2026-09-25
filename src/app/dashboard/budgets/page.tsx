"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "../../providers";
import { SectionHeader, BudgetProgress, StatusBadge, EmptyState, PageSkeleton, Skeleton, fmtUsd0 } from "@/components/ui";

interface BudgetRow {
  id: string;
  team: string | null;
  amountCents: number;
  alert80SentAt: string | null;
  alert100SentAt: string | null;
  progress: { spentUsd: number; percent: number; daysLeft: number };
}

export default function BudgetsPage() {
  const { me, loading: sessionLoading } = useSession();
  const [budgets, setBudgets] = useState<BudgetRow[] | null>(null);
  const [newTeam, setNewTeam] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/budgets", { cache: "no-store" });
    if (res.ok) setBudgets((await res.json()).data.budgets);
    else setBudgets([]);
  }, []);

  useEffect(() => {
    if (sessionLoading || !me) return;
    void load();
  }, [me, sessionLoading, load]);

  const budgetsEnabled = me?.activeOrg?.limits?.budgets ?? false;
  const isAdmin = me?.activeOrg?.role === "ADMIN";

  async function createBudget() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team: newTeam.trim() || null, amountCents: Math.round(parseFloat(newAmount) * 100) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Could not create budget");
      setNewTeam("");
      setNewAmount("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updateAmount(id: string, amountUsd: string) {
    const cents = Math.round(parseFloat(amountUsd) * 100);
    if (!cents || Number.isNaN(cents)) return;
    await fetch("/api/v1/budgets/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: cents }),
    });
    await load();
  }

  async function removeBudget(id: string) {
    await fetch("/api/v1/budgets/" + id, { method: "DELETE" });
    await load();
  }

  if (sessionLoading || budgets === null) {
    return (
      <div>
        <SectionHeader title="Budgets" subtitle="Monthly spend limits with alerts at 80% and 100%." />
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="surface p-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-3 h-6 w-40" />
              <Skeleton className="mt-4 h-1.5 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader
        title="Budgets"
        subtitle="Monthly spend limits with email alerts at 80% and 100%."
      />

      {!budgetsEnabled && (
        <div className="surface mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="text-[13.5px] font-semibold">Budgets are a Growth feature</h2>
            <p className="mt-0.5 text-[13px] muted">Upgrade to set monthly budgets per team with proactive alerts.</p>
          </div>
          <a href="/dashboard/billing" className="btn btn-primary btn-sm">Upgrade</a>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {budgets.map((b) => {
          const status =
            b.progress.percent >= 100
              ? { cls: "danger" as const, text: "Over budget" }
              : b.progress.percent >= 80
                ? { cls: "warning" as const, text: "Approaching limit" }
                : { cls: "success" as const, text: "On track" };
          return (
            <div key={b.id} className="surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[14px] font-semibold">{b.team ? b.team : "Organization-wide"}</h3>
                  <p className="mt-0.5 text-xs muted">
                    Resets monthly · {b.progress.daysLeft} day{b.progress.daysLeft === 1 ? "" : "s"} left
                  </p>
                </div>
                <StatusBadge status={status.cls}>{status.text}</StatusBadge>
              </div>

              <div className="mt-3.5 flex items-baseline justify-between">
                <span className="text-[20px] font-bold tabular-nums">{fmtUsd0(b.progress.spentUsd)}</span>
                <span className="text-[13px] muted tabular-nums">of {fmtUsd0(b.amountCents / 100)}</span>
              </div>
              <div className="mt-2">
                <BudgetProgress percent={b.progress.percent} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="font-medium" style={{ color: b.progress.percent >= 100 ? "var(--danger)" : b.progress.percent >= 80 ? "var(--warning)" : "var(--muted)" }}>
                  {b.progress.percent.toFixed(1)}%
                </span>
                <span className="faint">
                  {b.progress.percent >= 100
                    ? "Exceeded by " + fmtUsd0(b.progress.spentUsd - b.amountCents / 100)
                    : "Remaining: " + fmtUsd0(Math.max(0, b.amountCents / 100 - b.progress.spentUsd))}
                </span>
              </div>

              {isAdmin && (
                <div className="mt-3 flex items-center justify-between border-t pt-3">
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const input = (e.currentTarget.elements.namedItem("amount") as HTMLInputElement).value;
                      void updateAmount(b.id, input);
                    }}
                  >
                    <input name="amount" className="input" style={{ width: 110, height: 28 }} placeholder="New amount $" />
                    <button className="btn btn-secondary btn-sm">Update</button>
                  </form>
                  <button onClick={() => removeBudget(b.id)} className="btn btn-danger btn-sm">Delete</button>
                </div>
              )}
            </div>
          );
        })}

        {budgets.length === 0 && budgetsEnabled && (
          <EmptyState
            title="No budgets yet"
            body="Create a monthly budget to track spend and get alerted before overspending."
          />
        )}

        {budgetsEnabled && isAdmin && (
          <div className="surface p-4">
            <h3 className="text-[14px] font-semibold">New budget</h3>
            <div className="mt-3 space-y-3">
              <div>
                <label className="label mb-1 block">Team (empty = whole org)</label>
                <input className="input" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="Engineering" />
              </div>
              <div>
                <label className="label mb-1 block">Monthly amount (USD)</label>
                <input className="input" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} inputMode="decimal" placeholder="2500" />
              </div>
              {error && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>}
              <button onClick={createBudget} disabled={busy || !newAmount} className="btn btn-primary w-full">Create budget</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
