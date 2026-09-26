"use client";

import Link from "next/link";
import { forwardRef, useId, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Info, Loader2, RefreshCw, TriangleAlert, OctagonAlert, CircleCheck, Minus } from "lucide-react";
import { fmtChange, prettyModel, providerColor, providerLabel } from "@/lib/format";
import type { DataBasis, Severity } from "@/lib/types";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ── Buttons ──────────────────────────────────────────────────

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", size === "lg" && "btn-lg", !children && "btn-icon", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon,
  children,
  className,
  ...rest
}: { href: string; variant?: BtnVariant; size?: "sm" | "md" | "lg"; icon?: React.ReactNode; children: React.ReactNode; className?: string } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  return (
    <Link href={href} className={cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", size === "lg" && "btn-lg", className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cx("animate-spin text-muted", className)} aria-label="Loading" />;
}

// ── Form fields ──────────────────────────────────────────────

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: React.ReactNode;
  trailing?: React.ReactNode;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, error, hint, trailing, id, className, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between">
        <label htmlFor={fid} className="label">
          {label}
        </label>
        {trailing}
      </div>
      <input
        ref={ref}
        id={fid}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
        {...rest}
      />
      {error ? (
        <p id={`${fid}-err`} className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fid}-hint`} className="hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export function SelectField({
  label,
  error,
  hint,
  children,
  className,
  id,
  ...rest
}: { label: string; error?: string; hint?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={className}>
      <label htmlFor={fid} className="label">
        {label}
      </label>
      <select id={fid} className="select" aria-invalid={error ? true : undefined} {...rest}>
        {children}
      </select>
      {error ? <p className="field-error" role="alert">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ label, description, ...rest }: { label: string; description?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border-strong accent-[var(--accent)]" {...rest} />
      <label htmlFor={id} className="cursor-pointer select-none text-sm">
        <span className="font-medium">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </label>
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-accent" : "bg-surface-3 ring-1 ring-inset ring-border-strong",
        )}
      >
        <span className={cx("inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

// ── Layout ───────────────────────────────────────────────────

export function PageHeader({ title, description, actions, eyebrow, back }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
            ← {back.label}
          </Link>
        )}
        {eyebrow && <div className="mb-1.5">{eyebrow}</div>}
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, subtitle, actions, children, className, bodyClassName, footer }: { title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string; footer?: React.ReactNode }) {
  return (
    <section className={cx("card flex min-w-0 flex-col", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-4 pb-1 pt-3.5">
          <div className="min-w-0">
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cx("min-w-0 flex-1", bodyClassName ?? "px-4 pb-4 pt-2")}>{children}</div>
      {footer && <footer className="border-t border-border px-4 py-2.5 text-xs">{footer}</footer>}
    </section>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}

// ── Feedback states ──────────────────────────────────────────

export function EmptyState({ icon, title, body, actions, compact }: { icon?: React.ReactNode; title: string; body: React.ReactNode; actions?: React.ReactNode; compact?: boolean }) {
  return (
    <div className={cx("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-14")}>
      {icon && <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted">{icon}</div>}
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{body}</p>
      {actions && <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorState({ title = "Couldn't load this view", message, onRetry, compact }: { title?: string; message?: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <div role="alert" className={cx("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-14")}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-danger-soft text-danger">
        <AlertTriangle size={18} aria-hidden />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {message && <p className="mt-1 max-w-md text-sm text-muted">{message}</p>}
      {onRetry && (
        <Button className="mt-4" icon={<RefreshCw size={14} />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Notice({ tone = "info", title, children, action }: { tone?: "info" | "warning" | "danger" | "success"; title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const styles = {
    info: "border-accent/25 bg-accent-soft text-fg",
    warning: "border-warning/30 bg-warning-soft text-fg",
    danger: "border-danger/30 bg-danger-soft text-fg",
    success: "border-success/30 bg-success-soft text-fg",
  }[tone];
  const Icon = tone === "danger" ? OctagonAlert : tone === "warning" ? TriangleAlert : tone === "success" ? CircleCheck : Info;
  const iconColor = { info: "text-accent", warning: "text-warning", danger: "text-danger", success: "text-success" }[tone];
  return (
    <div className={cx("flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm", styles)} role={tone === "danger" ? "alert" : undefined}>
      <Icon size={16} className={cx("mt-0.5 shrink-0", iconColor)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cx("text-muted", title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── Tooltip ──────────────────────────────────────────────────

export function InfoTip({ children, label = "More information" }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-faint hover:text-muted"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
      >
        <Info size={12} aria-hidden />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-1.5 w-64 -translate-x-1/2 animate-fade-in rounded-md border border-border bg-surface px-2.5 py-2 text-xs font-normal normal-case leading-relaxed tracking-normal text-muted shadow-pop"
        >
          {children}
        </span>
      )}
    </span>
  );
}

// ── Data display ─────────────────────────────────────────────

/** Change vs previous period. `inverse` when an increase is bad (spend, latency, errors). */
export function Delta({ value, inverse = false, neutral = false, className }: { value: number | null | undefined; inverse?: boolean; neutral?: boolean; className?: string }) {
  if (value == null || !Number.isFinite(value)) return <span className={cx("text-xs text-faint", className)}>—</span>;
  const flat = Math.abs(value) < 0.05;
  const good = inverse ? value < 0 : value > 0;
  const color = flat || neutral ? "text-muted" : good ? "text-success" : "text-danger";
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cx("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", color, className)}>
      <Icon size={13} aria-hidden />
      {fmtChange(value)}
      <span className="sr-only">{flat ? "no change" : good ? "(improvement)" : "(regression)"}</span>
    </span>
  );
}

export function Sparkline({ data, color = "var(--c1)", width = 88, height = 28 }: { data: number[]; color?: string; width?: number; height?: number }) {
  const id = useId().replace(/:/g, "");
  if (data.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => [i * step, height - 2 - ((v - min) / span) * (height - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  return (
    <svg width={width} height={height} className="shrink-0 overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={`sg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.16} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line}L${width},${height}L0,${height}Z`} fill={`url(#sg${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ProgressBar({ value, max = 100, tone, markers = [], label }: { value: number; max?: number; tone?: "ok" | "warning" | "danger"; markers?: number[]; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const bar = tone === "danger" ? "bg-st-critical" : tone === "warning" ? "bg-st-warning" : "bg-accent";
  return (
    <div className="relative h-2 w-full rounded-full bg-surface-3" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <div className={cx("h-full rounded-full transition-[width] duration-500", bar)} style={{ width: `${pct}%` }} />
      {markers.map((m) => (
        <span key={m} className="absolute top-[-3px] h-[14px] w-px bg-border-strong" style={{ left: `${Math.min(100, (m / max) * 100)}%` }} aria-hidden />
      ))}
    </div>
  );
}

export function ProviderName({ provider, className, showDot = true }: { provider: string; className?: string; showDot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5", className)}>
      {showDot && <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: providerColor(provider) }} aria-hidden />}
      <span>{providerLabel(provider)}</span>
    </span>
  );
}

export function ModelName({ model, provider, sub = true }: { model: string; provider?: string; sub?: boolean }) {
  return (
    <span className="inline-flex min-w-0 flex-col leading-tight">
      <span className="truncate font-medium">{prettyModel(model)}</span>
      {sub && <span className="truncate font-mono text-2xs text-faint">{provider ? `${provider} · ` : ""}{model}</span>}
    </span>
  );
}

const SEVERITY: Record<Severity, { label: string; cls: string; Icon: typeof OctagonAlert }> = {
  CRITICAL: { label: "Critical", cls: "badge-danger", Icon: OctagonAlert },
  WARNING: { label: "Warning", cls: "badge-warning", Icon: TriangleAlert },
  INFO: { label: "Info", cls: "badge-accent", Icon: Info },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity];
  return (
    <span className={cx("badge", s.cls)}>
      <s.Icon size={11} aria-hidden />
      {s.label}
    </span>
  );
}

const BASIS: Record<DataBasis, { label: string; tip: string; cls: string }> = {
  reported: { label: "Provider reported", tip: "Costs come from the provider's billing/cost API.", cls: "badge-success" },
  calculated: { label: "Estimated", tip: "Estimated cost based on recorded token usage and current model list prices. Not an invoice.", cls: "badge-neutral" },
  mixed: { label: "Reported + estimated", tip: "Some costs come from provider cost APIs; the rest are estimated from tokens and list prices.", cls: "badge-neutral" },
  demo: { label: "Demo data", tip: "Generated sample data for exploring ObserveMetrics. Not real usage.", cls: "badge-warning" },
};

export function BasisBadge({ basis }: { basis: DataBasis }) {
  const b = BASIS[basis];
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cx("badge", b.cls)}>{b.label}</span>
      <InfoTip label="About this data">{b.tip}</InfoTip>
    </span>
  );
}

export function Dot({ className }: { className?: string }) {
  return <span className={cx("inline-block h-1.5 w-1.5 rounded-full", className)} aria-hidden />;
}
