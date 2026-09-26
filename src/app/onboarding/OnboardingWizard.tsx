"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, Check, CheckCircle2, FlaskConical, KeyRound, Plug, Sparkles } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { Button, cx, Field, Notice, Spinner } from "@/components/ui/primitives";
import { api, ApiClientError, clearApiCache } from "@/lib/api-client";
import { providerColor } from "@/lib/format";
import type { ConnectionInfo, ProviderInfo } from "@/lib/types";

const STEPS = ["Welcome", "Workspace", "Role", "Connect", "Done"];
const ROLES = [
  { id: "Founder", body: "Company-wide spend and trends" },
  { id: "CTO", body: "Architecture, providers and reliability" },
  { id: "Engineering", body: "Models, latency and errors" },
  { id: "Finance", body: "Budgets, forecasts and exports" },
  { id: "Product", body: "Usage by feature and application" },
  { id: "Other", body: "A bit of everything" },
];

interface Props {
  userName: string;
  resume: { id: string; name: string; companyName: string | null } | null;
  canCancel: boolean;
}

export function OnboardingWizard({ userName, resume, canCancel }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(resume ? 3 : 0);
  const [name, setName] = useState(resume?.name ?? "");
  const [company, setCompany] = useState(resume?.companyName ?? "");
  const [role, setRole] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(resume?.id ?? null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState<ConnectionInfo[]>([]);
  const [skipped, setSkipped] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  // Resuming: make the pending workspace the active one.
  useEffect(() => {
    if (resume) void api("/api/v1/workspaces/switch", { body: { workspaceId: resume.id } }).catch(() => undefined);
  }, [resume]);
  useEffect(() => heading.current?.focus(), [step]);

  const go = (n: number) => {
    setError(null);
    setStep(n);
  };

  const saveWorkspace = async () => {
    const f: Record<string, string> = {};
    if (name.trim().length < 2) f.name = "Workspace name must be at least 2 characters.";
    setFields(f);
    if (Object.keys(f).length) return false;
    return true;
  };

  const createOrUpdate = async () => {
    setBusy(true);
    setError(null);
    try {
      if (workspaceId) {
        await api("/api/v1/workspace", { method: "PATCH", body: { name: name.trim(), companyName: company.trim() || null } });
      } else {
        const d = await api<{ workspace: { id: string } }>("/api/v1/workspaces", {
          body: { name: name.trim(), companyName: company.trim() || null, jobFunction: role },
        });
        setWorkspaceId(d.workspace.id);
        clearApiCache();
      }
      go(3);
    } catch (e) {
      const err = e as ApiClientError;
      setError(err.message);
      setFields(err.fields ?? {});
      if (err.fields?.name) setStep(1);
    } finally {
      setBusy(false);
    }
  };

  const finish = async (demo: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/workspace/onboarding", { body: {} });
      if (demo) await api("/api/v1/demo/start", { body: {} });
      clearApiCache();
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError((e as ApiClientError).message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center justify-between border-b border-border px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="ObserveMetrics home">
          <LogoMark size={22} />
          <span className="text-sm font-semibold">ObserveMetrics</span>
        </Link>
        {canCancel ? (
          <Link href="/dashboard" className="btn btn-ghost btn-sm">
            Cancel
          </Link>
        ) : (
          <span className="text-xs text-faint">Free during launch</span>
        )}
      </header>

      <main id="main" className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <ol className="mb-8 flex items-center gap-2" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2" aria-current={i === step ? "step" : undefined}>
              <span
                className={cx(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold",
                  i < step ? "bg-accent text-accent-fg" : i === step ? "border-2 border-accent text-accent" : "border border-border-strong text-faint",
                )}
              >
                {i < step ? <Check size={12} aria-hidden /> : i + 1}
              </span>
              <span className={cx("hidden text-xs sm:block", i === step ? "font-medium text-fg" : "text-muted")}>{s}</span>
              {i < STEPS.length - 1 && <span className={cx("h-px flex-1", i < step ? "bg-accent" : "bg-border")} aria-hidden />}
              <span className="sr-only">{i < step ? "(completed)" : i === step ? "(current)" : ""}</span>
            </li>
          ))}
        </ol>

        <div className="card p-5 sm:p-7">
          {error && (
            <div className="mb-5">
              <Notice tone="danger">{error}</Notice>
            </div>
          )}

          {step === 0 && (
            <section>
              <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
                Welcome to ObserveMetrics{userName ? `, ${userName.split(" ")[0]}` : ""}
              </h1>
              <p className="mt-2 text-sm text-muted">In a couple of minutes you&apos;ll have one place to see what your AI costs, how it performs, and where to optimize.</p>
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { icon: Plug, t: "Connect", b: "Sync OpenAI & Anthropic usage with an Admin key, or send events from your apps." },
                  { icon: Activity, t: "Observe", b: "Spend, tokens, latency and errors by provider, model, team and application." },
                  { icon: Sparkles, t: "Optimize", b: "Insights explain anomalies and estimate savings. Budgets alert before overruns." },
                ].map((c) => (
                  <div key={c.t} className="rounded-lg border border-border bg-surface-2/40 p-4">
                    <c.icon size={16} className="text-accent" aria-hidden />
                    <p className="mt-3 text-sm font-semibold">{c.t}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{c.b}</p>
                  </div>
                ))}
              </div>
              <div className="mt-7 flex justify-end">
                <Button variant="primary" onClick={() => go(1)}>
                  Get started <ArrowRight size={14} />
                </Button>
              </div>
            </section>
          )}

          {step === 1 && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (await saveWorkspace()) {
                  if (workspaceId) await createOrUpdate();
                  else go(2);
                }
              }}
              noValidate
            >
              <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">
                Create your workspace
              </h1>
              <p className="mt-1.5 text-sm text-muted">A workspace holds your providers, teams, applications and usage data. You can invite teammates later.</p>
              <div className="mt-6 space-y-4">
                <Field label="Workspace name" placeholder="e.g. Acme AI Platform" value={name} onChange={(e) => setName(e.target.value)} error={fields.name} autoFocus maxLength={60} />
                <Field label="Company name" placeholder="e.g. Acme Inc." value={company} onChange={(e) => setCompany(e.target.value)} error={fields.companyName} hint="Optional." maxLength={100} />
              </div>
              <div className="mt-7 flex justify-between">
                <Button onClick={() => go(0)} icon={<ArrowLeft size={14} />} variant="ghost">
                  Back
                </Button>
                <Button type="submit" variant="primary" loading={busy}>
                  Continue <ArrowRight size={14} />
                </Button>
              </div>
            </form>
          )}

          {step === 2 && (
            <section>
              <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">
                What best describes your role?
              </h1>
              <p className="mt-1.5 text-sm text-muted">We&apos;ll use this to tailor what you see first.</p>
              <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Role">
                {ROLES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={role === r.id}
                    onClick={() => setRole(r.id)}
                    className={cx(
                      "flex items-start justify-between gap-3 rounded-lg border p-3.5 text-left transition-colors",
                      role === r.id ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong hover:bg-surface-2/50",
                    )}
                  >
                    <span>
                      <span className="block text-sm font-medium">{r.id}</span>
                      <span className="block text-xs text-muted">{r.body}</span>
                    </span>
                    {role === r.id && <CheckCircle2 size={16} className="shrink-0 text-accent" aria-hidden />}
                  </button>
                ))}
              </div>
              <div className="mt-7 flex justify-between">
                <Button onClick={() => go(1)} icon={<ArrowLeft size={14} />} variant="ghost">
                  Back
                </Button>
                <Button variant="primary" onClick={createOrUpdate} loading={busy} disabled={!role}>
                  {workspaceId ? "Continue" : "Create workspace"} <ArrowRight size={14} />
                </Button>
              </div>
            </section>
          )}

          {step === 3 && (
            <ConnectStep
              headingRef={heading}
              connected={connected}
              onConnected={(c) => setConnected((list) => [...list.filter((x) => x.id !== c.id), c])}
              onBack={workspaceId && !resume ? () => go(1) : undefined}
              onContinue={() => go(4)}
              onSkipDemo={() => {
                setSkipped(true);
                go(4);
              }}
              onSkip={() => {
                setSkipped(true);
                go(4);
              }}
            />
          )}

          {step === 4 && (
            <section className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
                <CheckCircle2 size={24} aria-hidden />
              </div>
              <h1 ref={heading} tabIndex={-1} className="mt-4 text-2xl font-semibold tracking-tight outline-none">
                Your workspace is ready.
              </h1>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                {connected.length
                  ? `${connected.length} provider${connected.length === 1 ? "" : "s"} connected. Usage appears as syncs complete — OpenAI and Anthropic backfill the last 30 days.`
                  : "No provider connected yet. Explore a fully populated demo workspace, or connect a provider from Settings whenever you're ready."}
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Button variant={skipped && !connected.length ? "secondary" : "primary"} size="lg" onClick={() => finish(false)} loading={busy}>
                  Open dashboard
                </Button>
                {(skipped || !connected.length) && (
                  <Button variant="primary" size="lg" onClick={() => finish(true)} disabled={busy} icon={<FlaskConical size={15} />}>
                    Explore demo data
                  </Button>
                )}
              </div>
              <p className="mt-5 text-xs text-faint">Demo data lives in a separate, clearly labelled workspace — it never mixes with your real usage.</p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function ConnectStep({
  headingRef,
  connected,
  onConnected,
  onBack,
  onContinue,
  onSkip,
  onSkipDemo,
}: {
  headingRef: React.RefObject<HTMLHeadingElement>;
  connected: ConnectionInfo[];
  onConnected: (c: ConnectionInfo) => void;
  onBack?: () => void;
  onContinue: () => void;
  onSkip: () => void;
  onSkipDemo: () => void;
}) {
  const [catalog, setCatalog] = useState<ProviderInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState<"test" | "connect" | null>(null);
  const [syncing, setSyncing] = useState<Record<string, string>>({});

  const load = async () => {
    setLoadError(null);
    try {
      const d = await api<{ catalog: ProviderInfo[]; connections: ConnectionInfo[] }>("/api/v1/providers");
      setCatalog(d.catalog);
      d.connections.forEach(onConnected);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const provider = catalog?.find((p) => p.id === selected);

  const test = async () => {
    if (!provider || key.trim().length < 8) return setStatus({ tone: "danger", text: "Paste the full API key." });
    setBusy("test");
    setStatus(null);
    try {
      const r = await api<{ ok: boolean; message: string }>("/api/v1/providers/test", { body: { provider: provider.id, apiKey: key.trim() } });
      setStatus({ tone: r.ok ? "success" : "danger", text: r.message });
    } catch (e) {
      setStatus({ tone: "danger", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const connect = async () => {
    if (!provider || key.trim().length < 8) return setStatus({ tone: "danger", text: "Paste the full API key." });
    setBusy("connect");
    setStatus(null);
    try {
      const d = await api<{ connection: ConnectionInfo; message: string }>("/api/v1/providers", { body: { provider: provider.id, apiKey: key.trim() } });
      onConnected(d.connection);
      setKey("");
      setSelected(null);
      setStatus({ tone: "success", text: `${provider.label} connected. ${d.message}` });
      setSyncing((s) => ({ ...s, [d.connection.id]: "Syncing…" }));
      // Run the first sync now so the dashboard has data sooner.
      void api<{ outcome: { status: string; message: string } | null }>(`/api/v1/providers/${d.connection.id}/sync`, { body: {} })
        .then((r) => setSyncing((s) => ({ ...s, [d.connection.id]: r.outcome ? r.outcome.message : "Sync queued." })))
        .catch((e) => setSyncing((s) => ({ ...s, [d.connection.id]: (e as Error).message })));
    } catch (e) {
      setStatus({ tone: "danger", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">
        Connect a provider
      </h1>
      <p className="mt-1.5 text-sm text-muted">Keys are validated with the provider, encrypted server-side and never shown again. You can add more providers later.</p>

      {loadError && (
        <div className="mt-4">
          <Notice tone="danger" action={<Button size="sm" onClick={load}>Retry</Button>}>
            {loadError}
          </Notice>
        </div>
      )}
      {!catalog && !loadError && (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}

      {catalog && (
        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {catalog.map((p, i) => {
            const isConnected = connected.some((c) => c.provider === p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={selected === p.id}
                onClick={() => {
                  setSelected(selected === p.id ? null : p.id);
                  setStatus(null);
                  setKey("");
                }}
                className={cx(
                  "rounded-lg border p-3.5 text-left transition-colors",
                  selected === p.id ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong hover:bg-surface-2/50",
                )}
              >
                <span className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: providerColor(p.id, i) }} aria-hidden />
                    {p.label}
                  </span>
                  {isConnected ? <span className="badge badge-success">Connected</span> : p.capabilities.usage ? <span className="badge badge-neutral">Usage + costs sync</span> : <span className="badge badge-neutral">Via ingestion API</span>}
                </span>
                <span className="mt-1.5 block text-xs text-muted">{p.capabilities.usage ? `${p.credential.label} · ${p.credential.help}` : p.usageNote}</span>
              </button>
            );
          })}
        </div>
      )}

      {provider && (
        <div className="mt-4 rounded-lg border border-border bg-surface-2/40 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void connect();
            }}
            className="space-y-3"
          >
            <Field
              label={`${provider.label} ${provider.credential.label}`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={provider.credential.placeholder}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              hint={
                <>
                  {provider.credential.help}{" "}
                  <a href={provider.credential.docsUrl} target="_blank" rel="noreferrer noopener" className="link">
                    Provider docs
                  </a>
                </>
              }
              autoFocus
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={test} loading={busy === "test"} disabled={!!busy} icon={<KeyRound size={14} />}>
                Test connection
              </Button>
              <Button type="submit" variant="primary" loading={busy === "connect"} disabled={!!busy}>
                Connect {provider.label}
              </Button>
            </div>
          </form>
        </div>
      )}

      {status && (
        <div className="mt-4">
          <Notice tone={status.tone}>{status.text}</Notice>
        </div>
      )}

      {connected.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {connected.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <span className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-success" aria-hidden />
                <span className="font-medium capitalize">{catalog?.find((p) => p.id === c.provider)?.label ?? c.provider}</span>
                <span className="font-mono text-xs text-faint">{c.maskedKey}</span>
              </span>
              <span className="truncate text-xs text-muted">{syncing[c.id] ?? ""}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {onBack && (
            <Button variant="ghost" onClick={onBack} icon={<ArrowLeft size={14} />}>
              Back
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {connected.length ? (
            <Button variant="primary" onClick={onContinue}>
              Continue <ArrowRight size={14} />
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onSkip}>
                Skip for now
              </Button>
              <Button onClick={onSkipDemo} icon={<FlaskConical size={14} />}>
                Skip — explore demo data
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
