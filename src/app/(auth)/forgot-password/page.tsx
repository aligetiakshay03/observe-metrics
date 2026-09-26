"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { api, ApiClientError } from "@/lib/api-client";
import { Button, Field, Notice } from "@/components/ui/primitives";
import { AuthShell } from "../_components/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [sent, setSent] = useState<null | { delivery: string }>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setFieldError("Enter a valid email.");
    setFieldError(undefined);
    setBusy(true);
    setError(null);
    try {
      setSent(await api<{ delivery: string }>("/api/v1/auth/forgot-password", { body: { email } }));
    } catch (err) {
      setError((err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  };

  if (sent)
    return (
      <AuthShell title="Check your email" footer={<Link href="/signin" className="link">Back to sign in</Link>}>
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
          <MailCheck size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <p className="text-sm text-muted">
            If an account exists for <span className="font-medium text-fg">{email}</span>, we&apos;ve sent a link to reset your password. The link expires in 1 hour.
          </p>
        </div>
        {sent.delivery === "server-log" && (
          <div className="mt-4">
            <Notice tone="info" title="Development note">
              Email delivery (SMTP) isn&apos;t configured on this deployment, so the reset link was written to the server log instead of being emailed.
            </Notice>
          </div>
        )}
      </AuthShell>
    );

  return (
    <AuthShell title="Reset your password" subtitle="Enter the email you use for ObserveMetrics and we'll send you a reset link." footer={<Link href="/signin" className="link">Back to sign in</Link>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError} autoFocus />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthShell>
  );
}
