"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BellRing, CheckCheck, Circle, CircleCheck, MailOpen, RotateCcw } from "lucide-react";
import { api, useApi } from "@/lib/api-client";
import { fmtRelative, fmtDateTime } from "@/lib/format";
import type { AlertItem, Severity } from "@/lib/types";
import { Button, cx, EmptyState, ErrorState, PageHeader, SeverityBadge, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/providers/Toaster";
import { useMe } from "@/components/shell/MeProvider";

type Status = "open" | "resolved" | "all";
const CATEGORY_LABEL: Record<AlertItem["category"], string> = {
  BUDGET: "Budget",
  COST_ANOMALY: "Cost anomaly",
  LATENCY: "Latency",
  ERROR: "Errors",
  PROVIDER_SYNC: "Provider sync",
  OPTIMIZATION: "Optimization",
};

interface AlertsResponse {
  alerts: AlertItem[];
  openCounts: Partial<Record<Severity, number>>;
  unread: number;
}

export default function AlertsPage() {
  const [status, setStatus] = useState<Status>("open");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const qs = new URLSearchParams({ status });
  if (category) qs.set("category", category);
  if (severity) qs.set("severity", severity);
  const { data, error, loading, refresh, mutate } = useApi<AlertsResponse>(`/api/v1/alerts?${qs}`);
  const toast = useToast();
  const router = useRouter();
  const { can } = useMe();
  const canAct = can("MEMBER");
  const [markingAll, setMarkingAll] = useState(false);

  const patch = async (a: AlertItem, body: { read?: boolean; resolved?: boolean }) => {
    if (data) {
      const now = new Date().toISOString();
      const next = data.alerts
        .map((x) =>
          x.id === a.id
            ? {
                ...x,
                readAt: body.read === undefined ? (body.resolved ? x.readAt ?? now : x.readAt) : body.read ? now : null,
                resolvedAt: body.resolved === undefined ? x.resolvedAt : body.resolved ? now : null,
              }
            : x,
        )
        .filter((x) => (status === "open" ? !x.resolvedAt : status === "resolved" ? !!x.resolvedAt : true));
      mutate({ ...data, alerts: next });
    }
    try {
      await api(`/api/v1/alerts/${a.id}`, { method: "PATCH", body });
      if (body.resolved !== undefined) toast({ tone: "success", title: body.resolved ? "Alert resolved" : "Alert reopened", body: a.title });
    } catch (e) {
      toast({ tone: "error", title: "Couldn't update alert", body: (e as Error).message });
    } finally {
      void refresh();
    }
  };

  const open = (a: AlertItem) => {
    if (!a.readAt && canAct) void api(`/api/v1/alerts/${a.id}`, { method: "PATCH", body: { read: true } }).catch(() => undefined);
    router.push(a.href ?? (a.insightId ? `/dashboard/insights/${a.insightId}` : "/dashboard/alerts"));
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      const r = await api<{ updated: number }>("/api/v1/alerts/read-all", { body: {} });
      toast({ tone: "success", title: `Marked ${r.updated} alert${r.updated === 1 ? "" : "s"} as read` });
      void refresh();
    } catch (e) {
      toast({ tone: "error", title: "Couldn't mark alerts read", body: (e as Error).message });
    } finally {
      setMarkingAll(false);
    }
  };

  const counts = data?.openCounts ?? {};

  return (
    <div>
      <PageHeader
        title="Alerts"
        description="Budget thresholds, cost anomalies, latency and error spikes, and provider sync problems that need attention."
        actions={
          canAct && (data?.unread ?? 0) > 0 ? (
            <Button icon={<CheckCheck size={14} />} loading={markingAll} onClick={markAll}>
              Mark all read
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        {(["CRITICAL", "WARNING", "INFO"] as Severity[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStatus("open");
              setSeverity(severity === s ? "" : s);
            }}
            aria-pressed={severity === s}
            className={cx("card flex items-center justify-between px-4 py-3 text-left transition-colors hover:border-border-strong", severity === s && "border-accent")}
          >
            <span>
              <span className="block text-2xs font-medium uppercase tracking-wide text-muted">Open · {s.toLowerCase()}</span>
              <span className={cx("mt-1 block text-lg font-semibold tabular-nums", s === "CRITICAL" && (counts.CRITICAL ?? 0) > 0 && "text-danger", s === "WARNING" && (counts.WARNING ?? 0) > 0 && "text-warning")}>
                {counts[s] ?? 0}
              </span>
            </span>
            <SeverityBadge severity={s} />
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex h-8 rounded-md border border-border bg-surface p-0.5 shadow-xs" role="radiogroup" aria-label="Alert status">
          {(["open", "resolved", "all"] as Status[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={status === s} onClick={() => setStatus(s)} className={cx("rounded-[4px] px-3 text-xs font-medium capitalize", status === s ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}>
              {s}
            </button>
          ))}
        </div>
        <select className="select h-8 w-auto py-0 text-xs" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {(["BUDGET", "COST_ANOMALY", "LATENCY", "ERROR", "PROVIDER_SYNC"] as const).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <select className="select h-8 w-auto py-0 text-xs" value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity">
          <option value="">All severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="WARNING">Warning</option>
          <option value="INFO">Info</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {loading && !data ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-4">
                <Skeleton className="h-5 w-16" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : error && !data ? (
          <ErrorState message={error.message} onRetry={refresh} />
        ) : !data?.alerts.length ? (
          <EmptyState
            icon={<BellRing size={18} />}
            title={status === "open" ? "No open alerts" : "No alerts here"}
            body={
              status === "open"
                ? "Nothing needs attention right now. Alerts appear when budgets cross thresholds, costs or errors spike, latency regresses, or a provider sync fails."
                : "No alerts match these filters."
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.alerts.map((a) => (
              <li key={a.id} className={cx("group flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-surface-2/50 sm:flex-row sm:items-center", !a.readAt && !a.resolvedAt && "bg-accent-soft/30")}>
                <button type="button" onClick={() => open(a)} className="flex min-w-0 flex-1 items-start gap-3 text-left outline-none focus-visible:underline">
                  <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", a.readAt || a.resolvedAt ? "bg-transparent" : "bg-accent")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={a.severity} />
                      <span className="badge badge-neutral">{CATEGORY_LABEL[a.category]}</span>
                      {a.resolvedAt && (
                        <span className="badge badge-success">
                          <CircleCheck size={11} aria-hidden /> Resolved
                        </span>
                      )}
                      {!a.readAt && !a.resolvedAt && <span className="sr-only">Unread.</span>}
                    </span>
                    <span className="mt-1.5 block text-sm font-medium">{a.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">{a.message}</span>
                    <span className="mt-1 block text-2xs text-faint" title={fmtDateTime(a.createdAt)}>
                      {fmtRelative(a.createdAt)}
                    </span>
                  </span>
                </button>
                {canAct && (
                  <div className="flex shrink-0 gap-1 pl-5 sm:pl-0">
                    {!a.resolvedAt && (
                      <Button size="sm" variant="ghost" icon={a.readAt ? <Circle size={13} /> : <MailOpen size={13} />} onClick={() => void patch(a, { read: !a.readAt })}>
                        {a.readAt ? "Mark unread" : "Mark read"}
                      </Button>
                    )}
                    <Button size="sm" icon={a.resolvedAt ? <RotateCcw size={13} /> : <CircleCheck size={13} />} onClick={() => void patch(a, { resolved: !a.resolvedAt })}>
                      {a.resolvedAt ? "Reopen" : "Resolve"}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
