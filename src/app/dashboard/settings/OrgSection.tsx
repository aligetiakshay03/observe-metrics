"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "../../providers";
import { StatusBadge } from "@/components/ui";

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

  if (!me) return null;

  const limits = me.activeOrg?.limits;
  const plan = (me.activeOrg?.plan ?? "FREE") as "FREE" | "STARTER" | "GROWTH";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="surface p-4">
        <h3 className="text-[14px] font-semibold">Workspace</h3>
        <form onSubmit={save} className="mt-3.5 space-y-3.5">
          <div>
            <label className="label mb-1.5 block">Organization name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {saved && <p className="text-[13px]" style={{ color: "var(--success)" }}>Saved</p>}
          <button disabled={busy} className="btn btn-primary">Save changes</button>
        </form>
      </div>

      <div className="surface p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">Plan &amp; limits</h3>
          <StatusBadge status={plan === "GROWTH" ? "accent" : plan === "STARTER" ? "success" : "neutral"}>{plan}</StatusBadge>
        </div>
        <dl className="mt-3.5 space-y-2.5 text-[13px]">
          <div className="flex justify-between border-b pb-2"><dt className="muted">Provider connections</dt><dd className="font-medium">{limits?.maxProviders === -1 ? "Unlimited" : limits?.maxProviders}</dd></div>
          <div className="flex justify-between border-b pb-2"><dt className="muted">Team members</dt><dd className="font-medium">{limits?.maxMembers === -1 ? "Unlimited" : limits?.maxMembers}</dd></div>
          <div className="flex justify-between border-b pb-2"><dt className="muted">Data retention</dt><dd className="font-medium">{limits?.retentionDays} days</dd></div>
          <div className="flex justify-between border-b pb-2"><dt className="muted">Budgets &amp; alerts</dt><dd className="font-medium">{limits?.budgets ? "Included" : "—"}</dd></div>
          <div className="flex justify-between"><dt className="muted">CSV / PDF export</dt><dd className="font-medium">{limits?.exports ? "Included" : "—"}</dd></div>
        </dl>
        <Link href="/dashboard/billing" className="btn btn-secondary btn-sm mt-4">Manage billing →</Link>
      </div>
    </div>
  );
}
