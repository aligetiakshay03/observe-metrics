"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiClientError, clearApiCache } from "@/lib/api-client";
import { Button, Checkbox, Field, Notice } from "@/components/ui/primitives";
import { GoogleButton } from "../_components/AuthShell";

export function SignInForm({ next, google, oauthError, resetDone }: { next: string | null; google: boolean; oauthError: string | null; resetDone: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(oauthError);
  const [fields, setFields] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const f: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) f.email = "Enter a valid email.";
    if (!password) f.password = "Enter your password.";
    setFields(f);
    if (Object.keys(f).length) return;
    setBusy(true);
    setError(null);
    try {
      const d = await api<{ next: string }>("/api/v1/auth/signin", { body: { email, password, remember } });
      clearApiCache();
      router.push(next ?? d.next);
      router.refresh();
    } catch (err) {
      const e = err as ApiClientError;
      setError(e.message);
      setFields(e.fields ?? {});
      setBusy(false);
    }
  };

  return (
    <>
      {resetDone && (
        <div className="mb-5">
          <Notice tone="success" title="Password updated">
            Sign in with your new password.
          </Notice>
        </div>
      )}
      {google && <GoogleButton />}
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} required autoFocus />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fields.password}
          required
          trailing={
            <Link href="/forgot-password" className="text-xs font-medium text-accent hover:underline">
              Forgot password?
            </Link>
          }
        />
        <Checkbox label="Remember me" description="Stay signed in on this device for 30 days." checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-muted">
        New to ObserveMetrics?{" "}
        <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="link">
          Create a free account
        </Link>
      </p>
    </>
  );
}
