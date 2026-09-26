"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { api, ApiClientError, useApi } from "@/lib/api-client";
import { fmtCompact, fmtDateTime, fmtMs, fmtNumber, fmtUsd, prettyModel, providerLabel } from "@/lib/format";
import type { EventRow, Filters, Lookups } from "@/lib/types";
import { Button, Card, cx, EmptyState, ErrorState, InfoTip, PageHeader } from "@/components/ui/primitives";
import { FilterBar, PageSkeleton } from "@/components/dashboard/blocks";
import { useToast } from "@/components/providers/Toaster";

interface Page {
  events: EventRow[];
  nextCursor: string | null;
  filters: Filters;
}

// Query params the explorer honors (insight "View affected requests" links use these).
const KEYS = ["range", "from", "to", "provider", "model", "team", "app", "status", "user", "duplicates", "source"] as const;

const COST_LABEL = { PROVIDER_REPORTED: "Reported", CALCULATED: "Estimated", DEMO: "Demo" } as const;

export default function RequestsPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  const query = useMemo(() => {
    const q = new URLSearchParams();
    for (const k of KEYS) {
      const v = sp.get(k);
      if (v) q.set(k, v);
    }
    return q.toString();
  }, [sp]);

  const { data, error, loading, refresh } = useApi<Page>(`/api/v1/requests?${query}`);
  const { data: lookups } = useApi<{ lookups: Lookups }>(`/api/v1/analytics/models?range=90d`);
  const [extra, setExtra] = useState<EventRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    setExtra([]);
    setCursor(data?.nextCursor ?? null);
  }, [data]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const next = await api<Page>(`/api/v1/requests?${query}${query ? "&" : ""}cursor=${encodeURIComponent(cursor)}`);
      setExtra((e) => [...e, ...next.events]);
      setCursor(next.nextCursor);
    } catch (e) {
      toast({ tone: "error", title: "Couldn't load more requests", body: (e as ApiClientError).message });
    } finally {
      setLoadingMore(false);
    }
  };

  const setParam = (k: string, v: string | null) => {
    const q = new URLSearchParams(sp.toString());
    if (v) q.set(k, v);
    else q.delete(k);
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const chips: { key: string; label: string }[] = [];
  if (sp.get("status") === "error") chips.push({ key: "status", label: "Errors only" });
  if (sp.get("duplicates") === "1") chips.push({ key: "duplicates", label: "Repeated prompts" });
  if (sp.get("user")) chips.push({ key: "user", label: `User: ${sp.get("user")}` });
  if (sp.get("model")) chips.push({ key: "model", label: `Model: ${prettyModel(sp.get("model")!)}` });
  if (sp.get("source")) chips.push({ key: "source", label: `Source: ${sp.get("source")}` });

  const rows = [...(data?.events ?? []), ...extra];

  const header = (
    <PageHeader
      title="Requests"
      description="Every normalized usage event: instrumented requests and provider-reported buckets."
      actions={<FilterBar lookups={lookups?.lookups} exportDataset="events" />}
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

  return (
    <div>
      {header}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant={sp.get("status") === "error" ? "primary" : "secondary"} onClick={() => setParam("status", sp.get("status") === "error" ? null : "error")}>
          Errors only
        </Button>
        <Button size="sm" variant={sp.get("duplicates") === "1" ? "primary" : "secondary"} onClick={() => setParam("duplicates", sp.get("duplicates") === "1" ? null : "1")}>
          With prompt hash
        </Button>
        {chips.map((c) => (
          <span key={c.key} className="badge badge-accent h-6 gap-1 pl-2 pr-1 text-xs">
            {c.label}
            <button type="button" onClick={() => setParam(c.key, null)} aria-label={`Remove filter ${c.label}`} className="rounded p-0.5 hover:bg-accent/15">
              <X size={11} />
            </button>
          </span>
        ))}
      </div>

      <Card
        title="Events"
        subtitle={`${rows.length}${cursor ? "+" : ""} events · newest first`}
        bodyClassName="pb-0"
        actions={
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            Buckets vs requests
            <InfoTip label="About events">
              Instrumented apps send one event per request (×1). Provider syncs and demo data store daily aggregates — the ×N count shows how many requests a row represents.
            </InfoTip>
          </span>
        }
      >
        {rows.length === 0 ? (
          <EmptyState compact title="No events match these filters" body="Widen the date range or remove filters." actions={chips.length ? <Button onClick={() => router.replace(pathname)}>Clear filters</Button> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-hover">
              <caption className="sr-only">Usage events</caption>
              <thead>
                <tr>
                  <th className="w-6" aria-label="Expand" />
                  <th scope="col">Time</th>
                  <th scope="col">Model</th>
                  <th scope="col" className="hidden md:table-cell">Application</th>
                  <th scope="col" className="hidden lg:table-cell">Team</th>
                  <th scope="col" className="hidden lg:table-cell">User</th>
                  <th scope="col" className="text-right">Requests</th>
                  <th scope="col" className="hidden text-right sm:table-cell">Tokens in / out</th>
                  <th scope="col" className="text-right">Cost</th>
                  <th scope="col" className="hidden text-right sm:table-cell">Latency</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const expanded = open === e.id;
                  return (
                    <Fragment key={e.id}>
                      <tr
                        className="cursor-pointer"
                        onClick={() => setOpen(expanded ? null : e.id)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            setOpen(expanded ? null : e.id);
                          }
                        }}
                        tabIndex={0}
                        aria-expanded={expanded}
                      >
                        <td className="w-6 pr-0 text-faint">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                        <td className="tabular-nums text-muted">{fmtDateTime(e.timestamp)}</td>
                        <td>
                          <span className="font-medium">{prettyModel(e.model)}</span>
                          <span className="ml-1.5 text-2xs text-faint">{providerLabel(e.provider)}</span>
                        </td>
                        <td className="hidden md:table-cell">{e.applicationName ?? <span className="text-faint">—</span>}</td>
                        <td className="hidden lg:table-cell">{e.teamName ?? <span className="text-faint">—</span>}</td>
                        <td className="hidden max-w-[180px] truncate lg:table-cell">{e.userRef ?? <span className="text-faint">—</span>}</td>
                        <td className="num">{e.requestCount === 1 ? "1" : <span title="Aggregated bucket">×{fmtNumber(e.requestCount)}</span>}</td>
                        <td className="num hidden sm:table-cell">
                          {fmtCompact(e.inputTokens)} / {fmtCompact(e.outputTokens)}
                        </td>
                        <td className="num">
                          <span className="font-medium">{fmtUsd(e.costUsd)}</span>
                          <span className="ml-1 text-2xs text-faint">{COST_LABEL[e.costSource]}</span>
                        </td>
                        <td className="num hidden sm:table-cell">{fmtMs(e.latencyMs)}</td>
                        <td>
                          {e.errorCount > 0 ? (
                            <span className="badge badge-danger">{e.requestCount === 1 ? "Error" : `${fmtNumber(e.errorCount)} errors`}</span>
                          ) : (
                            <span className="badge badge-success">OK</span>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-surface-2/50">
                          <td />
                          <td colSpan={10} className="h-auto whitespace-normal py-3">
                            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                              <Detail label="Request ID" value={e.requestId} mono />
                              <Detail label="Prompt hash" value={e.promptHash} mono />
                              <Detail label="Error code" value={e.errorCode} mono />
                              <Detail label="Source" value={e.source === "INGEST_API" ? "Ingestion API" : e.source === "PROVIDER_SYNC" ? "Provider sync" : "Demo data"} />
                              <Detail label="Model id" value={`${e.provider} · ${e.model}`} mono />
                              <Detail label="Application" value={e.applicationName} />
                              <Detail label="Team" value={e.teamName} />
                              <Detail label="User" value={e.userRef} />
                            </dl>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {e.userRef && (
                                <Button size="sm" onClick={() => setParam("user", e.userRef)}>
                                  Filter to this user
                                </Button>
                              )}
                              <Button size="sm" onClick={() => router.push(`/dashboard/models/${encodeURIComponent(e.provider)}/${encodeURIComponent(e.model)}`)}>
                                Open model
                              </Button>
                              {e.applicationId && (
                                <Button size="sm" onClick={() => router.push(`/dashboard/applications/${e.applicationId}`)}>
                                  Open application
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {cursor && (
          <div className="flex justify-center border-t border-border py-3">
            <Button onClick={loadMore} loading={loadingMore}>
              Load more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-faint">{label}</dt>
      <dd className={cx("truncate text-fg", mono && "font-mono")}>{value || "—"}</dd>
    </div>
  );
}
