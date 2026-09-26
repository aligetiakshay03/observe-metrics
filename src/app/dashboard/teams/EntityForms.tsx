"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError, clearApiCache } from "@/lib/api-client";
import { Button, Field, SelectField } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog } from "@/components/ui/overlay";
import { useToast } from "@/components/providers/Toaster";

type Kind = "team" | "app";

export interface EntityInitial {
  id?: string;
  name?: string;
  description?: string | null;
  teamId?: string | null;
}

const PATHS: Record<Kind, string> = { team: "/api/v1/teams", app: "/api/v1/applications" };
const LABEL: Record<Kind, string> = { team: "team", app: "application" };

/** Create / edit dialog for teams and applications. */
export function EntityDialog({
  kind,
  open,
  onClose,
  initial,
  teams = [],
  onSaved,
}: {
  kind: Kind;
  open: boolean;
  onClose: () => void;
  initial?: EntityInitial;
  teams?: { id: string; name: string }[];
  onSaved: (id: string) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const editing = !!initial?.id;

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setDescription(initial?.description ?? "");
    setTeamId(initial?.teamId ?? "");
    setErrors({});
  }, [open, initial]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const body = kind === "team" ? { name } : { name, description: description || null, teamId: teamId || null };
      const res = editing
        ? await api<{ updated: boolean }>(`${PATHS[kind]}/${initial!.id}`, { method: "PATCH", body })
        : await api<{ id: string }>(PATHS[kind], { body });
      clearApiCache("/api/v1/analytics");
      toast({ tone: "success", title: editing ? `${cap(LABEL[kind])} updated` : `${cap(LABEL[kind])} created`, body: name });
      onSaved(editing ? initial!.id! : (res as { id: string }).id);
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError && err.fields) setErrors(err.fields);
      else toast({ tone: "error", title: `Couldn't save ${LABEL[kind]}`, body: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${LABEL[kind]}` : `New ${LABEL[kind]}`}
      description={
        kind === "team"
          ? "Teams attribute AI spend to the people and budgets that own it."
          : "Applications are the products or agents that call AI models. Events sent with a matching application slug are attributed automatically."
      }
    >
      <form id={`entity-form-${kind}`} onSubmit={submit} className="space-y-4">
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required maxLength={80} data-autofocus autoComplete="off" />
        {kind === "app" && (
          <>
            <Field label="Description" value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} maxLength={300} hint="Optional. What this application does." />
            <SelectField label="Owning team" value={teamId} onChange={(e) => setTeamId(e.target.value)} error={errors.teamId}>
              <option value="">No team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </SelectField>
          </>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {editing ? "Save changes" : `Create ${LABEL[kind]}`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function DeleteEntityDialog({ kind, open, onClose, id, name }: { kind: Kind; open: boolean; onClose: () => void; id: string; name: string }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await api(`${PATHS[kind]}/${id}`, { method: "DELETE" });
      clearApiCache("/api/v1/analytics");
      toast({ tone: "success", title: `${cap(LABEL[kind])} deleted`, body: name });
      onClose();
      router.push(kind === "team" ? "/dashboard/teams" : "/dashboard/applications");
    } catch (err) {
      toast({ tone: "error", title: `Couldn't delete ${LABEL[kind]}`, body: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={run}
      loading={busy}
      danger
      title={`Delete ${name}?`}
      confirmLabel={`Delete ${LABEL[kind]}`}
      body={`Historical usage is kept but will show as unattributed. Budgets scoped to this ${LABEL[kind]} will stop tracking.`}
    />
  );
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
