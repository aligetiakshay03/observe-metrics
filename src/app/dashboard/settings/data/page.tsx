"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, RotateCcw, Trash2 } from "lucide-react";
import { api, clearApiCache, useApi } from "@/lib/api-client";
import { fmtDateTime, fmtNumber, fmtRelative } from "@/lib/format";
import { Button, Card, cx, ErrorState, Field, Notice, Spinner } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog } from "@/components/ui/overlay";
import { ExportButton } from "@/components/dashboard/blocks";
import { useToast } from "@/components/providers/Toaster";
import { useMe } from "@/components/shell/MeProvider";
import { CopyField, errMsg, fieldErrors, KV } from "../_components/common";

export default function DataSettings() {
  const { me, can } = useMe();
  return (
    <div className="space-y-4">
      {can("ADMIN") ? <IngestionKeys /> : <Card title="Ingestion keys"><Notice tone="info">Only admins can manage ingestion keys.</Notice></Card>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DataSummary />
        <Card title="Export data" subtitle="CSV exports for the last 30 days. Use the export button on each dashboard page for other ranges and filters.">
          <ExportButton datasets={["usage", "costs", "models", "teams", "applications", "events"]} />
        </Card>
      </div>
      <DangerZone isDemo={!!me.workspace?.isDemo} />
    </div>
  );
}

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

function IngestionKeys() {
  const { me } = useMe();
  const { data, error, loading, refresh } = useApi<{ keys: KeyRow[] }>("/api/v1/ingestion-keys");
  const toast = useToast();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);
  const [revoking, setRevoking] = useState<KeyRow | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = me.workspace?.isDemo || me.user.isGuest;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setErrors({});
    try {
      const r = await api<{ name: string; key: string }>("/api/v1/ingestion-keys", { body: { name: name.trim() } });
      setCreated({ name: r.name, key: r.key });
      setName("");
      await refresh();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: "error", title: "Couldn't create key", body: errMsg(err) });
    } finally {
      setCreating(false);
    }
  };
  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await api(`/api/v1/ingestion-keys/${revoking.id}`, { method: "DELETE" });
      toast({ tone: "success", title: `Key “${revoking.name}” revoked`, body: "Requests using it are now rejected." });
      setRevoking(null);
      await refresh();
    } catch (err) {
      toast({ tone: "error", title: "Couldn't revoke key", body: errMsg(err) });
    } finally {
      setBusy(false);
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const curl = created
    ? `curl -X POST ${origin}/api/v1/events \\\n  -H "Authorization: Bearer ${created.key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"provider":"openai","model":"gpt-4.1-mini","application":"support-agent","team":"support","input_tokens":1200,"output_tokens":340,"latency_ms":1480,"status":"success"}'`
    : "";

  return (
    <Card title="Ingestion keys" subtitle="Authenticate applications sending usage events to POST /api/v1/events.">
      {locked ? (
        <Notice tone="warning">Ingestion keys can't be created in the demo workspace. Switch to your own workspace to instrument an application.</Notice>
      ) : (
        <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
          <Field className="flex-1" label="Key name" placeholder="e.g. production-api" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={60} />
          <Button type="submit" variant="primary" icon={<Plus size={14} />} loading={creating} disabled={!name.trim()} className={errors.name ? "sm:mb-6" : ""}>
            Create key
          </Button>
        </form>
      )}
      <div className="mt-4 overflow-x-auto">
        {loading && !data ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : error ? (
          <ErrorState compact message={error.message} onRetry={refresh} />
        ) : data && data.keys.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">No ingestion keys yet.</p>
        ) : (
          <table className="table">
            <caption className="sr-only">Ingestion keys</caption>
            <thead>
              <tr><th>Name</th><th>Key</th><th className="hidden md:table-cell">Created</th><th className="hidden sm:table-cell">Last used</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {data?.keys.map((k) => (
                <tr key={k.id} className={cx(k.revokedAt && "opacity-60")}>
                  <td className="font-medium">{k.name}</td>
                  <td className="font-mono text-xs text-muted">{k.prefix}…</td>
                  <td className="hidden text-muted md:table-cell">{fmtDateTime(k.createdAt)}</td>
                  <td className="hidden text-muted sm:table-cell">{k.lastUsedAt ? fmtRelative(k.lastUsedAt) : "Never"}</td>
                  <td>{k.revokedAt ? <span className="badge badge-neutral">Revoked</span> : <span className="badge badge-success">Active</span>}</td>
                  <td className="text-right">
                    {!k.revokedAt && <Button size="sm" variant="ghost" onClick={() => setRevoking(k)}>Revoke</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Dialog
        open={!!created}
        onClose={() => setCreated(null)}
        title={`Ingestion key “${created?.name ?? ""}” created`}
        description="Copy it now — for security it's stored only as a hash and won't be shown again."
        size="lg"
        footer={<Button variant="primary" onClick={() => setCreated(null)}>I&apos;ve saved the key</Button>}
      >
        {created && (
          <div className="space-y-4">
            <div>
              <p className="label flex items-center gap-1.5"><KeyRound size={13} aria-hidden /> Ingestion key</p>
              <CopyField value={created.key} label="Ingestion key" />
            </div>
            <div>
              <p className="label">Send a test event</p>
              <pre className="overflow-x-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-xs leading-relaxed">{curl}</pre>
              <p className="hint">Store the key in your application's secret manager or environment. Never ship it in client-side code.</p>
            </div>
          </div>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={revoke}
        loading={busy}
        danger
        title="Revoke ingestion key?"
        body={`Applications using “${revoking?.name ?? ""}” will immediately get 401 errors. This can't be undone.`}
        confirmLabel="Revoke key"
      />
    </Card>
  );
}

interface DataInfo {
  events: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  bySource: Record<string, number>;
}

const SOURCE_LABEL: Record<string, string> = { PROVIDER_SYNC: "Provider sync", INGEST_API: "Ingestion API", DEMO: "Demo data" };

function DataSummary() {
  const { data, error, loading, refresh } = useApi<DataInfo>("/api/v1/workspace/data");
  return (
    <Card title="Stored usage data">
      {loading && !data ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : error ? (
        <ErrorState compact message={error.message} onRetry={refresh} />
      ) : data ? (
        <dl>
          <KV label="Usage events">{fmtNumber(data.events)}</KV>
          <KV label="Oldest event">{data.firstEventAt ? fmtDateTime(data.firstEventAt) : "—"}</KV>
          <KV label="Newest event">{data.lastEventAt ? fmtDateTime(data.lastEventAt) : "—"}</KV>
          {Object.entries(data.bySource).map(([k, v]) => (
            <KV key={k} label={SOURCE_LABEL[k] ?? k}>{fmtNumber(v)} events</KV>
          ))}
        </dl>
      ) : null}
    </Card>
  );
}

function DangerZone({ isDemo }: { isDemo: boolean }) {
  const { me, can } = useMe();
  const toast = useToast();
  const router = useRouter();
  const [dialog, setDialog] = useState<"usage" | "workspace" | "reset" | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const wsName = me.workspace?.name ?? "";
  const close = () => {
    setDialog(null);
    setConfirm("");
    setErr(null);
  };

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (dialog === "usage") {
        const r = await api<{ deleted: number }>("/api/v1/workspace/data", { method: "DELETE", body: { confirm } });
        clearApiCache();
        toast({ tone: "success", title: "Usage data deleted", body: `${fmtNumber(r.deleted)} events removed.` });
        close();
        window.location.reload();
      } else if (dialog === "reset") {
        await api("/api/v1/demo/reset", { body: {} });
        clearApiCache();
        toast({ tone: "success", title: "Demo data regenerated" });
        close();
        window.location.reload();
      } else if (dialog === "workspace") {
        await api("/api/v1/workspace", { method: "DELETE", body: { confirm } });
        clearApiCache();
        close();
        window.location.assign("/dashboard");
      }
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (!can("ADMIN") && !isDemo) return null;
  const needs = dialog === "usage" ? "DELETE" : dialog === "workspace" ? wsName : null;
  return (
    <section className="card border-danger/30" aria-labelledby="danger-title">
      <header className="border-b border-border px-4 py-3">
        <h2 id="danger-title" className="card-title text-danger">Danger zone</h2>
        <p className="card-subtitle">These actions are permanent.</p>
      </header>
      <div className="divide-y divide-border">
        {isDemo && (
          <Row title="Reset demo data" body="Regenerate the Helix Labs sample dataset, insights, alerts and budgets for today's date.">
            <Button icon={<RotateCcw size={14} />} onClick={() => setDialog("reset")}>Reset demo</Button>
          </Row>
        )}
        {can("ADMIN") && (
          <Row title="Delete all usage data" body="Removes every usage event, aggregate, insight and alert. Providers, teams, budgets and members are kept.">
            <Button variant="danger" icon={<Trash2 size={14} />} onClick={() => setDialog("usage")}>Delete usage data</Button>
          </Row>
        )}
        {can("OWNER") && (
          <Row title="Delete workspace" body="Permanently deletes this workspace, its provider credentials and all of its data for every member.">
            <Button variant="danger" icon={<Trash2 size={14} />} onClick={() => setDialog("workspace")}>Delete workspace</Button>
          </Row>
        )}
      </div>
      <Dialog
        open={!!dialog}
        onClose={close}
        size="sm"
        title={dialog === "reset" ? "Reset demo data?" : dialog === "usage" ? "Delete all usage data?" : "Delete workspace?"}
        footer={
          <>
            <Button onClick={close} disabled={busy}>Cancel</Button>
            <Button variant={dialog === "reset" ? "primary" : "danger"} loading={busy} disabled={needs !== null && confirm !== needs} onClick={run}>
              {dialog === "reset" ? "Reset demo" : dialog === "usage" ? "Delete usage data" : "Delete workspace"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            {dialog === "reset"
              ? "The current demo dataset is replaced. This takes a few seconds."
              : dialog === "usage"
                ? "This can't be undone. Export anything you need first."
                : `This can't be undone. ${wsName} and everything in it will be deleted for all members.`}
          </p>
          {needs !== null && (
            <Field label={`Type ${needs} to confirm`} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" data-autofocus />
          )}
          {err && <Notice tone="danger">{err}</Notice>}
        </div>
      </Dialog>
    </section>
  );
}

function Row({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted">{body}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
