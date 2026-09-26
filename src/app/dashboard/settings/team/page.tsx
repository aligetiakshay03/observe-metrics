"use client";

import { useState } from "react";
import { MailPlus, Trash2, X } from "lucide-react";
import { api, useApi } from "@/lib/api-client";
import { fmtDate, fmtRelative, initials } from "@/lib/format";
import type { Lookups, Role } from "@/lib/types";
import { Button, Card, ErrorState, Field, Notice, SelectField } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useToast } from "@/components/providers/Toaster";
import { useMe } from "@/components/shell/MeProvider";
import { CopyField, errMsg, fieldErrors, ROLE_INFO, SettingsSkeleton } from "../_components/common";

interface Member {
  id: string;
  role: Role;
  jobFunction: string | null;
  team: { id: string; name: string } | null;
  joinedAt: string;
  isYou: boolean;
  user: { name: string | null; email: string; lastLoginAt: string | null };
}
interface Invite {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  createdAt: string;
}
interface MembersData {
  members: Member[];
  invites: Invite[];
  role: Role;
}

const ROLES: Role[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];

export default function TeamSettings() {
  const { data, error, loading, refresh } = useApi<MembersData>("/api/v1/members");
  const { data: teamsData } = useApi<{ lookups: Lookups }>("/api/v1/analytics/teams?range=7d");
  const { me, can } = useMe();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [inviteLink, setInviteLink] = useState<{ email: string; link: string } | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  if (loading && !data) return <SettingsSkeleton rows={2} />;
  if (error && !data) return <div className="card"><ErrorState message={error.message} onRetry={refresh} /></div>;
  if (!data) return null;

  const isAdmin = can("ADMIN");
  const isOwner = data.role === "OWNER";
  const locked = me.workspace?.isDemo || me.user.isGuest;
  const teams = teamsData?.lookups.teams ?? [];

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setInviteErrors({});
    try {
      const r = await api<{ invite: { email: string }; emailed: boolean; link: string | null }>("/api/v1/members", { body: { email: email.trim(), role } });
      if (r.link) setInviteLink({ email: r.invite.email, link: r.link });
      toast({ tone: "success", title: r.emailed ? `Invitation emailed to ${r.invite.email}` : `Invitation created for ${r.invite.email}` });
      setEmail("");
      await refresh();
    } catch (err) {
      setInviteErrors(fieldErrors(err));
      toast({ tone: "error", title: "Couldn't send invitation", body: errMsg(err) });
    } finally {
      setInviting(false);
    }
  };

  const update = async (m: Member, body: { role?: Role; teamId?: string | null }) => {
    setBusyRow(m.id);
    try {
      await api(`/api/v1/members/${m.id}`, { method: "PATCH", body });
      toast({ tone: "success", title: body.role ? `Role changed to ${body.role.toLowerCase()}` : "Team updated" });
      await refresh();
    } catch (err) {
      toast({ tone: "error", title: "Couldn't update member", body: errMsg(err) });
    } finally {
      setBusyRow(null);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusyRow(removing.id);
    try {
      await api(`/api/v1/members/${removing.id}`, { method: "DELETE" });
      toast({ tone: "success", title: "Member removed" });
      setRemoving(null);
      await refresh();
    } catch (err) {
      toast({ tone: "error", title: "Couldn't remove member", body: errMsg(err) });
    } finally {
      setBusyRow(null);
    }
  };

  const revoke = async (i: Invite) => {
    setBusyRow(i.id);
    try {
      await api(`/api/v1/invites/${i.id}`, { method: "DELETE" });
      toast({ tone: "success", title: `Invitation for ${i.email} revoked` });
      await refresh();
    } catch (err) {
      toast({ tone: "error", title: "Couldn't revoke invitation", body: errMsg(err) });
    } finally {
      setBusyRow(null);
    }
  };

  // Admins manage members/viewers; only owners can touch admin/owner roles.
  const roleOptions = (m: Member) => ROLES.filter((r) => isOwner || (r !== "OWNER" && r !== "ADMIN") || r === m.role);
  const canEdit = (m: Member) => isAdmin && !m.isYou && (isOwner || (m.role !== "OWNER" && m.role !== "ADMIN"));

  return (
    <div className="space-y-4">
      {isAdmin && (
        <Card title="Invite teammates" subtitle="Invitations expire after 7 days and must be accepted with the invited email address.">
          {locked ? (
            <Notice tone="warning">Invitations are disabled in the demo workspace. Switch to your own workspace to invite your team.</Notice>
          ) : (
            <form onSubmit={invite} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end" noValidate>
              <Field label="Email" type="email" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} error={inviteErrors.email} autoComplete="off" />
              <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)} error={inviteErrors.role}>
                {(isOwner ? ["ADMIN", "MEMBER", "VIEWER"] : ["MEMBER", "VIEWER"]).map((r) => (
                  <option key={r} value={r}>{r[0] + r.slice(1).toLowerCase()}</option>
                ))}
              </SelectField>
              <Button type="submit" variant="primary" icon={<MailPlus size={14} />} loading={inviting} disabled={!email.trim()} className={inviteErrors.email || inviteErrors.role ? "sm:mb-6" : ""}>
                Send invite
              </Button>
            </form>
          )}
          {inviteLink && (
            <div className="mt-4 space-y-2">
              <Notice tone="info" title="Email delivery isn't configured on this deployment" action={<Button size="sm" variant="ghost" aria-label="Dismiss" icon={<X size={14} />} onClick={() => setInviteLink(null)} />}>
                Share this link with {inviteLink.email}. It&apos;s shown only once.
              </Notice>
              <CopyField value={inviteLink.link} label="Invitation link" />
            </div>
          )}
        </Card>
      )}

      <Card title="Members" subtitle={`${data.members.length} ${data.members.length === 1 ? "person has" : "people have"} access to this workspace`} bodyClassName="pb-0">
        <div className="-mx-0 overflow-x-auto">
          <table className="table">
            <caption className="sr-only">Workspace members</caption>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th className="hidden md:table-cell">Team</th>
                <th className="hidden lg:table-cell">Joined</th>
                <th className="hidden lg:table-cell">Last sign-in</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-2xs font-semibold" aria-hidden>{initials(m.user.name, m.user.email)}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{m.user.name ?? m.user.email}{m.isYou && <span className="ml-1.5 badge badge-neutral">You</span>}</span>
                        <span className="block truncate text-xs text-muted">{m.user.email}</span>
                      </span>
                    </div>
                  </td>
                  <td>
                    {canEdit(m) ? (
                      <select
                        className="select h-8 w-[120px] py-0 text-xs"
                        value={m.role}
                        disabled={busyRow === m.id}
                        onChange={(e) => void update(m, { role: e.target.value as Role })}
                        aria-label={`Role for ${m.user.email}`}
                      >
                        {roleOptions(m).map((r) => <option key={r} value={r}>{r[0] + r.slice(1).toLowerCase()}</option>)}
                      </select>
                    ) : (
                      <span className="text-sm capitalize">{m.role.toLowerCase()}</span>
                    )}
                  </td>
                  <td className="hidden md:table-cell">
                    {isAdmin ? (
                      <select
                        className="select h-8 w-[150px] py-0 text-xs"
                        value={m.team?.id ?? ""}
                        disabled={busyRow === m.id}
                        onChange={(e) => void update(m, { teamId: e.target.value || null })}
                        aria-label={`Team for ${m.user.email}`}
                      >
                        <option value="">No team</option>
                        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    ) : (
                      <span className="text-muted">{m.team?.name ?? "—"}</span>
                    )}
                  </td>
                  <td className="hidden text-muted lg:table-cell">{fmtDate(m.joinedAt, { month: "short", day: "numeric", year: "numeric" })}</td>
                  <td className="hidden text-muted lg:table-cell">{fmtRelative(m.user.lastLoginAt)}</td>
                  <td className="text-right">
                    {canEdit(m) && (
                      <Button size="sm" variant="ghost" aria-label={`Remove ${m.user.email}`} icon={<Trash2 size={13} />} onClick={() => setRemoving(m)} disabled={busyRow === m.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {isAdmin && data.invites.length > 0 && (
        <Card title="Pending invitations" bodyClassName="pb-0">
          <table className="table">
            <caption className="sr-only">Pending invitations</caption>
            <thead>
              <tr><th>Email</th><th>Role</th><th className="hidden sm:table-cell">Expires</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {data.invites.map((i) => (
                <tr key={i.id}>
                  <td className="font-medium">{i.email}</td>
                  <td className="capitalize">{i.role.toLowerCase()}</td>
                  <td className="hidden text-muted sm:table-cell">{fmtRelative(i.expiresAt)}</td>
                  <td className="text-right">
                    <Button size="sm" variant="ghost" loading={busyRow === i.id} onClick={() => void revoke(i)}>Revoke</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="Roles">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r} className="rounded-md border border-border p-3">
              <dt className="text-sm font-medium capitalize">{r.toLowerCase()}</dt>
              <dd className="mt-0.5 text-xs text-muted">{ROLE_INFO[r]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">Permissions are enforced on the server for every request. Only owners can grant or revoke the admin and owner roles.</p>
      </Card>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={!!removing && busyRow === removing.id}
        danger
        title="Remove member?"
        body={removing ? `${removing.user.email} will immediately lose access to this workspace.` : ""}
        confirmLabel="Remove"
      />
    </div>
  );
}
