"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button, Skeleton } from "@/components/ui/primitives";
import { ApiClientError } from "@/lib/api-client";

export function SettingsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card space-y-3 p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-72 max-w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Label/value row used in summary cards. */
export function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 text-sm last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{children}</dd>
    </div>
  );
}

export function CopyField({ value, label, mono = true }: { value: string; label: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the field is selectable */
    }
  };
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className={`input ${mono ? "font-mono text-xs" : ""}`}
      />
      <Button onClick={copy} icon={copied ? <Check size={14} /> : <Copy size={14} />} aria-label={`Copy ${label}`}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function fieldErrors(e: unknown): Record<string, string> {
  return e instanceof ApiClientError && e.fields ? e.fields : {};
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export const ROLE_INFO: Record<string, string> = {
  OWNER: "Full control, including deleting the workspace and managing admins.",
  ADMIN: "Manage providers, budgets, teams, applications, keys and members.",
  MEMBER: "View all analytics, export data and triage alerts and insights.",
  VIEWER: "Read-only access to dashboards and insights.",
};
