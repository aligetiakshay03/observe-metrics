"use client";

import { useEffect, useState } from "react";
import { useSession } from "../../providers";
import {
  MetricCard, ChartCard, SectionHeader, DataTable, ProviderBadge, ModelBadge,
  EmptyState, PageSkeleton, RangePicker, FilterDropdown, PROVIDER_FILTER_OPTIONS,
  fmtCompact,
  type Column,
} from "@/components/ui";
import { TokenStackedArea, RankedBars } from "@/components/charts";

interface OrgData {
  stats: { inputTokens: number; outputTokens: number; tokens: number; tokensPerRequest: number; requests: number };
  models: { model: string; provider: string; inputTokens: number; outputTokens: number; tokens: number; requests: number }[];
  teams: { team: string; tokens: number }[];
  users: { name: string; team: string; requests: number; tokens: number; spendUsd: number }[];
  daily: { day: string; inputTokens: number; outputTokens: number }[];
}

interface UserRow { name: string; team: string; requests: number; tokens: number; spendUsd: number }

const userCols: Column<UserRow>[] = [
  { key: "name", header: "User", render: (u) => <span className="font-medium">{u.name}</span> },
  { key: "team", header: "Team", render: (u) => <span className="badge badge-neutral">{u.team}</span> },
  { key: "requests", header: "Requests", numeric: true, render: (u) => fmtCompact(u.requests) },
  { key: "tokens", header: "Tokens", numeric: true, render: (u) => <span className="font-semibold">{fmtCompact(u.tokens)}</span> },
  { key: "spend", header: "Attributed spend", numeric: true, render: (u) => "$" + u.spendUsd.toFixed(0) },
];

export default function UsagePage() {
  const { me, loading: sessionLoading } = useSession();
  const [days, setDays] = useState(30);
  const [provider, setProvider] = useState("");
  const [data, setData] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionLoading || !me) return;
    setLoading(true);
    const params = new URLSearchParams({ from: isoDaysAgo(days), to: isoToday() });
    if (provider) params.set("provider", provider);
    fetch("/api/v1/analytics/org?" + params.toString(), { cache: "no-store" })
      .then(async (res) => (res.ok ? (await res.json()).data : null))
      .then((d) => setData(d?.empty ? null : d))
      .finally(() => setLoading(false));
  }, [me, sessionLoading, days, provider]);

  if (sessionLoading || loading) return <PageSkeleton />;

  if (!data || data.stats.tokens <= 0) {
    return (
      <div>
        <SectionHeader title="Usage" subtitle="Token consumption across models, teams and users." />
        <EmptyState
          title="No token data yet"
          body="Token analytics appear as soon as a provider connection syncs usage."
          ctaHref="/dashboard/settings"
          ctaLabel="Connect provider"
        />
      </div>
    );
  }

  const s = data.stats;
  const teamBars = data.teams.map((t) => ({ name: t.team, value: t.tokens }));
  const modelBars = data.models.map((m) => ({ name: m.model, value: m.tokens }));

  return (
    <div>
      <SectionHeader
        title="Usage"
        subtitle="Token consumption across models, teams and users."
        actions={
          <>
            <FilterDropdown value={provider} onChange={setProvider} options={PROVIDER_FILTER_OPTIONS} allLabel="All providers" />
            <RangePicker value={days} onChange={setDays} />
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Input tokens" value={fmtCompact(s.inputTokens)} />
        <MetricCard label="Output tokens" value={fmtCompact(s.outputTokens)} />
        <MetricCard label="Total tokens" value={fmtCompact(s.tokens)} />
        <MetricCard label="Tokens / request" value={fmtCompact(s.tokensPerRequest)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Tokens over time" subtitle="Input vs output, stacked" className="lg:col-span-2">
          <TokenStackedArea data={data.daily} />
        </ChartCard>
        <div className="grid gap-4">
          <ChartCard title="Tokens by model">
            <RankedBars data={modelBars} currency={false} color="#8b5cf6" maxRows={5} />
          </ChartCard>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Tokens by team">
          <RankedBars data={teamBars} currency={false} maxRows={6} />
        </ChartCard>
        <ChartCard title="Top token-consuming users" bodyClassName="p-0">
          <div className="px-2 pb-2">
            <DataTable columns={userCols} rows={data.users} rowKey={(u) => u.name} emptyMessage="No user attribution yet" />
          </div>
        </ChartCard>
      </div>

      {/* Model detail strip */}
      <div className="mt-4">
        <ChartCard title="By model" subtitle="Input / output split" bodyClassName="p-0">
          <div className="px-2 pb-2">
            <DataTable
              columns={[
                { key: "model", header: "Model", render: (m: (typeof data.models)[number]) => <ModelBadge model={m.model} /> },
                { key: "provider", header: "Provider", render: (m: (typeof data.models)[number]) => <ProviderBadge provider={m.provider} /> },
                { key: "in", header: "Input", numeric: true, render: (m: (typeof data.models)[number]) => fmtCompact(m.inputTokens) },
                { key: "out", header: "Output", numeric: true, render: (m: (typeof data.models)[number]) => fmtCompact(m.outputTokens) },
                { key: "total", header: "Total", numeric: true, render: (m: (typeof data.models)[number]) => <span className="font-semibold">{fmtCompact(m.tokens)}</span> },
              ]}
              rows={data.models}
              rowKey={(m) => m.model}
              emptyMessage="No model usage in this period"
            />
          </div>
        </ChartCard>
      </div>
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
