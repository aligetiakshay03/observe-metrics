"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";
import { api, ApiClientError, clearApiCache } from "@/lib/api-client";
import { Button, cx, Field, Notice } from "@/components/ui/primitives";
import { GoogleButton } from "../_components/AuthShell";

function rules(pw: string) {
  return [
    { ok: pw.length >= 10, label: "At least 10 characters" },
    { ok: /[A-Za-z]/.test(pw) && /[0-9]/.test(pw), label: "A letter and a number" },
  ];
}

export function SignUpForm({ google, next }: { google: boolean; next: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    const f: Record<string, string> = {};
    if (!form.name.trim()) f.name = "Enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) f.email = "Enter a valid work email.";
    if (!rules(form.password).every((r) => r.ok)) f.password = "Use at least 10 characters with a letter and a number.";
    if (form.confirmPassword !== form.password) f.confirmPassword = "Passwords don't match.";
    return f;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = validate();
    setFields(f);
    if (Object.keys(f).length) return;
    setBusy(true);
    setError(null);
    setExists(false);
    try {
      await api("/api/v1/auth/signup", { body: form });
      clearApiCache();
      router.push(next?.startsWith("/invite/") ? next : "/onboarding");
      router.refresh();
    } catch (err) {
      const e = err as ApiClientError;
      setExists(e.code === "conflict");
      setError(e.code === "conflict" ? null : e.message);
      setFields(e.fields ?? {});
      setBusy(false);
    }
  };

  return (
    <>
      {google && <GoogleButton />}
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Notice tone="danger">{error}</Notice>}
        {exists && (
          <Notice tone="warning" title="An account with this email already exists">
            <Link href={next ? `/signin?next=${encodeURIComponent(next)}` : "/signin"} className="link">
              Sign in instead
            </Link>{" "}
            or <Link href="/forgot-password" className="link">reset your password</Link>.
          </Notice>
        )}
        <Field label="Full name" autoComplete="name" value={form.name} onChange={set("name")} error={fields.name} autoFocus />
        <Field label="Work email" type="email" autoComplete="email" value={form.email} onChange={set("email")} error={exists ? undefined : fields.email} />
        <div>
          <Field label="Password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} error={fields.password} />
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Password requirements">
            {rules(form.password).map((r) => (
              <li key={r.label} className={cx("inline-flex items-center gap-1", r.ok ? "text-success" : "text-faint")}>
                <Check size={12} aria-hidden /> {r.label}
                <span className="sr-only">{r.ok ? "(met)" : "(not met)"}</span>
              </li>
            ))}
          </ul>
        </div>
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={set("confirmPassword")}
          error={fields.confirmPassword ?? (form.confirmPassword && form.confirmPassword !== form.password ? "Passwords don't match." : undefined)}
        />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-xs text-faint">By creating an account you agree to use ObserveMetrics for AI usage data you&apos;re authorized to access.</p>
      </form>
      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link href={next ? `/signin?next=${encodeURIComponent(next)}` : "/signin"} className="link">
          Sign in
        </Link>
      </p>
    </>
  );
}
