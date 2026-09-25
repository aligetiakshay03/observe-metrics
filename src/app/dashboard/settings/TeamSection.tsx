"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "../../providers";
import { StatusBadge } from "@/components/ui";

interface Member {
  id: string;
  role: string;
  team: string | null;
  user: { id: string; name: string | null; email: string };
}

interface Invite {
  id: string;
  email: string;
  role: string;
  team: string | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : name.slice(0, 2)).toUpperCase();
}

export function TeamSection() {
  const { me, refresh } = useSession();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [team, setTeam] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/v1/members", { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setMembers(json.data.members);
      setInvites(json.data.invites);
    }
  }, []);

  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  const isAdmin = me?.activeOrg?.role === "ADMIN";
  const limits = me?.activeOrg?.limits;
  const canInvite = limits ? limits.maxMembers === -1 || (members?.length ?? 0) < limits.maxMembers : false;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, team: team || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Could not send invite");
      setNotice("Invitation sent" + (json.data.inviteUrl ? " — link: " + json.data.inviteUrl : ""));
      setEmail("");
      await load();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updateMember(id: string, patch: { role?: string; team?: string | null }) {
    await fetch("/api/v1/members/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  }

  async function removeMember(id: string) {
    if (!confirm("Remove this member from the organization?")) return;
    await fetch("/api/v1/members/" + id, { method: "DELETE" });
    await load();
  }

  if (members === null) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface h-64" />
        <div className="surface h-64" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="surface">
        <div className="border-b px-4 py-3">
          <h3 className="text-[13px] font-semibold">Members ({members.length})</h3>
        </div>
        <div className="divide-y">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                  {initials(m.user.name ?? m.user.email)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{m.user.name ?? m.user.email}</div>
                  <div className="truncate text-xs muted">{m.user.email}</div>
                </div>
              </div>
              {isAdmin ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <select className="input" style={{ width: 96, height: 28, fontSize: 12 }} value={m.role} onChange={(e) => updateMember(m.id, { role: e.target.value })}>
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                  </select>
                  <input
                    className="input"
                    style={{ width: 104, height: 28, fontSize: 12 }}
                    placeholder="Team"
                    defaultValue={m.team ?? ""}
                    onBlur={(e) => {
                      const v = (e.target as HTMLInputElement).value || null;
                      if (v !== (m.team ?? null)) void updateMember(m.id, { team: v });
                    }}
                  />
                  <button onClick={() => removeMember(m.id)} className="btn btn-danger btn-sm">✕</button>
                </div>
              ) : (
                <StatusBadge status={m.role === "ADMIN" ? "accent" : "neutral"}>{m.role}</StatusBadge>
              )}
            </div>
          ))}
        </div>

        {invites.length > 0 && (
          <div className="px-4 py-3">
            <h4 className="label mb-2">Pending invites</h4>
            <div className="space-y-1.5">
              {invites.map((i) => (
                <div key={i.id} className="flex items-center justify-between text-[13px]">
                  <span className="muted">{i.email}</span>
                  <StatusBadge status="neutral">{i.role}</StatusBadge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="surface p-4">
        <h3 className="text-[14px] font-semibold">Invite a teammate</h3>
        <form onSubmit={invite} className="mt-3.5 space-y-3.5">
          <div>
            <label className="label mb-1.5 block">Email</label>
            <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label mb-1.5 block">Role</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div>
              <label className="label mb-1.5 block">Team</label>
              <input className="input" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Engineering" />
            </div>
          </div>
          <p className="text-xs muted">Team tags power the Teams page, team budgets and cost allocation.</p>
          {error && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>}
          {notice && <p className="break-all text-[13px]" style={{ color: "var(--success)" }}>{notice}</p>}
          <button type="submit" disabled={busy || !isAdmin || !canInvite} className="btn btn-primary w-full">
            {busy ? "Sending…" : !canInvite ? "Member limit reached — upgrade plan" : "Send invitation"}
          </button>
        </form>
      </div>
    </div>
  );
}
