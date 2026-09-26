"use client";

import { useEffect, useState } from "react";
import { Lock, LogOut, ShieldCheck } from "lucide-react";
import { api, useApi } from "@/lib/api-client";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { Button, Card, ErrorState, Field, Notice, Spinner } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useToast } from "@/components/providers/Toaster";
import { useMe } from "@/components/shell/MeProvider";
import { errMsg, fieldErrors } from "../_components/common";

export default function SecuritySettings() {
  const { me, can } = useMe();
  if (me.user.isGuest) {
    return (
      <div className="space-y-4">
        <Notice tone="warning" title="Guest session">You're exploring the demo without an account. Create a free account to set a password and manage sessions.</Notice>
        <ProtectionCard />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ProfileCard />
      <PasswordCard />
      <SessionsCard />
      <ProtectionCard />
      <div className="xl:col-span-2">{can("ADMIN") ? <AuditLog /> : <Card title="Audit log"><Notice tone="info">Only workspace admins and owners can view the audit log.</Notice></Card>}</div>
    </div>
  );
}

function ProfileCard() {
  const { me, refresh } = useMe();
  const toast = useToast();
  const [name, setName] = useState(me.user.name ?? "");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await api("/api/v1/me", { method: "PATCH", body: { name: name.trim() } });
      await refresh();
      toast({ tone: "success", title: "Profile updated" });
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: "error", title: "Couldn't update profile", body: errMsg(err) });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card title="Profile" subtitle={me.user.email}>
      <form onSubmit={save} className="space-y-3" noValidate>
        <Field label="Full name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={100} autoComplete="name" />
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={saving} disabled={!name.trim() || name.trim() === me.user.name}>Save</Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (form.newPassword !== form.confirmPassword) local.confirmPassword = "Passwords don't match.";
    if (Object.keys(local).length) return setErrors(local);
    setSaving(true);
    setErrors({});
    try {
      await api("/api/v1/me/password", { body: form });
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({ tone: "success", title: "Password changed", body: "Your other sessions were signed out." });
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: "error", title: "Couldn't change password", body: errMsg(err) });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card title="Password" subtitle="Changing your password signs out every other session.">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <Field label="Current password" type="password" autoComplete="current-password" value={form.currentPassword} onChange={set("currentPassword")} error={errors.currentPassword} hint="Leave empty if you signed up with Google and haven't set a password." />
        <Field label="New password" type="password" autoComplete="new-password" value={form.newPassword} onChange={set("newPassword")} error={errors.newPassword} hint="At least 10 characters, with a letter and a number." />
        <Field label="Confirm new password" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set("confirmPassword")} error={errors.confirmPassword} />
        <div className="flex justify-end">
          <Button type="submit" variant="primary" icon={<Lock size={14} />} loading={saving} disabled={!form.newPassword || !form.confirmPassword}>Change password</Button>
        </div>
      </form>
    </Card>
  );
}

interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  remember: boolean;
  current: boolean;
}

function summarizeUA(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /curl\//.test(ua) ? "curl" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

function SessionsCard() {
  const { data, error, loading, refresh } = useApi<{ sessions: SessionRow[] }>("/api/v1/me/sessions");
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const others = data?.sessions.filter((s) => !s.current).length ?? 0;
  const revoke = async () => {
    setBusy(true);
    try {
      await api("/api/v1/me/sessions", { method: "DELETE" });
      toast({ tone: "success", title: "Other sessions signed out" });
      setConfirm(false);
      await refresh();
    } catch (e) {
      toast({ tone: "error", title: "Couldn't sign out sessions", body: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      title="Active sessions"
      subtitle="Devices currently signed in to your account."
      actions={others > 0 ? <Button size="sm" icon={<LogOut size={13} />} onClick={() => setConfirm(true)}>Sign out others</Button> : undefined}
    >
      {loading && !data && <div className="flex justify-center py-6"><Spinner /></div>}
      {error && <ErrorState compact message={error.message} onRetry={refresh} />}
      {data && (
        <ul className="divide-y divide-border">
          {data.sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {summarizeUA(s.userAgent)}
                  {s.current && <span className="ml-2 badge badge-success">This device</span>}
                </p>
                <p className="text-xs text-muted">
                  {s.ip ?? "Unknown IP"} · signed in {fmtRelative(s.createdAt)}{s.remember ? " · remembered" : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs text-faint">Active {fmtRelative(s.lastSeenAt)}</span>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={revoke}
        loading={busy}
        title="Sign out other sessions?"
        body={`${others} other ${others === 1 ? "session" : "sessions"} will be signed out immediately. This device stays signed in.`}
        confirmLabel="Sign out others"
      />
    </Card>
  );
}

function ProtectionCard() {
  const items = [
    "Provider API keys are encrypted with AES-256-GCM on the server and bound to this workspace. They are never returned to the browser — only the last four characters are displayed.",
    "Credentials are only decrypted in memory while testing a connection or syncing, and secret patterns are redacted from server logs.",
    "Sessions, password-reset links and ingestion keys are stored as SHA-256 hashes; passwords are hashed with bcrypt.",
    "Every request is authorized on the server against your workspace role (owner, admin, member, viewer). Workspace data is isolated per workspace.",
    "State-changing requests must come from this site (same-origin check + SameSite cookies), and sign-in is rate limited.",
  ];
  return (
    <Card title="How your data is protected">
      <ul className="space-y-2.5">
        {items.map((t) => (
          <li key={t} className="flex gap-2.5 text-sm text-muted">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" aria-hidden />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

interface AuditEntry {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  actor: string;
}

function humanize(action: string): string {
  const [obj, verb] = action.split(".");
  const noun = (obj ?? "").replace(/_/g, " ");
  const v = (verb ?? "").replace(/_/g, " ");
  const s = `${noun} ${v}`.trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function details(m: Record<string, unknown> | null): string {
  if (!m) return "—";
  return Object.entries(m)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ") || "—";
}

function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (c: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ entries: AuditEntry[]; nextCursor: string | null }>(`/api/v1/audit${c ? `?cursor=${encodeURIComponent(c)}` : ""}`);
      setEntries((prev) => (c ? [...prev, ...r.entries] : r.entries));
      setCursor(r.nextCursor);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load(null);
  }, []);

  return (
    <Card title="Audit log" subtitle="Security-relevant changes in this workspace." bodyClassName="pb-0">
      {error && !entries.length ? (
        <ErrorState compact message={error} onRetry={() => void load(null)} />
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <caption className="sr-only">Audit log</caption>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th className="hidden md:table-cell">Target</th>
                <th className="hidden lg:table-cell">Details</th>
                <th className="hidden sm:table-cell">IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="text-muted" title={new Date(e.createdAt).toISOString()}>{fmtDateTime(e.createdAt)}</td>
                  <td className="max-w-[180px] truncate">{e.actor}</td>
                  <td className="font-medium">{humanize(e.action)}</td>
                  <td className="hidden text-muted md:table-cell">{e.targetType ? e.targetType.replace(/_/g, " ") : "—"}</td>
                  <td className="hidden max-w-[360px] truncate text-xs text-muted lg:table-cell" title={details(e.metadata)}>{details(e.metadata)}</td>
                  <td className="hidden font-mono text-xs text-muted sm:table-cell">{e.ip ?? "—"}</td>
                </tr>
              ))}
              {!loading && entries.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-sm text-muted">No audit events yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-center border-t border-border py-2.5">
        {loading ? <Spinner /> : cursor ? <Button size="sm" variant="ghost" onClick={() => void load(cursor)}>Load more</Button> : entries.length > 0 ? <span className="text-xs text-faint">End of log</span> : null}
      </div>
    </Card>
  );
}
