"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel, Spinner } from "@/components/ui";
import { useSession } from "../../providers";

interface Connection {
  id: string;
  provider: string;
  name: string;
  keyLast4: string;
  status: string;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

const PROVIDER_META: Record<string, { label: string; hint: string }> = {
  OPENAI: { label: "OpenAI", hint: "OpenAI dashboard → API keys (sk-…). Usage API needs a project admin key." },
  ANTHROPIC: { label: "Anthropic", hint: "Anthropic Console → Settings → Admin API keys (sk-ant-admin…)." },
  GOOGLE: { label: "Google Gemini", hint: "Google Cloud service account JSON with billing export, or AI Studio key (verification only)." },
  MISTRAL: { label: "Mistral", hint: "Mistral La Plateforme console → API keys." },
  DEMO: { label: "Demo (simulated)", hint: "No key needed — generates realistic simulated usage." },
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
        body: JSON.stringify({ provider, apiKey, name: name || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Could not connect provider");
      setApiKey("");
      setName("");
      setNotice("Provider connected. First sync runs within minutes — or click Sync now.");
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
    if (res.ok) {
      setNotice("Sync complete — " + (json.data?.ingested ?? 0) + " records ingested.");
    } else {
      setError(json.error?.message ?? "Sync failed");
    }
    await load();
  }

  async function rekey(id: string, newKey: string) {
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

  if (connections === null) return <Spinner />;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        {(connections ?? []).map((c) => (
          <Panel key={c.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  {PROVIDER_META[c.provider]?.label ?? c.provider}
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: c.status === "ACTIVE" ? "#10b981" : c.status === "ERROR" ? "#ef4444" : "#9ca3af" }}
                    title={c.status}
                  />
                  <span className="text-xs muted">•••• {c.keyLast4}</span>
                </div>
                <div className="mt-0.5 text-xs muted">
                  {c.name} · last synced{" "}
                  {c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString() : "never"}
                </div>
                {c.lastSyncError && <p className="mt-1 text-xs text-red-500">{c.lastSyncError}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs">
                <button onClick={() => syncNow(c.id)} className="btn btn-outline px-2 py-1 text-xs">Sync now</button>
                <button
                  onClick={() => {
                    const key = prompt("Enter the new API key for " + (PROVIDER_META[c.provider]?.label ?? c.provider));
                    if (key) void rekey(c.id, key);
                  }}
                  className="btn btn-outline px-2 py-1 text-xs"
                >
                  Re-enter key
                </button>
                <button onClick={() => remove(c.id)} className="text-muted hover:text-red-500">✕</button>
              </div>
            </div>
          </Panel>
        ))}

        {connections.length === 0 && (
          <Panel>
            <p className="py-8 text-center text-sm muted">
              No providers connected yet. Add your first connection on the right — or try the Demo sandbox, which generates simulated data with no key.
            </p>
          </Panel>
        )}
      </div>

      <div className="space-y-4">
        <Panel title="Connect a provider">
          <form onSubmit={connect} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm">Provider</label>
              <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
                {Object.entries(PROVIDER_META).map(([value, meta]) => (
                  <option key={value} value={value}>{meta.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs muted">{PROVIDER_META[provider]?.hint}</p>
            </div>
            {provider !== "DEMO" && (
              <>
                <div>
                  <label className="mb-1 block text-sm">API key</label>
                  <input
                    className="input font-mono text-xs"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-…"
                    required
                  />
                  <p className="mt-1 text-xs muted">Encrypted with AES-256-GCM at rest. Never shown again after saving.</p>
                </div>
                <div>
                  <label className="mb-1 block text-sm">Label (optional)</label>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production account" />
                </div>
              </>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            {notice && <p className="text-sm" style={{ color: "#10b981" }}>{notice}</p>}
            <button type="submit" disabled={busy || !canAdd} className="btn btn-primary w-full disabled:opacity-60">
              {busy ? "Verifying & saving…" : canAdd ? "Connect" : "Provider limit reached — upgrade plan"}
            </button>
          </form>
        </Panel>

        <Panel title="Sync all connections">
          <p className="text-sm muted">
            A background worker syncs every connection every 6 hours. You can also trigger a manual sync.
          </p>
          <button onClick={() => syncNow()} className="btn btn-outline mt-3 w-full">Sync all now</button>
        </Panel>
      </div>
    </div>
  );
}
