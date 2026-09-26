"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, MoreHorizontal, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { api, ApiClientError, clearApiCache, useApi } from "@/lib/api-client";
import { fmtUsd, fmtUsd0 } from "@/lib/format";
import type { BudgetItem, Lookups } from "@/lib/types";
import { Button, cx, EmptyState, ErrorState, Field, Notice, PageHeader, ProgressBar, SelectField, Switch } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, MenuItem, Popover } from "@/components/ui/overlay";
import { PageSkeleton } from "@/components/dashboard/blocks";
import { useToast } from "@/components/providers/Toaster";

type Scope = BudgetItem["scope"];
interface FormState {
  id?: string;
  name: string;
  scope: Scope;
  teamId: string;
  applicationId: string;
  amountUsd: string;
  warn: string;
  limit: string;
  notify: boolean;
}

const EMPTY: FormState = { name: "", scope: "WORKSPACE", teamId: "", applicationId: "", amountUsd: "", warn: "80", limit: "100", notify: true };
const SCOPE_LABEL: Record<Scope, string> = { WORKSPACE: "Workspace", TEAM: "Team", APPLICATION: "Application" };

export default function BudgetsPage() {
  const { data, error, loading, refresh } = useApi<{ budgets: BudgetItem[]; canEdit: boolean }>("/api/v1/budgets");
  // Lookups for team/app selectors (lightweight 7-day query).
  const { data: lk } = useApi<{ lookups: Lookups }>("/api/v1/analytics/teams?range=7d");
  const toast = useToast();
  const [form, setForm] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<BudgetItem | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const header = (
    <PageHeader
      title="Budgets"
      description="Set monthly limits for your workspace, teams and applications, and get alerted as spend approaches them."
      actions={
        data?.canEdit ? (
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setForm({ ...EMPTY })}>
            Create budget
          </Button>
        ) : undefined
      }
    />
  );

  if (loading && !data) return <PageSkeleton kpis={3} table={false} />;
  if (error && !data)
    return (
      <>
        {header}
        <div className="card">
          <ErrorState message={error.message} onRetry={refresh} />
        </div>
      </>
    );
  if (!data) return null;

  const edit = (b: BudgetItem) =>
    setForm({
      id: b.id,
      name: b.name,
      scope: b.scope,
      teamId: b.teamId ?? "",
      applicationId: b.applicationId ?? "",
      amountUsd: String(b.amountUsd),
      warn: String(b.thresholds[0] ?? 80),
      limit: String(b.thresholds[1] ?? b.thresholds[0] ?? 100),
      notify: b.notify,
    });

  const remove = async () => {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await api(`/api/v1/budgets/${deleting.id}`, { method: "DELETE" });
      toast({ tone: "success", title: "Budget deleted", body: deleting.name });
      setDeleting(null);
      clearApiCache("/api/v1/alerts");
      void refresh();
    } catch (e) {
      toast({ tone: "error", title: "Couldn't delete budget", body: (e as Error).message });
    } finally {
      setBusyDelete(false);
    }
  };

  const exceeded = data.budgets.filter((b) => b.status === "exceeded").length;
  const warning = data.budgets.filter((b) => b.status === "warning").length;

  return (
    <div>
      {header}
      {data.budgets.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Wallet size={18} />}
            title="No budgets yet"
            body="Budgets are free and unlimited. Set a monthly limit for the whole workspace, a team or an application, and ObserveMetrics alerts you at the thresholds you choose."
            actions={
              data.canEdit ? (
                <Button variant="primary" icon={<Plus size={14} />} onClick={() => setForm({ ...EMPTY })}>
                  Create budget
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="Budgets" value={String(data.budgets.length)} />
            <Stat label="Approaching limit" value={String(warning)} tone={warning ? "warning" : undefined} />
            <Stat label="Exceeded" value={String(exceeded)} tone={exceeded ? "danger" : undefined} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.budgets.map((b) => (
              <BudgetCard key={b.id} b={b} canEdit={data.canEdit} onEdit={() => edit(b)} onDelete={() => setDeleting(b)} />
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">
            Spend is month-to-date (UTC). Projections add the trailing 7-day daily average for the remaining days and are estimates.
          </p>
        </>
      )}

      <BudgetDialog form={form} setForm={setForm} lookups={lk?.lookups} onSaved={() => void refresh()} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={busyDelete}
        danger
        title={`Delete “${deleting?.name}”?`}
        confirmLabel="Delete budget"
        body="Threshold alerts for this budget stop immediately. Usage data is not affected."
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warning" | "danger" }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-2xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cx("mt-1 text-lg font-semibold tabular-nums", tone === "warning" && "text-warning", tone === "danger" && "text-danger")}>{value}</p>
    </div>
  );
}

function BudgetCard({ b, canEdit, onEdit, onDelete }: { b: BudgetItem; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  const tone = b.status === "exceeded" ? "danger" : b.status === "warning" ? "warning" : "ok";
  const statusBadge =
    b.status === "exceeded" ? <span className="badge badge-danger">Exceeded</span> : b.status === "warning" ? <span className="badge badge-warning">Approaching limit</span> : <span className="badge badge-success">On track</span>;
  return (
    <section className="card flex flex-col p-4" aria-label={`${b.name} budget`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{b.name}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {SCOPE_LABEL[b.scope]}
            {b.scope !== "WORKSPACE" && ` · ${b.targetName}`} · Monthly
          </p>
        </div>
        <div className="flex items-center gap-1">
          {statusBadge}
          {canEdit && (
            <Popover
              label={`${b.name} actions`}
              width="w-40"
              trigger={({ toggle, ref, ...aria }) => <Button ref={ref} variant="ghost" size="sm" onClick={toggle} {...aria} aria-label={`Actions for ${b.name}`} icon={<MoreHorizontal size={14} />} />}
            >
              {(close) => (
                <>
                  <MenuItem icon={<Pencil size={13} />} onSelect={() => { close(); onEdit(); }}>
                    Edit
                  </MenuItem>
                  <MenuItem danger icon={<Trash2 size={13} />} onSelect={() => { close(); onDelete(); }}>
                    Delete
                  </MenuItem>
                </>
              )}
            </Popover>
          )}
        </div>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-2">
        <p className="text-xl font-semibold tabular-nums">
          {fmtUsd(b.spentUsd)} <span className="text-sm font-normal text-muted">of {fmtUsd0(b.amountUsd)}</span>
        </p>
        <p className={cx("text-sm font-semibold tabular-nums", tone === "danger" && "text-danger", tone === "warning" && "text-warning")}>{b.percent.toFixed(1)}%</p>
      </div>
      <div className="mt-2">
        <ProgressBar value={b.percent} max={Math.max(100, ...b.thresholds)} tone={tone} markers={b.thresholds} label={`${b.name}: ${b.percent.toFixed(1)}% of budget used`} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
        <div>
          <dt className="text-muted">Projected</dt>
          <dd className={cx("mt-0.5 font-medium tabular-nums", b.projectedPercent >= 100 && "text-danger")}>
            {fmtUsd0(b.projectedUsd)} <span className="text-faint">({Math.round(b.projectedPercent)}%)</span>
          </dd>
        </div>
        <div>
          <dt className="text-muted">Days left</dt>
          <dd className="mt-0.5 font-medium tabular-nums">{b.daysLeft}</dd>
        </div>
        <div>
          <dt className="text-muted">Alerts</dt>
          <dd className="mt-0.5 flex items-center gap-1 font-medium tabular-nums">
            {b.notify ? <Bell size={11} aria-hidden /> : <BellOff size={11} aria-hidden />}
            {b.notify ? b.thresholds.map((t) => `${t}%`).join(" · ") : "Off"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function BudgetDialog({ form, setForm, lookups, onSaved }: { form: FormState | null; setForm: (f: FormState | null) => void; lookups?: Lookups; onSaved: () => void }) {
  const toast = useToast();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => setErrors({}), [form?.id, !!form]);
  if (!form) return null;
  const up = (patch: Partial<FormState>) => setForm({ ...form, ...patch });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const warn = Number(form.warn);
    const limit = Number(form.limit);
    const amount = Number(form.amountUsd);
    const local: Record<string, string> = {};
    if (!Number.isFinite(amount) || amount <= 0) local.amountUsd = "Enter an amount greater than 0.";
    if (!Number.isInteger(warn) || warn < 1 || warn > 200) local.warn = "1–200";
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) local.limit = "1–200";
    if (Object.keys(local).length) return setErrors(local);
    setSaving(true);
    setErrors({});
    const body = {
      name: form.name,
      scope: form.scope,
      teamId: form.scope === "TEAM" ? form.teamId || null : null,
      applicationId: form.scope === "APPLICATION" ? form.applicationId || null : null,
      amountUsd: amount,
      thresholds: [...new Set([warn, limit])].sort((a, b) => a - b),
      notify: form.notify,
    };
    try {
      if (form.id) await api(`/api/v1/budgets/${form.id}`, { method: "PATCH", body });
      else await api("/api/v1/budgets", { body });
      toast({ tone: "success", title: form.id ? "Budget updated" : "Budget created", body: form.name });
      clearApiCache("/api/v1/alerts");
      setForm(null);
      onSaved();
    } catch (err) {
      if (err instanceof ApiClientError && err.fields) setErrors(err.fields);
      else toast({ tone: "error", title: "Couldn't save budget", body: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const noTeams = form.scope === "TEAM" && !lookups?.teams.length;
  const noApps = form.scope === "APPLICATION" && !lookups?.apps.length;

  return (
    <Dialog open onClose={() => setForm(null)} title={form.id ? "Edit budget" : "Create budget"} description="Monthly limits reset on the 1st (UTC). Alerts fire once per threshold per month.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" value={form.name} onChange={(e) => up({ name: e.target.value })} error={errors.name} required maxLength={80} placeholder="e.g. Engineering" data-autofocus />
        <fieldset>
          <legend className="label">Applies to</legend>
          <div className="inline-flex rounded-md border border-border bg-surface p-0.5" role="radiogroup" aria-label="Budget scope">
            {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={form.scope === s}
                onClick={() => up({ scope: s })}
                className={cx("rounded-[4px] px-3 py-1 text-xs font-medium", form.scope === s ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}
              >
                {SCOPE_LABEL[s]}
              </button>
            ))}
          </div>
        </fieldset>
        {form.scope === "TEAM" && (
          <SelectField label="Team" value={form.teamId} onChange={(e) => up({ teamId: e.target.value })} error={errors.teamId} required>
            <option value="">Choose a team…</option>
            {lookups?.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SelectField>
        )}
        {form.scope === "APPLICATION" && (
          <SelectField label="Application" value={form.applicationId} onChange={(e) => up({ applicationId: e.target.value })} error={errors.applicationId} required>
            <option value="">Choose an application…</option>
            {lookups?.apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </SelectField>
        )}
        {(noTeams || noApps) && <Notice tone="info">No {noTeams ? "teams" : "applications"} yet. Create one first, or send events that include it.</Notice>}
        <Field label="Monthly limit (USD)" type="number" inputMode="decimal" min={1} step="any" value={form.amountUsd} onChange={(e) => up({ amountUsd: e.target.value })} error={errors.amountUsd} required placeholder="2500" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Warning at (%)" type="number" min={1} max={200} value={form.warn} onChange={(e) => up({ warn: e.target.value })} error={errors.warn ?? errors.thresholds} />
          <Field label="Limit alert at (%)" type="number" min={1} max={200} value={form.limit} onChange={(e) => up({ limit: e.target.value })} error={errors.limit} />
        </div>
        <Switch checked={form.notify} onChange={(v) => up({ notify: v })} label="Send notifications" description="In-app notifications for workspace members, plus email when SMTP is configured." />
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={() => setForm(null)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {form.id ? "Save changes" : "Create budget"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
