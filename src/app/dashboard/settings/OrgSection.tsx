"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel, Spinner } from "@/components/ui";
import { useSession } from "../../providers";

export function OrgSection() {
  const { me, refresh } = useSession();
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me?.activeOrg) setName(me.activeOrg.name);
  }, [me]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/v1/org", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!me) return <Spinner />;

  const limits = me.activeOrg?.limits;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Organization">
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Plan</label>
            <div className="flex items-center gap-3">
              <span className="badge">{me.activeOrg?.plan}</span>
              <Link href="/dashboard/billing" className="text-sm" style={{ color: "var(--accent)" }}>
                Manage billing →
              </Link>
            </div>
          </div>
          {saved && <p className="text-sm" style={{ color: "#10b981" }}>Saved</p>}
          <button disabled={busy} className="btn btn-primary disabled:opacity-60">Save changes</button>
        </form>
      </Panel>

      <Panel title="Plan limits">
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between"><span className="muted">Provider connections</span><span>{limits?.maxProviders === -1 ? "Unlimited" : limits?.maxProviders}</span></li>
          <li className="flex justify-between"><span className="muted">Team members</span><span>{limits?.maxMembers === -1 ? "Unlimited" : limits?.maxMembers}</span></li>
          <li className="flex justify-between"><span className="muted">Data retention</span><span>{limits?.retentionDays} days</span></li>
          <li className="flex justify-between"><span className="muted">Budgets & alerts</span><span>{limits?.budgets ? "Included" : "—"}</span></li>
          <li className="flex justify-between"><span className="muted">CSV / PDF export</span><span>{limits?.exports ? "Included" : "—"}</span></li>
        </ul>
      </Panel>
    </div>
  );
}
