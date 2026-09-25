"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader, Panel, ProgressBar, Spinner, EmptyState } from "@/components/ui";
import { useSession } from "../../providers";

interface BudgetRow {
  id: string;
  team: string | null;
  amountCents: number;
  alert80SentAt: string | null;
  alert100SentAt: string | null;
  progress: { spentUsd: number; percent: number; daysLeft: number };
}

interface AlertRow {
  id: string;
  type: string;
  team: string | null;
  message: string;
  createdAt: string;
  readAt: string | null;
}

export default function BudgetsPage() {
  const { me, loading: sessionLoading, refresh } = useSession();
  const [budgets, setBudgets] = useState<BudgetRow[] | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [newTeam, setNewTeam] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [bRes, aRes] = await Promise.all([
      fetch("/api/v1/budgets", { cache: "no-store" }),
      fetch("/api/v1/alerts", { cache: "no-store" }),
    ]);
    if (bRes.ok) setBudgets((await bRes.json()).data.budgets);
    if (aRes.ok) {
      const json = await aRes.json();
      setAlerts(json.data.alerts);
      if (json.data.alerts.some((a: AlertRow) => !a.readAt)) {
        void fetch("/api/v1/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      }
    }
  }, []);

  useEffect(() => {
    if (sessionLoading || !me) return;
    void load();
  }, [me, sessionLoading, load]);

  void refresh; // session refresh is triggered by mutations in Settings

  const budgetsEnabled = me?.activeOrg?.limits?.budgets ?? false;
  const isAdmin = me?.activeOrg?.role === "ADMIN";

  async function createBudget() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team: newTeam.trim() || null,
          amountCents: Math.round(parseFloat(newAmount) * 100),
        }),
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

  if (sessionLoading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Budgets & Alerts"
        subtitle="Monthly spend limits with email alerts at 80% and 100%"
      />

      {!budgetsEnabled && (
        <div className="panel mb-6 flex items-center justify-between gap-4 p-5">
          <div>
            <h2 className="font-semibold">Budgets are a Growth feature</h2>
            <p className="mt-1 text-sm muted">
              Upgrade to Growth to set monthly budgets per org or team, with alerts before you overspend.
            </p>
          </div>
          <a href="/dashboard/settings/billing" className="btn btn-primary shrink-0">Upgrade</a>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {(budgets ?? []).map((b) => (
            <Panel key={b.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">
                    {b.team ? "Team · " + b.team : "Organization-wide"}
                  </div>
                  <div className="mt-0.5 text-xs muted">
                    ${(b.progress.spentUsd).toFixed(2)} of ${(b.amountCents / 100).toFixed(2)} · {b.progress.daysLeft} days left this month
                    {(b.alert80SentAt || b.alert100SentAt) && " · alerted"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge">{b.progress.percent}%</span>
                  {isAdmin && (
                    <button onClick={() => removeBudget(b.id)} className="text-xs muted hover:text-red-500">
                      Delete
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <ProgressBar percent={b.progress.percent} />
              </div>
              {isAdmin && (
                <form
                  className="mt-3 flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = (e.currentTarget.elements.namedItem("amount") as HTMLInputElement).value;
                    void updateAmount(b.id, input);
                  }}
                >
                  <input name="amount" className="input w-32" placeholder={(b.amountCents / 100).toFixed(0)} />
                  <button className="btn btn-outline">Update $</button>
                </form>
              )}
            </Panel>
          ))}

          {budgets !== null && budgets.length === 0 && budgetsEnabled && (
            <EmptyState
              icon="◑"
              title="No budgets yet"
              body="Create your first monthly budget to start tracking spend against a limit."
            />
          )}
        </div>

        <div className="space-y-4">
          {budgetsEnabled && isAdmin && (
            <Panel title="New budget">
              <div className="space-y-3">
                <input className="input" placeholder="Team (empty = whole org)" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} />
                <input className="input" placeholder="Monthly amount (USD)" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} inputMode="decimal" />
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button onClick={createBudget} disabled={busy || !newAmount} className="btn btn-primary w-full disabled:opacity-60">
                  Create budget
                </button>
              </div>
            </Panel>
          )}

          <Panel title="Alert history">
            {alerts.length === 0 ? (
              <p className="py-6 text-center text-sm muted">No alerts yet — you are under budget.</p>
            ) : (
              <ul className="space-y-3">
                {alerts.map((a) => (
                  <li key={a.id} className="border-t pt-3 first:border-0 first:pt-0">
                    <div className="flex items-center gap-2">
                      <span>{a.type === "BUDGET_100" ? "🚨" : a.type === "BUDGET_80" ? "⚠️" : "🔌"}</span>
                      <span className="text-xs muted">{new Date(a.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="mt-1 text-sm">{a.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
