"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppWindow, MoreHorizontal, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useApi } from "@/lib/api-client";
import { useFilters, withRange } from "@/lib/use-filters";
import { fmtCompact, fmtMs, fmtNumber, fmtRate, fmtUsd } from "@/lib/format";
import type { EntityListRow, Filters, Lookups } from "@/lib/types";
import { Button, Card, cx, Delta, EmptyState, ErrorState, PageHeader } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { MenuItem, Popover } from "@/components/ui/overlay";
import { BarList, Donut } from "@/components/charts";
import { FilterBar, PageSkeleton } from "@/components/dashboard/blocks";
import { useMe } from "@/components/shell/MeProvider";
import { DeleteEntityDialog, EntityDialog, type EntityInitial } from "./EntityForms";

interface ListResponse {
  filters: Filters;
  lookups: Lookups;
  rows: EntityListRow[];
  isDemo: boolean;
}

const PALETTE = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)"];

export function EntityList({ kind }: { kind: "team" | "app" }) {
  const isTeam = kind === "team";
  const { query, values } = useFilters();
  const router = useRouter();
  const { can } = useMe();
  const admin = can("ADMIN");
  const { data, error, loading, refresh } = useApi<ListResponse>(`/api/v1/analytics/${isTeam ? "teams" : "applications"}?${query}`);
  const [editing, setEditing] = useState<EntityInitial | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const base = isTeam ? "/dashboard/teams" : "/dashboard/applications";
  const noun = isTeam ? "team" : "application";

  const header = (
    <PageHeader
      title={isTeam ? "Teams" : "Applications"}
      description={isTeam ? "Attribute AI spend, tokens and performance to the teams that own them." : "See which products and agents drive AI usage, cost and errors."}
      actions={
        <>
          <FilterBar lookups={data?.lookups} exportDataset={isTeam ? "teams" : "applications"} show={{ provider: true, team: !isTeam, app: false }} />
          {admin && (
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>
              New {noun}
            </Button>
          )}
        </>
      }
    />
  );

  if (loading && !data) return <PageSkeleton kpis={0} />;
  if (error && !data)
    return (
      <>
        {header}
        <div className="card">
          <ErrorState message={error.message} onRetry={refresh} />
        </div>
      </>
    );
  if (!data) return null;

  const rows = data.rows;
  const withSpend = rows.filter((r) => r.costUsd > 0);
  const total = withSpend.reduce((a, r) => a + r.costUsd, 0);

  const columns: Column<EntityListRow>[] = [
    {
      key: "name",
      header: isTeam ? "Team" : "Application",
      cell: (r) => <span className={cx("font-medium", !r.id && "text-muted")}>{r.name}</span>,
      sort: (r) => r.name,
    },
    ...(isTeam ? [] : [{ key: "team", header: "Team", cell: (r: EntityListRow) => <span className="text-muted">{r.teamName ?? "—"}</span>, sort: (r: EntityListRow) => r.teamName ?? "", hideBelow: "md" as const }]),
    { key: "spend", header: "Spend", numeric: true, cell: (r) => <span className="font-medium">{fmtUsd(r.costUsd)}</span>, sort: (r) => r.costUsd },
    { key: "requests", header: "Requests", numeric: true, cell: (r) => fmtNumber(r.requests), sort: (r) => r.requests },
    { key: "tokens", header: "Tokens", numeric: true, cell: (r) => fmtCompact(r.tokens), sort: (r) => r.tokens, hideBelow: "sm" },
    { key: "cpr", header: isTeam ? "Avg cost/req" : "Cost/request", numeric: true, cell: (r) => fmtUsd(r.costPerRequest), sort: (r) => r.costPerRequest, hideBelow: "lg" },
    { key: "latency", header: "Latency", numeric: true, cell: (r) => fmtMs(r.latencyMs), sort: (r) => r.latencyMs, hideBelow: "lg" },
    ...(isTeam
      ? [{ key: "members", header: "Members", numeric: true, cell: (r: EntityListRow) => (r.id ? fmtNumber(r.members) : "—"), sort: (r: EntityListRow) => r.members, hideBelow: "md" as const }]
      : [
          {
            key: "errors",
            header: "Errors",
            numeric: true,
            cell: (r: EntityListRow) => <span className={cx(r.errorRate >= 0.02 && "font-medium text-danger")}>{fmtRate(r.errorRate)}</span>,
            sort: (r: EntityListRow) => r.errorRate,
            hideBelow: "md" as const,
          },
        ]),
    { key: "change", header: "Change", numeric: true, cell: (r) => <Delta value={r.change} inverse />, sort: (r) => r.change },
    ...(admin
      ? [
          {
            key: "actions",
            header: <span className="sr-only">Actions</span>,
            className: "w-10",
            cell: (r: EntityListRow) =>
              r.id ? (
                <Popover
                  label={`${r.name} actions`}
                  width="w-40"
                  trigger={({ toggle, ref, ...aria }) => (
                    <Button ref={ref} variant="ghost" size="sm" onClick={toggle} {...aria} aria-label={`Actions for ${r.name}`} icon={<MoreHorizontal size={14} />} />
                  )}
                >
                  {(close) => (
                    <>
                      <MenuItem
                        icon={<Pencil size={13} />}
                        onSelect={() => {
                          close();
                          const app = data.lookups.apps.find((a) => a.id === r.id);
                          setEditing({ id: r.id, name: r.name, teamId: app?.teamId ?? null });
                        }}
                      >
                        {isTeam ? "Rename" : "Edit"}
                      </MenuItem>
                      <MenuItem
                        danger
                        icon={<Trash2 size={13} />}
                        onSelect={() => {
                          close();
                          setDeleting({ id: r.id, name: r.name });
                        }}
                      >
                        Delete
                      </MenuItem>
                    </>
                  )}
                </Popover>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <div>
      {header}
      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={isTeam ? <Users size={18} /> : <AppWindow size={18} />}
            title={isTeam ? "No teams yet" : "No applications yet"}
            body={
              isTeam
                ? "Create teams to attribute spend, or send a `team` field with each event — teams are created automatically on first sight."
                : "Send an `application` field with each event from the ingestion API and applications appear here automatically, or create one now."
            }
            actions={
              admin ? (
                <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({})}>
                  New {noun}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card title="Share of spend" subtitle={`${fmtUsd(total)} in range`}>
              <Donut
                centerLabel="Spend"
                items={withSpend.slice(0, 4).map((r, i) => ({ id: r.id || "none", label: r.name, value: r.costUsd, color: PALETTE[i]!, href: r.id ? withRange(`${base}/${r.id}`, values) : undefined }))}
              />
              {withSpend.length > 4 && <p className="mt-2 text-xs text-muted">Top 4 shown · {withSpend.length - 4} more in the table.</p>}
            </Card>
            <Card className="lg:col-span-2" title="Tokens by volume" subtitle="Input + output tokens">
              <BarList
                unit="tokens"
                color="var(--c2)"
                items={[...rows].sort((a, b) => b.tokens - a.tokens).filter((r) => r.tokens > 0).map((r) => ({ id: r.id || "none", label: r.name, value: r.tokens, href: r.id ? withRange(`${base}/${r.id}`, values) : undefined }))}
                secondary={(id) => <span className="text-xs text-muted">{fmtNumber(rows.find((r) => (r.id || "none") === id)?.requests ?? 0)} req</span>}
              />
            </Card>
          </div>
          <Card className="mt-4" title={isTeam ? "All teams" : "All applications"} bodyClassName="pb-0">
            <DataTable
              caption={isTeam ? "Teams" : "Applications"}
              rows={rows}
              columns={columns}
              rowKey={(r) => r.id || "unattributed"}
              href={(r) => (r.id ? withRange(`${base}/${r.id}`, values) : null)}
              initialSort={{ key: "spend", dir: "desc" }}
              searchable={(r) => `${r.name} ${r.teamName ?? ""}`}
              searchPlaceholder={`Search ${isTeam ? "teams" : "applications"}…`}
              pageSize={15}
            />
          </Card>
        </>
      )}
      <EntityDialog
        kind={kind}
        open={!!editing}
        onClose={() => setEditing(null)}
        initial={editing ?? undefined}
        teams={data.lookups.teams}
        onSaved={(id) => {
          void refresh();
          if (!editing?.id) router.push(`${base}/${id}`);
        }}
      />
      {deleting && <DeleteEntityDialog kind={kind} open onClose={() => { setDeleting(null); void refresh(); }} id={deleting.id} name={deleting.name} />}
    </div>
  );
}
