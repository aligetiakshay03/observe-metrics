"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiClientError } from "@/lib/api-client";
import { Button, Field, Notice } from "@/components/ui/primitives";
import { AuthShell } from "../_components/AuthShell";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token)
    return (
      <AuthShell title="Reset link missing" footer={<Link href="/forgot-password" className="link">Request a new link</Link>}>
        <Notice tone="warning">This page needs the link from your reset email. Request a new one if it has expired.</Notice>
      </AuthShell>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const f: Record<string, string> = {};
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) f.password = "Use at least 10 characters with a letter and a number.";
    if (confirm !== password) f.confirmPassword = "Passwords don't match.";
    setFields(f);
    if (Object.keys(f).length) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/auth/reset-password", { body: { token, password, confirmPassword: confirm } });
      router.push("/signin?reset=1");
    } catch (err) {
      const e = err as ApiClientError;
      setError(e.message);
      setFields(e.fields ?? {});
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Choose a new password" subtitle="Resetting your password signs you out on every device." footer={<Link href="/signin" className="link">Back to sign in</Link>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <Notice tone="danger" action={error.includes("expired") ? <Link href="/forgot-password" className="link text-xs">New link</Link> : undefined}>
            {error}
          </Notice>
        )}
        <Field label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fields.password} hint="At least 10 characters, with a letter and a number." autoFocus />
        <Field label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={fields.confirmPassword} />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          {busy ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
