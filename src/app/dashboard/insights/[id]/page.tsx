"use client";

import Link from "next/link";
import { useState } from "react";
import { AppWindow, ArrowRight, Boxes, CircleCheck, EyeOff, FlaskConical, List, RotateCcw, SearchX, Users } from "lucide-react";
import { api, clearApiCache, useApi } from "@/lib/api-client";
import { fmtCompact, fmtDate, fmtDateTime, fmtMs, fmtUsd, fmtUsd0, prettyModel, providerLabel } from "@/lib/format";
import type { EventRow, InsightDetail, InsightMetric } from "@/lib/types";
import { Button, ButtonLink, Card, cx, Delta, EmptyState, ErrorState, ModelName, Notice, ProviderName, SeverityBadge, Skeleton } from "@/components/ui/primitives";
import { EvidenceChart, fmtUnit } from "@/components/charts";
import { ImpactText, insightTypeLabel } from "@/components/dashboard/blocks";
import { useToast } from "@/components/providers/Toaster";
import { useMe } from "@/components/shell/MeProvider";

const STATUS_BADGE: Record<InsightDetail["status"], { label: string; cls: string }> = {
  OPEN: { label: "Open", cls: "badge-accent" },
  DISMISSED: { label: "Dismissed", cls: "badge-neutral" },
  RESOLVED: { label: "Resolved", cls: "badge-success" },
};

// Metrics where a higher value is bad (so increases render red).
const inverseFor = (m: InsightMetric) => m.unit !== "count" || /fail|error|duplicate/i.test(m.label);

export default function InsightDetailPage({ params }: { params: { id: string } }) {
  const { data, error, loading, refresh, mutate } = useApi<InsightDetail>(`/api/v1/insights/${encodeURIComponent(params.id)}`);
  const { data: related, loading: relLoading } = useApi<{ events: EventRow[] }>(data ? `/api/v1/requests?${data.relatedRequestsQuery}` : null);
  const toast = useToast();
  const { can } = useMe();
  const [busy, setBusy] = useState<string | null>(null);

  if (loading && !data) return <DetailSkeleton />;
  if (error && !data) {
    if (error.status === 404)
      return (
        <div className="card">
          <EmptyState
            icon={<SearchX size={18} />}
            title="Insight not found"
            body="It may have been removed when usage data was reset, or it belongs to another workspace."
            actions={<ButtonLink href="/dashboard/insights">Back to insights</ButtonLink>}
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
  const i = data;

  const setStatus = async (status: InsightDetail["status"]) => {
    setBusy(status);
    try {
      await api(`/api/v1/insights/${i.id}`, { method: "PATCH", body: { status } });
      mutate({ ...i, status });
      clearApiCache("/api/v1/insights");
      clearApiCache("/api/v1/alerts");
      clearApiCache("/api/v1/analytics");
      toast({ tone: "success", title: status === "OPEN" ? "Insight reopened" : status === "RESOLVED" ? "Marked as resolved" : "Insight dismissed", body: i.title });
    } catch (e) {
      toast({ tone: "error", title: "Couldn't update insight", body: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const modelHref = i.model && i.provider ? `/dashboard/models/${encodeURIComponent(i.provider)}/${encodeURIComponent(i.model)}` : null;
  const appHref = i.applicationId ? `/dashboard/applications/${i.applicationId}` : null;
  const teamHref = i.teamId ? `/dashboard/teams/${i.teamId}` : null;
  const requestsHref = `/dashboard/requests?${i.relatedRequestsQuery}`;
  const win =
    i.windowStart.slice(0, 10) === i.windowEnd.slice(0, 10)
      ? fmtDate(i.windowStart.slice(0, 10), { month: "short", day: "numeric", year: "numeric" })
      : `${fmtDate(i.windowStart.slice(0, 10))} – ${fmtDate(i.windowEnd.slice(0, 10), { month: "short", day: "numeric", year: "numeric" })}`;
  const impactWord = i.impactKind === "savings" ? "Potential savings" : i.impactKind === "cost_increase" ? "Added cost" : "Risk";

  return (
    <div className="mx-auto max-w-[1180px]">
      <Link href="/dashboard/insights" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
        ← Insights
      </Link>

      {i.isDemo && (
        <div className="mb-4">
          <Notice tone="warning" title="Demo data">
            This insight was detected from Helix Labs sample data by the same rules that run on real workspaces.
          </Notice>
        </div>
      )}

      {/* Header */}
      <header className="card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xs font-semibold uppercase tracking-wider text-muted">{insightTypeLabel(i.type)}</span>
              <SeverityBadge severity={i.severity} />
              <span className={cx("badge", STATUS_BADGE[i.status].cls)}>{STATUS_BADGE[i.status].label}</span>
            </div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{i.title}</h1>
            <p className="mt-1.5 text-sm text-muted">{i.summary}</p>
            <p className="mt-2 text-xs text-faint">
              Detected {fmtDateTime(i.detectedAt)} · Window {win}
            </p>
          </div>
          {can("MEMBER") && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {i.status === "OPEN" ? (
                <>
                  <Button variant="primary" icon={<CircleCheck size={14} />} loading={busy === "RESOLVED"} disabled={!!busy} onClick={() => void setStatus("RESOLVED")}>
                    Mark resolved
                  </Button>
                  <Button icon={<EyeOff size={14} />} loading={busy === "DISMISSED"} disabled={!!busy} onClick={() => void setStatus("DISMISSED")}>
                    Dismiss
                  </Button>
                </>
              ) : (
                <Button icon={<RotateCcw size={14} />} loading={busy === "OPEN"} onClick={() => void setStatus("OPEN")}>
                  Reopen
                </Button>
              )}
            </div>
          )}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border lg:grid-cols-4">
          <Meta label="Affected provider">{i.provider ? <Link href={`/dashboard/costs?provider=${encodeURIComponent(i.provider)}`} className="hover:underline"><ProviderName provider={i.provider} /></Link> : "—"}</Meta>
          <Meta label="Affected model">{modelHref ? <Link href={modelHref} className="hover:underline">{prettyModel(i.model!)}</Link> : "—"}</Meta>
          <Meta label="Affected team">{teamHref ? <Link href={teamHref} className="hover:underline">{i.teamName ?? "Team"}</Link> : "—"}</Meta>
          <Meta label="Affected application">{appHref ? <Link href={appHref} className="hover:underline">{i.applicationName ?? "Application"}</Link> : "—"}</Meta>
        </dl>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Narrative */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="space-y-5 pt-2">
              <Section title="What happened">{i.whatHappened}</Section>
              <Section title="Why it matters">{i.whyItMatters}</Section>
              <Section title="What caused it">{i.cause}</Section>
            </div>
          </Card>

          <Card title="Evidence" subtitle="Current window vs baseline, computed from recorded usage">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {i.metrics.map((m) => (
                <MetricTile key={m.label} m={m} />
              ))}
            </div>
          </Card>

          {i.trend && i.trend.length > 1 && (
            <Card title="Trend" subtitle={i.trendLabel ?? undefined}>
              <EvidenceChart points={i.trend} unit={i.trendUnit ?? "count"} label={i.trendLabel ?? "Value"} />
            </Card>
          )}

          <Card
            title="Related requests"
            subtitle="Usage events matching this insight's scope and window"
            bodyClassName="pb-0"
            actions={
              <Link href={requestsHref} className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                View affected requests <ArrowRight size={12} />
              </Link>
            }
          >
            <RelatedRequests loading={relLoading} events={related?.events} />
          </Card>
        </div>

        {/* Action column */}
        <aside className="space-y-4">
          <section className="card border-accent/40 p-4">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-accent">Recommended action</h2>
            <p className="mt-2 text-sm leading-relaxed">{i.recommendation}</p>
          </section>
          <section className="card p-4">
            <h2 className="text-2xs font-semibold uppercase tracking-wider text-muted">Estimated impact</h2>
            {i.estimatedImpactUsd != null ? (
              <>
                <p className={cx("mt-2 text-2xl font-semibold tabular-nums", i.impactKind === "savings" ? "text-success" : "text-danger")}>
                  {i.impactKind === "savings" ? "" : "+"}
                  {fmtUsd0(i.estimatedImpactUsd)}
                  <span className="text-sm font-normal text-muted"> / month</span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {impactWord} — an estimate from the current run-rate and model list prices, not a billed amount.
                </p>
                <div className="mt-2">
                  <ImpactText i={i} />
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">
                {i.impactKind === "risk" ? "Reliability or budget risk — no direct dollar estimate. See evidence for scale." : "No dollar estimate for this insight."}
              </p>
            )}
          </section>
          <section className="card space-y-2 p-4">
            <h2 className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted">Investigate</h2>
            <ButtonLink href={requestsHref} className="w-full justify-start" icon={<List size={14} />}>
              View affected requests
            </ButtonLink>
            {appHref && (
              <ButtonLink href={appHref} className="w-full justify-start" icon={<AppWindow size={14} />}>
                View application
              </ButtonLink>
            )}
            {modelHref && (
              <ButtonLink href={modelHref} className="w-full justify-start" icon={<Boxes size={14} />}>
                View model
              </ButtonLink>
            )}
            {teamHref && (
              <ButtonLink href={teamHref} className="w-full justify-start" icon={<Users size={14} />}>
                View team
              </ButtonLink>
            )}
          </section>
          <p className="flex items-start gap-1.5 px-1 text-xs text-faint">
            <FlaskConical size={12} className="mt-0.5 shrink-0" aria-hidden />
            Detected by deterministic rules over your usage data — no ML model. Current window vs previous 14-day baseline.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <dt className="text-2xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-2xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed">{children}</p>
    </section>
  );
}

function MetricTile({ m }: { m: InsightMetric }) {
  const hasBaseline = m.change != null;
  return (
    <div className="rounded-md border border-border bg-surface-2/40 p-3">
      <p className="text-xs text-muted">{m.label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{fmtUnit(m.current, m.unit)}</p>
      {hasBaseline ? (
        <div className="mt-1 flex items-center gap-2 text-xs">
          <Delta value={m.change} inverse={inverseFor(m)} />
          <span className="text-faint">from {fmtUnit(m.baseline, m.unit)}</span>
        </div>
      ) : m.baseline && m.unit !== "ratio" ? (
        <p className="mt-1 text-xs text-faint">vs {fmtUnit(m.baseline, m.unit)}</p>
      ) : null}
    </div>
  );
}

function RelatedRequests({ loading, events }: { loading: boolean; events?: EventRow[] }) {
  if (loading && !events)
    return (
      <div className="space-y-2 pb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  if (!events?.length) return <p className="pb-6 pt-2 text-center text-sm text-muted">No matching events in this window.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <caption className="sr-only">Related requests</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Model</th>
            <th scope="col" className="hidden md:table-cell">Application</th>
            <th scope="col" className="text-right">Requests</th>
            <th scope="col" className="text-right">Input</th>
            <th scope="col" className="hidden text-right sm:table-cell">Output</th>
            <th scope="col" className="text-right">Cost</th>
            <th scope="col" className="hidden text-right lg:table-cell">Latency</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {events.slice(0, 8).map((e) => (
            <tr key={e.id}>
              <td className="text-xs text-muted">{fmtDateTime(e.timestamp)}</td>
              <td>
                <ModelName model={e.model} sub={false} />
                <span className="sr-only"> ({providerLabel(e.provider)})</span>
              </td>
              <td className="hidden text-muted md:table-cell">{e.applicationName ?? "—"}</td>
              <td className="num">{e.requestCount === 1 ? "1" : `×${fmtCompact(e.requestCount)}`}</td>
              <td className="num">{fmtCompact(e.inputTokens)}</td>
              <td className="num hidden sm:table-cell">{fmtCompact(e.outputTokens)}</td>
              <td className="num">{fmtUsd(e.costUsd)}</td>
              <td className="num hidden lg:table-cell">{fmtMs(e.latencyMs)}</td>
              <td>
                {e.errorCount > 0 ? (
                  <span className="badge badge-danger" title={e.errorCode ?? undefined}>
                    {e.requestCount === 1 ? e.errorCode ?? "error" : `${fmtCompact(e.errorCount)} errors`}
                  </span>
                ) : (
                  <span className="badge badge-success">ok</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-[1180px]" aria-busy="true" aria-label="Loading insight">
      <div className="card space-y-3 p-5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-4 h-14 w-full" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card space-y-4 p-4 lg:col-span-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ))}
        </div>
        <div className="card space-y-3 p-4">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}
