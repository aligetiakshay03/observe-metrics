"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "../../providers";
import { StatusBadge, ProviderBadge, PROVIDER_LABELS } from "@/components/ui";
import { IconPlug } from "@/components/icons";

interface Connection {
  id: string;
  provider: string;
  name: string;
  keyLast4: string;
  status: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

const HINTS: Record<string, string> = {
  OPENAI: "OpenAI dashboard → API keys (sk-…). Usage API requires a project admin key.",
  ANTHROPIC: "Anthropic Console → Settings → Admin API keys (sk-ant-admin…).",
  GOOGLE: "Google Cloud service account JSON with billing export, or AI Studio key (verification only).",
  MISTRAL: "Mistral La Plateforme console → API keys.",
  DEMO: "No key needed — generates realistic simulated usage.",
};

export function ProvidersSection() {
  const { me, refresh } = useSession();
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [provider, setProvider] = useState("OPENAI");
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/providers", { cache: "no-store" });
    if (res.ok) setConnections((await res.json()).data.connections);
  }, []);

  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  const limits = me?.activeOrg?.limits;
  const canAdd = limits ? limits.maxProviders === -1 || (connections?.length ?? 0) < limits.maxProviders : false;

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: apiKey || "demo", name: name || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Could not connect provider");
      setApiKey("");
      setName("");
      setNotice("Provider connected. First sync runs within minutes — or sync now.");
      await load();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(id?: string) {
    setNotice(null);
    setError(null);
    const res = await fetch(id ? "/api/v1/providers/" + id + "/sync" : "/api/v1/providers/sync", { method: "POST" });
    const json = await res.json();
    if (res.ok) setNotice("Sync complete — " + (json.data?.ingested ?? 0) + " records ingested.");
    else setError(json.error?.message ?? "Sync failed");
    await load();
  }

  async function rekey(id: string) {
    const newKey = prompt("Enter the new API key");
    if (!newKey) return;
    const res = await fetch("/api/v1/providers/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: newKey }),
    });
    const json = await res.json();
    if (!res.ok) setError(json.error?.message ?? "Could not update key");
    else setNotice("API key updated.");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this connection? Historical data is kept but syncing stops.")) return;
    await fetch("/api/v1/providers/" + id, { method: "DELETE" });
    await load();
    await refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        {(connections ?? []).map((c) => (
          <div key={c.id} className="surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <ProviderBadge provider={c.provider} />
                  <StatusBadge status={c.status === "ACTIVE" ? "success" : c.status === "ERROR" ? "danger" : "neutral"}>
                    <span className={"dot " + (c.status === "ACTIVE" ? "dot-success" : c.status === "ERROR" ? "dot-danger" : "dot-muted")} />
                    {c.status === "ACTIVE" ? "Connected" : c.status === "ERROR" ? "Error" : "Disabled"}
                  </StatusBadge>
                </div>
                <p className="mt-1.5 text-xs muted">
                  {c.name} · key ••••{c.keyLast4} ·{" "}
                  {c.lastSyncedAt ? "synced " + new Date(c.lastSyncedAt).toLocaleString() : "never synced"}
                </p>
                {c.lastSyncError && <p className="mt-1 text-xs" style={{ color: "var(--danger)" }}>{c.lastSyncError}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button onClick={() => syncNow(c.id)} className="btn btn-secondary btn-sm">Sync</button>
                <button onClick={() => rekey(c.id)} className="btn btn-ghost btn-sm">Key</button>
                <button onClick={() => remove(c.id)} className="btn btn-danger btn-sm">Remove</button>
              </div>
            </div>
          </div>
        ))}

        {connections !== null && connections.length === 0 && (
          <div className="surface flex items-center gap-3 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border" style={{ background: "var(--surface-2)" }}>
              <IconPlug size={16} className="muted" />
            </span>
            <p className="text-[13px] muted">No providers connected. Add one on the right — or connect the Demo sandbox (no key needed).</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="surface p-4">
          <h3 className="text-[14px] font-semibold">Connect a provider</h3>
          <form onSubmit={connect} className="mt-3.5 space-y-3.5">
            <div>
              <label className="label mb-1.5 block">Provider</label>
              <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
                {Object.entries(PROVIDER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs muted">{HINTS[provider]}</p>
            </div>
            {provider !== "DEMO" && (
              <>
                <div>
                  <label className="label mb-1.5 block">API key</label>
                  <input
                    className="input mono"
                    style={{ fontSize: 12 }}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-…"
                    required
                  />
                  <p className="mt-1.5 text-xs muted">Encrypted with AES-256-GCM at rest. Never shown again after saving.</p>
                </div>
                <div>
                  <label className="label mb-1.5 block">Label (optional)</label>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production account" />
                </div>
              </>
            )}
            {error && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>}
            {notice && <p className="text-[13px]" style={{ color: "var(--success)" }}>{notice}</p>}
            <button type="submit" disabled={busy || !canAdd} className="btn btn-primary w-full">
              {busy ? "Verifying…" : canAdd ? "Connect" : "Provider limit reached — upgrade plan"}
            </button>
          </form>
        </div>

        <div className="surface flex items-center justify-between gap-3 p-4">
          <p className="text-[13px] muted">A background worker syncs every connection every 6 hours.</p>
          <button onClick={() => syncNow()} className="btn btn-secondary btn-sm shrink-0">Sync all</button>
        </div>
      </div>
    </div>
  );
}
