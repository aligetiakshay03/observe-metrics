"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { api, clearApiCache, useApi } from "@/lib/api-client";
import { fmtDate } from "@/lib/format";
import { Button, Card, ErrorState, Field, Notice } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useToast } from "@/components/providers/Toaster";
import { useMe } from "@/components/shell/MeProvider";
import { errMsg, fieldErrors, KV, ROLE_INFO, SettingsSkeleton } from "../_components/common";

interface WorkspaceData {
  workspace: { id: string; name: string; slug: string; companyName: string | null; currency: string; isDemo: boolean; createdAt: string };
  counts: { members: number; connections: number; apps: number; teams: number };
  role: string;
}

export default function WorkspaceSettings() {
  const { data, error, loading, refresh } = useApi<WorkspaceData>("/api/v1/workspace");
  const { can, refresh: refreshMe, me } = useMe();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (data) {
      setName(data.workspace.name);
      setCompany(data.workspace.companyName ?? "");
    }
  }, [data]);

  if (loading && !data) return <SettingsSkeleton rows={2} />;
  if (error && !data) return <div className="card"><ErrorState message={error.message} onRetry={refresh} /></div>;
  if (!data) return null;

  const editable = can("ADMIN");
  const dirty = name !== data.workspace.name || company !== (data.workspace.companyName ?? "");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await api("/api/v1/workspace", { method: "PATCH", body: { name: name.trim(), companyName: company.trim() || null } });
      await Promise.all([refresh(), refreshMe()]);
      toast({ tone: "success", title: "Workspace updated" });
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: "error", title: "Couldn't save workspace", body: errMsg(err) });
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    setLeaving(true);
    try {
      const members = await api<{ members: { id: string; isYou: boolean }[] }>("/api/v1/members");
      const mine = members.members.find((m) => m.isYou);
      if (!mine) throw new Error("Couldn't find your membership.");
      await api(`/api/v1/members/${mine.id}`, { method: "DELETE" });
      clearApiCache();
      window.location.assign("/dashboard");
    } catch (err) {
      toast({ tone: "error", title: "Couldn't leave workspace", body: errMsg(err) });
      setLeaving(false);
      setLeaveOpen(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {data.workspace.isDemo && (
          <Notice tone="warning" title="Demo workspace">
            This workspace holds generated sample data for Helix Labs, a fictional company. Reset or delete it from the Data tab.
          </Notice>
        )}
        <Card title="General" subtitle={editable ? "Name and company shown across ObserveMetrics." : "Only admins can change workspace details."}>
          <form onSubmit={save} className="space-y-4" noValidate>
            <Field label="Workspace name" value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} error={errors.name} required maxLength={60} />
            <Field label="Company name" value={company} onChange={(e) => setCompany(e.target.value)} disabled={!editable} error={errors.companyName} maxLength={100} hint="Optional." />
            {editable && (
              <div className="flex justify-end gap-2">
                <Button
                  disabled={!dirty || saving}
                  onClick={() => {
                    setName(data.workspace.name);
                    setCompany(data.workspace.companyName ?? "");
                    setErrors({});
                  }}
                >
                  Reset
                </Button>
                <Button type="submit" variant="primary" loading={saving} disabled={!dirty || name.trim().length < 2}>
                  Save changes
                </Button>
              </div>
            )}
          </form>
        </Card>
        {data.role !== "OWNER" && !me.user.isGuest && (
          <Card title="Leave workspace" subtitle="You'll lose access to this workspace's dashboards until someone invites you again.">
            <Button variant="secondary" icon={<LogOut size={14} />} onClick={() => setLeaveOpen(true)}>
              Leave {data.workspace.name}
            </Button>
          </Card>
        )}
      </div>
      <div className="space-y-4">
        <Card title="Details">
          <dl>
            <KV label="Slug"><span className="font-mono text-xs">{data.workspace.slug}</span></KV>
            <KV label="Created">{fmtDate(data.workspace.createdAt, { month: "short", day: "numeric", year: "numeric" })}</KV>
            <KV label="Currency">{data.workspace.currency}</KV>
            <KV label="Members">{data.counts.members}</KV>
            <KV label="Provider connections">{data.counts.connections}</KV>
            <KV label="Teams">{data.counts.teams}</KV>
            <KV label="Applications">{data.counts.apps}</KV>
          </dl>
        </Card>
        <Card title="Your role">
          <p className="text-sm font-medium capitalize">{data.role.toLowerCase()}</p>
          <p className="mt-1 text-xs text-muted">{ROLE_INFO[data.role]}</p>
        </Card>
      </div>
      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={leave}
        loading={leaving}
        danger
        title="Leave workspace?"
        body={`You will no longer have access to ${data.workspace.name}.`}
        confirmLabel="Leave workspace"
      />
    </div>
  );
}
