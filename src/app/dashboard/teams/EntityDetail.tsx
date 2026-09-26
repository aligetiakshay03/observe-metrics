"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertOctagon, ArrowRight, Code2, List, Pencil, SearchX, Trash2 } from "lucide-react";
import { useApi } from "@/lib/api-client";
import { useFilters, withRange } from "@/lib/use-filters";
import { fmtCompact, fmtMs, fmtNumber, fmtRate, fmtUsd } from "@/lib/format";
import type { EntityDetailView, ModelRow, UserRow } from "@/lib/types";
import { BasisBadge, Button, ButtonLink, Card, cx, Delta, EmptyState, ErrorState, ModelName, PageHeader, ProviderName } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { BarList, TrendChart } from "@/components/charts";
import { FilterBar, InsightCard, KpiCard, PageSkeleton } from "@/components/dashboard/blocks";
import { useMe } from "@/components/shell/MeProvider";
import { DeleteEntityDialog, EntityDialog } from "./EntityForms";

export function EntityDetail({ kind, id }: { kind: "team" | "app"; id: string }) {
  const isTeam = kind === "team";
  const { query, values } = useFilters();
  const { can } = useMe();
  const admin = can("ADMIN");
  const listHref = isTeam ? "/dashboard/teams" : "/dashboard/applications";
  const { data, error, loading, refresh } = useApi<EntityDetailView>(`/api/v1/analytics/${isTeam ? "teams" : "applications"}/${encodeURIComponent(id)}?${query}`);
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const r = (href: string) => withRange(href, values);

  if (loading && !data) return <PageSkeleton />;
  if (error && !data) {
    if (error.status === 404)
      return (
        <div className="card">
          <EmptyState
            icon={<SearchX size={18} />}
            title={`${isTeam ? "Team" : "Application"} not found`}
            body="It may have been deleted, or it belongs to a different workspace."
            actions={<ButtonLink href={listHref}>Back to {isTeam ? "teams" : "applications"}</ButtonLink>}
          />
        </div>
      );
    return (
      <div className="card">
        <ErrorState message={error.message} onRetry={refresh} />
      </div>
    );
  }
  if (!data) return null;

  const t = data.totals;
  const e = data.entity;
  const empty = t.requests === 0 && t.tokens === 0;
  const spark = (pick: (p: EntityDetailView["series"][number]) => number) => data.series.slice(-14).map(pick);
  const kpi = (value: number, change: number | null, s: number[]) => ({ value, prev: 0, change, spark: s });

  const modelCols: Column<ModelRow>[] = [
    { key: "model", header: "Model", cell: (m) => <ModelName model={m.model} />, sort: (m) => m.model },
    { key: "provider", header: "Provider", cell: (m) => <ProviderName provider={m.provider} />, sort: (m) => m.provider, hideBelow: "md" },
    { key: "requests", header: "Requests", numeric: true, cell: (m) => fmtNumber(m.requests), sort: (m) => m.requests },
    { key: "tokens", header: "Tokens", numeric: true, cell: (m) => fmtCompact(m.tokens), sort: (m) => m.tokens, hideBelow: "sm" },
    { key: "spend", header: "Spend", numeric: true, cell: (m) => <span className="font-medium">{fmtUsd(m.costUsd)}</span>, sort: (m) => m.costUsd },
    { key: "latency", header: "Latency", numeric: true, cell: (m) => fmtMs(m.latencyMs), sort: (m) => m.latencyMs, hideBelow: "lg" },
    { key: "err", header: "Errors", numeric: true, cell: (m) => <span className={cx(m.errorRate >= 0.02 && "font-medium text-danger")}>{fmtRate(m.errorRate)}</span>, sort: (m) => m.errorRate, hideBelow: "md" },
    { key: "change", header: "Change", numeric: true, cell: (m) => <Delta value={m.change} inverse />, sort: (m) => m.change, hideBelow: "sm" },
  ];

  const scopeParam = isTeam ? `team=${encodeURIComponent(id)}` : `app=${encodeURIComponent(id)}`;
  const userCols: Column<UserRow>[] = [
    {
      key: "user",
      header: "User",
      cell: (u) => (
        <Link href={r(`/dashboard/requests?user=${encodeURIComponent(u.user)}&${scopeParam}`)} className="font-medium hover:underline">
          {u.user}
        </Link>
      ),
      sort: (u) => u.user,
    },
    ...(isTeam ? [] : [{ key: "team", header: "Team", cell: (u: UserRow) => <span className="text-muted">{u.teamName ?? "—"}</span>, hideBelow: "md" as const }]),
    { key: "requests", header: "Requests", numeric: true, cell: (u) => fmtNumber(u.requests), sort: (u) => u.requests },
    { key: "tokens", header: "Tokens", numeric: true, cell: (u) => fmtCompact(u.tokens), sort: (u) => u.tokens, hideBelow: "sm" },
    { key: "spend", header: "Spend", numeric: true, cell: (u) => <span className="font-medium">{fmtUsd(u.costUsd)}</span>, sort: (u) => u.costUsd },
  ];

  return (
    <div>
      <PageHeader
        back={{ href: r(listHref), label: isTeam ? "Teams" : "Applications" }}
        eyebrow={<BasisBadge basis={data.basis} />}
        title={e.name}
        description={
          <>
            {e.description ?? (isTeam ? "Team AI usage, spend and performance." : "Application AI usage, spend and performance.")}
            {e.team && (
              <>
                {" · Owned by "}
                <Link href={r(`/dashboard/teams/${e.team.id}`)} className="link">
                  {e.team.name}
                </Link>
              </>
            )}
          </>
        }
        actions={
          <>
            <FilterBar lookups={data.lookups} show={{ provider: true }} />
            {!isTeam && (
              <>
                <ButtonLink href={r(`/dashboard/requests?app=${encodeURIComponent(id)}`)} icon={<List size={14} />}>
                  View requests
                </ButtonLink>
                <ButtonLink href={r(`/dashboard/requests?app=${encodeURIComponent(id)}&status=error`)} icon={<AlertOctagon size={14} />}>
                  View errors
                </ButtonLink>
              </>
            )}
            {isTeam && (
              <ButtonLink href={r(`/dashboard/requests?team=${encodeURIComponent(id)}`)} icon={<List size={14} />}>
                View requests
              </ButtonLink>
            )}
            {admin && (
              <>
                <Button icon={<Pencil size={14} />} onClick={() => setEditOpen(true)}>
                  {isTeam ? "Rename" : "Edit"}
                </Button>
                <Button variant="ghost" onClick={() => setDelOpen(true)} aria-label={`Delete ${e.name}`} icon={<Trash2 size={14} />} />
              </>
            )}
          </>
        }
      />

      {empty && (
        <div className="card mb-4">
          <EmptyState
            compact
            icon={<Code2 size={18} />}
            title="No usage in this range"
            body={
              isTeam
                ? "No events attributed to this team in the selected range. Try a longer range, or send `team` with each event."
                : "No events attributed to this application in the selected range. Try a longer range, or instrument the app."
            }
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Spend" value={fmtUsd(t.costUsd)} kpi={kpi(t.costUsd, data.change.costUsd, spark((p) => p.costUsd))} inverse tip="Total cost attributed in the selected range." />
        <KpiCard label="Tokens" value={fmtCompact(t.tokens)} kpi={kpi(t.tokens, data.change.tokens, spark((p) => p.tokens))} sparkColor="var(--c2)" tip="Input + output tokens." />
        <KpiCard label="Requests" value={fmtNumber(t.requests)} kpi={kpi(t.requests, data.change.requests, spark((p) => p.requests))} sparkColor="var(--c3)" tip="Model requests in range." />
        <KpiCard label="Cost / request" value={fmtUsd(t.costPerRequest)} sub={<span className="text-faint">Average</span>} tip="Spend ÷ requests." />
        <KpiCard
          label={isTeam ? "Avg latency" : "Error rate"}
          value={isTeam ? fmtMs(t.latencyMs) : fmtRate(t.errorRate)}
          kpi={isTeam ? (t.latencyMs != null ? kpi(t.latencyMs, data.change.latencyMs, spark((p) => p.latencyMs ?? 0)) : undefined) : kpi(t.errorRate, data.change.errorRate, spark((p) => p.errorRate))}
          sub={<span className="text-faint">Not measured</span>}
          inverse
          sparkColor="var(--c4)"
          tip={isTeam ? "Request-weighted average latency from instrumented events." : "Failed requests ÷ total requests."}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Spend over time" subtitle={`${fmtUsd(t.costUsd)} · ${fmtCompact(t.tokens)} tokens`}>
          <TrendChart data={data.series} metric="costUsd" unit="usd" label="Spend" height={240} />
        </Card>
        <Card title={isTeam ? "Applications" : "Spend by team"} subtitle={isTeam ? "Where this team's spend goes" : "Which teams use this app"}>
          <BarList
            color="var(--c3)"
            items={data.related.map((x) => ({
              id: x.id || "none",
              label: x.name,
              value: x.costUsd,
              href: x.id ? r(isTeam ? `/dashboard/applications/${x.id}` : `/dashboard/teams/${x.id}`) : undefined,
            }))}
          />
        </Card>
      </div>

      <Card className="mt-4" title="Models used" subtitle="Per-model usage, spend and performance" bodyClassName="pb-0">
        <DataTable
          caption="Models used"
          rows={data.models}
          columns={modelCols}
          rowKey={(m) => `${m.provider}:${m.model}`}
          href={(m) => r(`/dashboard/models/${encodeURIComponent(m.provider)}/${encodeURIComponent(m.model)}`)}
          initialSort={{ key: "spend", dir: "desc" }}
          pageSize={8}
        />
      </Card>

      <div className={cx("mt-4 grid gap-4", !isTeam && "lg:grid-cols-3")}>
        <Card className={cx(!isTeam && "lg:col-span-2")} title="Top users" subtitle="By spend in range" bodyClassName="pb-0">
          <DataTable
            caption="Top users"
            rows={data.users}
            columns={userCols}
            rowKey={(u) => u.user}
            initialSort={{ key: "spend", dir: "desc" }}
            pageSize={8}
            empty={<p className="py-6 text-center text-sm text-muted">No user attribution. Send a `user` field with events to see top consumers.</p>}
          />
        </Card>
        {!isTeam && (
          <Card title="Error codes" subtitle="Most frequent failures in range">
            {data.errorCodes.length ? (
              <BarList
                unit="count"
                color="var(--st-critical)"
                items={data.errorCodes.map((c) => ({ id: c.code, label: <span className="font-mono text-xs">{c.code}</span>, value: c.count, href: r(`/dashboard/requests?app=${encodeURIComponent(id)}&status=error`) }))}
              />
            ) : (
              <p className="py-6 text-center text-sm text-muted">No errors in this range.</p>
            )}
          </Card>
        )}
      </div>

      <Card
        className="mt-4"
        title="Anomalies & insights"
        subtitle={`Detected for this ${isTeam ? "team" : "application"}`}
        actions={
          <Link href="/dashboard/insights" className="inline-flex items-center gap-1 text-xs font-medium text-accent">
            All insights <ArrowRight size={12} />
          </Link>
        }
      >
        {data.insights.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.insights.map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted">No anomalies detected for this {isTeam ? "team" : "application"}.</p>
        )}
      </Card>

      {!isTeam && (
        <div className="card mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Code2 size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium">Instrument this app</p>
              <p className="text-xs text-muted">
                Send events to <code className="rounded bg-surface-2 px-1 font-mono">POST /api/v1/events</code> with{" "}
                <code className="rounded bg-surface-2 px-1 font-mono">&quot;application&quot;: &quot;{e.slug}&quot;</code> to attribute usage here.
              </p>
            </div>
          </div>
          <ButtonLink href="/docs/sdk" size="sm">
            Ingestion API docs
          </ButtonLink>
        </div>
      )}

      <EntityDialog
        kind={kind}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={{ id: e.id, name: e.name, description: e.description, teamId: e.team?.id ?? null }}
        teams={data.lookups.teams}
        onSaved={() => void refresh()}
      />
      <DeleteEntityDialog kind={kind} open={delOpen} onClose={() => setDelOpen(false)} id={e.id} name={e.name} />
    </div>
  );
}
