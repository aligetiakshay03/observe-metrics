"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "../../providers";
import { SectionHeader, StatusBadge, PageSkeleton, EmptyState } from "@/components/ui";
import { IconZap, IconTarget, IconAlert, IconActivity } from "@/components/icons";

interface AlertRow {
  id: string;
  type: string;
  team: string | null;
  message: string;
  createdAt: string;
  readAt: string | null;
}

const TYPE_META: Record<string, { label: string; cls: "danger" | "warning" | "accent" | "neutral"; icon: React.ReactNode }> = {
  BUDGET_100: { label: "Budget exceeded", cls: "danger", icon: <IconAlert size={11} /> },
  BUDGET_80: { label: "Budget 80%", cls: "warning", icon: <IconTarget size={11} /> },
  SYNC_FAILURE: { label: "Sync failure", cls: "neutral", icon: <IconZap size={11} /> },
  ANOMALY: { label: "Anomaly", cls: "accent", icon: <IconActivity size={11} /> },
};

export default function AlertsPage() {
  const { me, loading: sessionLoading } = useSession();
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/alerts", { cache: "no-store" });
    if (res.ok) setAlerts((await res.json()).data.alerts);
    else setAlerts([]);
  }, []);

  useEffect(() => {
    if (sessionLoading || !me) return;
    void load();
  }, [me, sessionLoading, load]);

  async function markRead() {
    await fetch("/api/v1/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    await load();
  }

  if (sessionLoading || alerts === null) return <PageSkeleton />;

  const filtered = filter ? alerts.filter((a) => a.type === filter) : alerts;
  const unread = alerts.filter((a) => !a.readAt).length;

  return (
    <div>
      <SectionHeader
        title="Alerts"
        subtitle="Budget thresholds, anomalies and sync health."
        actions={
          <>
            <select className="input" style={{ width: 170 }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter alerts">
              <option value="">All types</option>
              {Object.keys(TYPE_META).map((t) => (
                <option key={t} value={t}>{TYPE_META[t]!.label}</option>
              ))}
            </select>
            {unread > 0 && (
              <button onClick={markRead} className="btn btn-secondary btn-sm">Mark all read ({unread})</button>
            )}
          </>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<IconActivity size={18} className="muted" />}
          title={filter ? "No alerts of this type" : "No alerts yet"}
          body={filter ? "Try a different filter." : "You are within budget and all syncs are healthy."}
        />
      ) : (
        <div className="surface divide-y">
          {filtered.map((a) => {
            const meta = TYPE_META[a.type] ?? { label: a.type, cls: "neutral" as const, icon: <IconActivity size={11} /> };
            return (
              <div key={a.id} className="flex items-start justify-between gap-4 px-4 py-3.5">
                <div className="flex min-w-0 items-start gap-3">
                  {!a.readAt && <span className="dot dot-accent mt-1.5" />}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={meta.cls}>{meta.icon}{meta.label}</StatusBadge>
                      {a.team && <span className="badge badge-neutral">{a.team}</span>}
                      <span className="text-xs faint">{new Date(a.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-[13.5px] leading-snug">{a.message}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
