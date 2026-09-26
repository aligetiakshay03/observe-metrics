"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, ExternalLink, History, KeyRound, Pause, Play, Plug, RefreshCw, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { api, useApi } from "@/lib/api-client";
import { fmtDateTime, fmtRelative, providerColor } from "@/lib/format";
import type { ConnectionInfo, ProviderInfo } from "@/lib/types";
import { Button, Card, cx, ErrorState, Field, Notice, Spinner } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog } from "@/components/ui/overlay";
import { useToast } from "@/components/providers/Toaster";
import { useMe } from "@/components/shell/MeProvider";
import { errMsg, SettingsSkeleton } from "../_components/common";

interface ProvidersData {
  catalog: ProviderInfo[];
  connections: ConnectionInfo[];
  canManage: boolean;
  isDemo: boolean;
}
interface ValidationResult {
  ok: boolean;
  code?: string;
  message: string;
}
interface SyncOutcome {
  status: "SUCCESS" | "FAILED" | "RETRYING";
  recordsIngested: number;
  message: string;
}

export default function ProvidersSettings() {
  const { data, error, loading, refresh, mutate } = useApi<ProvidersData>("/api/v1/providers");
  const { me } = useMe();
  const toast = useToast();
  const [connectFor, setConnectFor] = useState<ProviderInfo | null>(null);
  const [rotate, setRotate] = useState<{ provider: ProviderInfo; conn: ConnectionInfo } | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  if (loading && !data) return <SettingsSkeleton rows={4} />;
  if (error && !data) return <div className="card"><ErrorState message={error.message} onRetry={refresh} /></div>;
  if (!data) return null;

  const locked = data.isDemo || me.user.isGuest;
  const canManage = data.canManage && !locked;
  const replaceConn = (c: ConnectionInfo) => mutate({ ...data, connections: data.connections.map((x) => (x.id === c.id ? c : x)) });

  const syncAll = async () => {
    setSyncingAll(true);
    try {
      const r = await api<{ results: { connectionId: string; outcome: SyncOutcome | null }[] }>("/api/v1/providers/sync-all", { body: {} });
      const failed = r.results.filter((x) => x.outcome?.status === "FAILED").length;
      toast({
        tone: failed ? "error" : "success",
        title: r.results.length ? `Synced ${r.results.length - failed} of ${r.results.length} connections` : "No active connections to sync",
        body: failed ? "Check the connections marked with errors." : undefined,
      });
      await refresh();
    } catch (e) {
      toast({ tone: "error", title: "Sync failed", body: errMsg(e) });
    } finally {
      setSyncingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      {locked && (
        <Notice
          tone="warning"
          title={me.user.isGuest ? "You're exploring as a guest" : "Provider connections are disabled in the demo workspace"}
          action={
            me.user.isGuest ? (
              <Link href="/signup?from=demo" className="btn btn-secondary btn-sm">Create free account</Link>
            ) : (
              <Link href="/onboarding?new=1" className="btn btn-secondary btn-sm">Create a workspace</Link>
            )
          }
        >
          The demo workspace only contains generated sample data, so no real API keys can be stored here.
          {me.user.isGuest ? " Create an account to connect your own providers." : " Switch to your own workspace to connect providers."}
        </Notice>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Credentials are validated with the provider, encrypted server-side and never shown again after saving.
        </p>
        {canManage && data.connections.length > 0 && (
          <Button icon={<RefreshCw size={14} />} loading={syncingAll} onClick={syncAll}>
            {syncingAll ? "Syncing…" : "Sync all"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.catalog.map((p, i) => {
          const conns = data.connections.filter((c) => c.provider === p.id);
          return (
            <ProviderCard
              key={p.id}
              provider={p}
              index={i}
              connections={conns}
              canManage={canManage}
              locked={locked}
              onConnect={() => setConnectFor(p)}
              onRotate={(c) => setRotate({ provider: p, conn: c })}
              onChanged={replaceConn}
              onRemoved={() => void refresh()}
            />
          );
        })}
      </div>

      <Card title="What ObserveMetrics can read" subtitle="We only use provider APIs that exist today — no scraping and no guessing.">
        <ul className="space-y-2.5 text-sm">
          <li className="flex gap-2.5">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
            <span>
              <span className="font-medium">OpenAI and Anthropic Admin keys</span> — daily token usage per model and provider-reported costs from their organization usage and cost reports. Anthropic doesn&apos;t report request counts or latency.
            </span>
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
            <span>
              <span className="font-medium">Google Gemini and Mistral API keys</span> — key verification and available models only. These providers don&apos;t offer a usage-history API, so send usage from your applications with the{" "}
              <Link href="/docs/sdk" className="link">ingestion API</Link>.
            </span>
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
            <span>
              <span className="font-medium">Latency, errors, teams, applications and users</span> come from instrumented events — provider usage APIs don&apos;t include them.
            </span>
          </li>
          <li className="flex gap-2.5">
            <XCircle size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden />
            <span className="text-muted">ObserveMetrics cannot read personal ChatGPT or Claude subscription usage — only API usage from your organization.</span>
          </li>
        </ul>
      </Card>

      {connectFor && (
        <KeyDialog
          mode="connect"
          provider={connectFor}
          onClose={() => setConnectFor(null)}
          onDone={async (msg) => {
            setConnectFor(null);
            toast({ tone: "success", title: `${connectFor.label} connected`, body: msg });
            await refresh();
          }}
        />
      )}
      {rotate && (
        <KeyDialog
          mode="rotate"
          provider={rotate.provider}
          connection={rotate.conn}
          onClose={() => setRotate(null)}
          onDone={async () => {
            setRotate(null);
            toast({ tone: "success", title: "Key updated", body: "The new key was verified and a sync was queued." });
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ conn }: { conn?: ConnectionInfo }) {
  if (!conn) return <span className="badge badge-neutral">Not connected</span>;
  if (conn.status === "DISABLED") return <span className="badge badge-neutral"><Pause size={10} aria-hidden /> Paused</span>;
  if (conn.status === "ERROR") return <span className="badge badge-danger"><XCircle size={11} aria-hidden /> Error</span>;
  return <span className="badge badge-success"><CheckCircle2 size={11} aria-hidden /> Connected</span>;
}

const SYNC_LABEL: Record<ConnectionInfo["syncStatus"], string> = {
  IDLE: "Not synced yet",
  QUEUED: "Queued",
  RUNNING: "Syncing…",
  SUCCESS: "Last sync succeeded",
  FAILED: "Last sync failed",
};

function ProviderCard({
  provider,
  index,
  connections,
  canManage,
  locked,
  onConnect,
  onRotate,
  onChanged,
  onRemoved,
}: {
  provider: ProviderInfo;
  index: number;
  connections: ConnectionInfo[];
  canManage: boolean;
  locked: boolean;
  onConnect: () => void;
  onRotate: (c: ConnectionInfo) => void;
  onChanged: (c: ConnectionInfo) => void;
  onRemoved: () => void;
}) {
  const primary = connections[0];
  return (
    <section className="card flex flex-col" aria-labelledby={`prov-${provider.id}`}>
      <header className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-2" aria-hidden>
            <span className="h-3 w-3 rounded-[3px]" style={{ background: providerColor(provider.id, index) }} />
          </span>
          <div>
            <h2 id={`prov-${provider.id}`} className="text-sm font-semibold">{provider.label}</h2>
            <p className="text-xs text-muted">
              {provider.capabilities.usage ? "Usage & cost sync" : "Models only — usage via ingestion API"}
            </p>
          </div>
        </div>
        <StatusBadge conn={primary} />
      </header>
      <div className="flex-1 px-4 pb-4 pt-3">
        {connections.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">{provider.usageNote ?? `Connect an ${provider.credential.label} to sync daily usage and costs.`}</p>
            <p className="text-xs text-faint">{provider.credential.help}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {connections.map((c) => (
              <ConnectionBlock key={c.id} provider={provider} conn={c} canManage={canManage} onRotate={() => onRotate(c)} onChanged={onChanged} onRemoved={onRemoved} />
            ))}
          </div>
        )}
      </div>
      {connections.length === 0 && (
        <footer className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
          <a href={provider.credential.docsUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
            Provider docs <ExternalLink size={11} aria-hidden />
          </a>
          <Button variant="primary" size="sm" icon={<Plug size={13} />} onClick={onConnect} disabled={!canManage} title={locked ? "Not available in the demo workspace" : !canManage ? "Only admins can connect providers" : undefined}>
            Connect
          </Button>
        </footer>
      )}
    </section>
  );
}

function ConnectionBlock({
  provider,
  conn,
  canManage,
  onRotate,
  onChanged,
  onRemoved,
}: {
  provider: ProviderInfo;
  conn: ConnectionInfo;
  canManage: boolean;
  onRotate: () => void;
  onChanged: (c: ConnectionInfo) => void;
  onRemoved: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<"test" | "sync" | "pause" | "delete" | null>(null);
  const [result, setResult] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const test = async () => {
    setBusy("test");
    setResult(null);
    try {
      const r = await api<{ result: ValidationResult; connection: ConnectionInfo }>(`/api/v1/providers/${conn.id}/test`, { body: {} });
      onChanged(r.connection);
      setResult({ tone: r.result.ok ? "success" : "danger", text: r.result.message });
    } catch (e) {
      setResult({ tone: "danger", text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };
  const sync = async () => {
    setBusy("sync");
    setResult(null);
    try {
      const r = await api<{ outcome: SyncOutcome | null; connection: ConnectionInfo | null }>(`/api/v1/providers/${conn.id}/sync`, { body: {} });
      if (r.connection) onChanged(r.connection);
      if (!r.outcome) setResult({ tone: "info", text: "A sync for this connection is already running. Status will update when it finishes." });
      else setResult({ tone: r.outcome.status === "SUCCESS" ? "success" : r.outcome.status === "RETRYING" ? "info" : "danger", text: r.outcome.message });
    } catch (e) {
      setResult({ tone: "danger", text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };
  const togglePause = async () => {
    setBusy("pause");
    try {
      const r = await api<{ connection: ConnectionInfo }>(`/api/v1/providers/${conn.id}`, { method: "PATCH", body: { enabled: conn.status === "DISABLED" } });
      onChanged(r.connection);
      toast({ tone: "success", title: r.connection.status === "DISABLED" ? "Sync paused" : "Sync resumed" });
    } catch (e) {
      toast({ tone: "error", title: "Couldn't update connection", body: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    setBusy("delete");
    try {
      await api(`/api/v1/providers/${conn.id}`, { method: "DELETE" });
      toast({ tone: "success", title: `${provider.label} disconnected`, body: "The stored key was deleted. Synced history is kept." });
      setConfirmDelete(false);
      onRemoved();
    } catch (e) {
      toast({ tone: "error", title: "Couldn't disconnect", body: errMsg(e) });
    } finally {
      setBusy(null);
    }
  };

  const syncing = conn.syncStatus === "RUNNING" || busy === "sync";
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-faint">{provider.credential.label}</dt>
          <dd className="mt-0.5 font-mono text-fg">{conn.maskedKey}</dd>
        </div>
        <div>
          <dt className="text-faint">Connection</dt>
          <dd className="mt-0.5 truncate font-medium text-fg">{conn.name}</dd>
        </div>
        <div>
          <dt className="text-faint">Last sync</dt>
          <dd className="mt-0.5 text-fg" title={conn.lastSyncedAt ? fmtDateTime(conn.lastSyncedAt) : undefined}>
            {fmtRelative(conn.lastSyncedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-faint">Next sync</dt>
          <dd className="mt-0.5 text-fg">{conn.status === "DISABLED" ? "Paused" : conn.nextSyncAt ? fmtRelative(conn.nextSyncAt) : "After first sync"}</dd>
        </div>
        <div>
          <dt className="text-faint">Sync status</dt>
          <dd className={cx("mt-0.5 flex items-center gap-1.5", conn.syncStatus === "FAILED" ? "text-danger" : "text-fg")}>
            {syncing && <Spinner size={11} />}
            {syncing ? "Syncing…" : SYNC_LABEL[conn.syncStatus]}
          </dd>
        </div>
        <div>
          <dt className="text-faint">Models</dt>
          <dd className="mt-0.5 text-fg">{conn.modelCount ?? "—"}</dd>
        </div>
      </dl>
      {provider.usageNote && <p className="text-xs text-muted">{provider.usageNote}</p>}
      {conn.lastSyncError && !result && (
        <Notice tone="danger" title="Last sync error">{conn.lastSyncError}</Notice>
      )}
      {result && <Notice tone={result.tone === "info" ? "info" : result.tone}>{result.text}</Notice>}
      <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
        <Button size="sm" icon={<ShieldCheck size={13} />} loading={busy === "test"} disabled={!canManage || !!busy} onClick={test}>
          Test connection
        </Button>
        <Button size="sm" icon={<RefreshCw size={13} />} loading={busy === "sync"} disabled={!canManage || !!busy || conn.status === "DISABLED"} onClick={sync}>
          Sync now
        </Button>
        <Button size="sm" variant="ghost" icon={<History size={13} />} onClick={() => setHistoryOpen(true)}>
          History
        </Button>
        {canManage && (
          <>
            <Button size="sm" variant="ghost" icon={<KeyRound size={13} />} disabled={!!busy} onClick={onRotate}>
              Rotate key
            </Button>
            <Button size="sm" variant="ghost" icon={conn.status === "DISABLED" ? <Play size={13} /> : <Pause size={13} />} loading={busy === "pause"} disabled={!!busy} onClick={togglePause}>
              {conn.status === "DISABLED" ? "Resume" : "Pause"}
            </Button>
            <Button size="sm" variant="ghost" className="text-danger hover:text-danger" icon={<Trash2 size={13} />} disabled={!!busy} onClick={() => setConfirmDelete(true)}>
              Disconnect
            </Button>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={busy === "delete"}
        danger
        title={`Disconnect ${provider.label}?`}
        body="The stored key is permanently deleted and scheduled syncs stop. Usage already synced stays in your dashboards."
        confirmLabel="Disconnect"
      />
      {historyOpen && <SyncHistory connectionId={conn.id} label={provider.label} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}

interface Job {
  id: string;
  status: string;
  trigger: string;
  attempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  recordsIngested: number;
  error: string | null;
  createdAt: string;
}

function SyncHistory({ connectionId, label, onClose }: { connectionId: string; label: string; onClose: () => void }) {
  const { data, error, loading, refresh } = useApi<{ jobs: Job[] }>(`/api/v1/providers/${connectionId}/jobs`);
  return (
    <Dialog open onClose={onClose} title={`${label} sync history`} description="The 10 most recent sync jobs." size="lg" footer={<Button onClick={onClose}>Close</Button>}>
      {loading && !data && <div className="flex justify-center py-8"><Spinner /></div>}
      {error && <ErrorState compact message={error.message} onRetry={refresh} />}
      {data && data.jobs.length === 0 && <p className="py-6 text-center text-sm text-muted">No sync jobs yet.</p>}
      {data && data.jobs.length > 0 && (
        <div className="-mx-5 overflow-x-auto">
          <table className="table">
            <caption className="sr-only">Sync jobs</caption>
            <thead>
              <tr>
                <th>Started</th>
                <th>Trigger</th>
                <th>Status</th>
                <th className="text-right">Buckets</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((j) => (
                <tr key={j.id}>
                  <td>{fmtDateTime(j.startedAt ?? j.createdAt)}</td>
                  <td className="capitalize">{j.trigger}</td>
                  <td>
                    <span className={cx("badge", j.status === "SUCCESS" ? "badge-success" : j.status === "FAILED" ? "badge-danger" : "badge-neutral")}>{j.status.toLowerCase()}</span>
                  </td>
                  <td className="num">{j.recordsIngested}</td>
                  <td className="max-w-[280px] truncate whitespace-normal text-xs text-muted">{j.error ?? (j.attempts > 1 ? `${j.attempts} attempts` : "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}

/** Connect / rotate dialog. The key lives only in this component's state. */
function KeyDialog({
  mode,
  provider,
  connection,
  onClose,
  onDone,
}: {
  mode: "connect" | "rotate";
  provider: ProviderInfo;
  connection?: ConnectionInfo;
  onClose: () => void;
  onDone: (message?: string) => void | Promise<void>;
}) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("Primary");
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setKey("");
    onClose();
  };

  const test = async () => {
    setBusy("test");
    setResult(null);
    setError(null);
    try {
      setResult(await api<ValidationResult>("/api/v1/providers/test", { body: { provider: provider.id, apiKey: key } }));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("save");
    setError(null);
    try {
      if (mode === "connect") {
        const r = await api<{ message: string }>("/api/v1/providers", { body: { provider: provider.id, name: name.trim() || "Primary", apiKey: key } });
        setKey("");
        await onDone(r.message);
      } else {
        await api(`/api/v1/providers/${connection!.id}`, { method: "PATCH", body: { apiKey: key } });
        setKey("");
        await onDone();
      }
    } catch (err) {
      setError(errMsg(err));
      setBusy(null);
    }
  };

  const valid = key.trim().length >= 8;
  return (
    <Dialog
      open
      onClose={close}
      title={mode === "connect" ? `Connect ${provider.label}` : `Rotate ${provider.label} key`}
      description={provider.credential.help}
      footer={
        <>
          <Button onClick={close} disabled={busy === "save"}>Cancel</Button>
          <Button onClick={test} loading={busy === "test"} disabled={!valid || !!busy} icon={<ShieldCheck size={14} />}>
            Test connection
          </Button>
          <Button type="submit" form="key-form" variant="primary" loading={busy === "save"} disabled={!valid || !!busy}>
            {mode === "connect" ? "Save & connect" : "Save new key"}
          </Button>
        </>
      }
    >
      <form id="key-form" onSubmit={save} className="space-y-4" autoComplete="off" noValidate>
        {mode === "connect" && <Field label="Connection name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} hint="Useful if you connect several organizations." />}
        <Field
          label={provider.credential.label}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={provider.credential.placeholder}
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setResult(null);
          }}
          data-autofocus
          hint={
            <a href={provider.credential.docsUrl} target="_blank" rel="noreferrer noopener" className="link inline-flex items-center gap-1">
              Where to find this key <ExternalLink size={11} aria-hidden />
            </a>
          }
        />
        {result && (
          <Notice tone={result.ok ? "success" : "danger"} title={result.ok ? "Connection verified" : "Connection failed"}>
            {result.message}
          </Notice>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <p className="flex items-start gap-2 text-xs text-muted">
          <ShieldCheck size={13} className="mt-0.5 shrink-0" aria-hidden />
          The key is validated with {provider.label}, encrypted with AES-256-GCM on the server and never returned to your browser. Only its last four characters are shown.
        </p>
      </form>
    </Dialog>
  );
}
