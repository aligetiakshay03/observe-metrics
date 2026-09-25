"use client";

import { useEffect, useState } from "react";
import { useSession } from "../../providers";
import {
  ChartCard, SectionHeader, DataTable, PageSkeleton, EmptyState, Delta,
  RangePicker, fmtUsd, fmtUsd0, fmtCompact, fmtPct,
  type Column,
} from "@/components/ui";
import { SpendAreaChart, RankedBars } from "@/components/charts";
import { IconChevronRight } from "@/components/icons";

interface TeamRow {
  team: string;
  requests: number;
  tokens: number;
  spendUsd: number;
  costPerRequest: number;
  deltaPct: number;
}

interface TeamDetail {
  team: TeamRow;
  models: { model: string; provider: string; spendUsd: number; tokens: number; requests: number }[];
  users: { name: string; requests: number; tokens: number; spendUsd: number }[];
  daily: { day: string; spendUsd: number }[];
  providers: { provider: string; spendUsd: number }[];
}

const cols: Column<TeamRow>[] = [
  { key: "team", header: "Team", render: (t) => <span className="font-medium">{t.team}</span> },
  { key: "spend", header: "Spend", numeric: true, render: (t) => <span className="font-semibold">{fmtUsd(t.spendUsd)}</span> },
  { key: "requests", header: "Requests", numeric: true, render: (t) => fmtCompact(t.requests) },
  { key: "tokens", header: "Tokens", numeric: true, render: (t) => fmtCompact(t.tokens) },
  { key: "cpr", header: "Avg cost/request", numeric: true, render: (t) => "$" + t.costPerRequest.toFixed(3) },
  { key: "delta", header: "Change", numeric: true, render: (t) => <Delta value={t.deltaPct} goodWhenDown /> },
  {
    key: "open", header: "", render: () => (
      <span className="faint"><IconChevronRight size={14} /></span>
    ),
  },
];

export default function TeamsPage() {
  const { me, loading: sessionLoading } = useSession();
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<TeamRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<TeamDetail | null>(null);

  useEffect(() => {
    if (sessionLoading || !me) return;
    const params = new URLSearchParams({ from: isoDaysAgo(days), to: isoToday() });
    fetch("/api/v1/analytics/teams?" + params.toString(), { cache: "no-store" })
      .then(async (res) => (res.ok ? (await res.json()).data.teams : []))
      .then(setRows)
      .catch(() => setRows([]));
  }, [me, sessionLoading, days]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    const params = new URLSearchParams({ from: isoDaysAgo(days), to: isoToday(), team: selected });
    fetch("/api/v1/analytics/teams?" + params.toString(), { cache: "no-store" })
      .then(async (res) => (res.ok ? (await res.json()).data : null))
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [selected, days]);

  if (sessionLoading) return <PageSkeleton />;

  const hasData = (rows?.length ?? 0) > 0;

  return (
    <div>
      <SectionHeader
        title="Teams"
        subtitle="AI spend, usage and efficiency by team."
        actions={<RangePicker value={days} onChange={setDays} />}
      />

      {!hasData && rows !== null ? (
        <EmptyState
          title="No team attribution yet"
          body="Tag members with a team in Settings → Team to unlock cost allocation."
          ctaHref="/dashboard/settings"
          ctaLabel="Configure teams"
        />
      ) : selected && detail ? (
        /* ── Team drill-down ── */
        <div>
          <button onClick={() => setSelected(null)} className="btn btn-ghost btn-sm mb-4 -ml-2.5">← All teams</button>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="surface px-4 py-3.5">
              <span className="label">Team spend</span>
              <div className="mt-1.5 text-[24px] font-bold leading-none tabular-nums">{fmtUsd(detail.team.spendUsd)}</div>
              <div className="mt-2"><Delta value={detail.team.deltaPct} goodWhenDown /></div>
            </div>
            <div className="surface px-4 py-3.5">
              <span className="label">Requests</span>
              <div className="mt-1.5 text-[24px] font-bold leading-none tabular-nums">{fmtCompact(detail.team.requests)}</div>
            </div>
            <div className="surface px-4 py-3.5">
              <span className="label">Tokens</span>
              <div className="mt-1.5 text-[24px] font-bold leading-none tabular-nums">{fmtCompact(detail.team.tokens)}</div>
            </div>
            <div className="surface px-4 py-3.5">
              <span className="label">Avg cost / request</span>
              <div className="mt-1.5 text-[24px] font-bold leading-none tabular-nums">${detail.team.costPerRequest.toFixed(3)}</div>
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <ChartCard title="Daily spend" className="lg:col-span-2">
              <SpendAreaChart data={detail.daily} height={220} />
            </ChartCard>
            <ChartCard title="Top models">
              <RankedBars data={detail.models.map((m) => ({ name: m.model, value: m.spendUsd }))} maxRows={6} />
            </ChartCard>
          </div>
          <div className="mt-4">
            <ChartCard title={"Users in " + detail.team.team} bodyClassName="p-0">
              <div className="px-2 pb-2">
                <DataTable
                  columns={[
                    { key: "name", header: "User", render: (u) => <span className="font-medium">{u.name}</span> },
                    { key: "requests", header: "Requests", numeric: true, render: (u) => fmtCompact(u.requests) },
                    { key: "tokens", header: "Tokens", numeric: true, render: (u) => fmtCompact(u.tokens) },
                    { key: "spend", header: "Attributed spend", numeric: true, render: (u) => fmtUsd(u.spendUsd) },
                  ]}
                  rows={detail.users}
                  rowKey={(u) => u.name}
                  emptyMessage="No user attribution for this team yet"
                />
              </div>
            </ChartCard>
          </div>
        </div>
      ) : (
        <div className="surface p-2">
          <DataTable columns={cols} rows={rows ?? []} rowKey={(t) => t.team} onRowClick={(t) => setSelected(t.team)} emptyMessage="No data" />
        </div>
      )}
    </div>
  );
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return d.toISOString().slice(0, 10);
}
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
