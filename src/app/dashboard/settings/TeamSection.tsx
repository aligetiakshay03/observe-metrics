"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel, Spinner } from "@/components/ui";
import { useSession } from "../../providers";

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
  status: string;
  expiresAt: string;
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

  if (members === null) return <Spinner />;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title={"Members (" + members.length + ")"}>
        <div className="space-y-1">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 border-t py-2.5 first:border-0">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{m.user.name ?? m.user.email}</div>
                <div className="truncate text-xs muted">{m.user.email}</div>
              </div>
              {isAdmin ? (
                <div className="flex shrink-0 items-center gap-2">
                  <select
                    className="input w-auto py-1 text-xs"
                    value={m.role}
                    onChange={(e) => updateMember(m.id, { role: e.target.value })}
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                  </select>
                  <input
                    className="input w-24 py-1 text-xs"
                    placeholder="Team"
                    defaultValue={m.team ?? ""}
                    onBlur={(e) => {
                      if ((e.target as HTMLInputElement).value !== (m.team ?? "")) {
                        void updateMember(m.id, { team: (e.target as HTMLInputElement).value || null });
                      }
                    }}
                  />
                  <button onClick={() => removeMember(m.id)} className="muted px-1 hover:text-red-500">✕</button>
                </div>
              ) : (
                <span className="badge">{m.role}</span>
              )}
            </div>
          ))}
        </div>

        {invites.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold muted uppercase">Pending invites</h3>
            {invites.map((i) => (
              <div key={i.id} className="flex items-center justify-between border-t py-2 text-sm first:border-0">
                <span>{i.email}</span>
                <span className="badge">{i.role}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Invite a teammate">
        <form onSubmit={invite} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm">Email</label>
            <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm">Role</label>
              <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm">Team (optional)</label>
              <input className="input" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Engineering" />
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {notice && <p className="break-all text-sm" style={{ color: "#10b981" }}>{notice}</p>}
          <button type="submit" disabled={busy || !isAdmin || !canInvite} className="btn btn-primary w-full disabled:opacity-60">
            {busy ? "Sending…" : !canInvite ? "Member limit reached — upgrade plan" : "Send invitation"}
          </button>
          <p className="text-xs muted">Team tags feed the cost-by-team analytics and team budgets.</p>
        </form>
      </Panel>
    </div>
  );
}
