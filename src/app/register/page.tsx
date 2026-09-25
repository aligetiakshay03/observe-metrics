"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "@/components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", organizationName: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Registration failed");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <Link href="/" className="mb-7 flex items-center gap-2">
        <LogoMark size={22} />
        <span className="text-[15px] font-semibold tracking-tight">ObserveMetrics</span>
      </Link>
      <div className="surface w-full max-w-[380px] p-6">
        <h1 className="text-lg font-semibold">Create your workspace</h1>
        <p className="mt-1 text-[13px] muted">Free plan — no credit card required.</p>
        <form onSubmit={submit} className="mt-5 space-y-3.5">
          <div>
            <label className="label mb-1.5 block" htmlFor="name">Your name</label>
            <input id="name" required className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ada Lovelace" />
          </div>
          <div>
            <label className="label mb-1.5 block" htmlFor="email">Work email</label>
            <input id="email" type="email" required className="input" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@company.com" />
          </div>
          <div>
            <label className="label mb-1.5 block" htmlFor="password">Password</label>
            <input id="password" type="password" required minLength={8} className="input" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="8+ characters" />
          </div>
          <div>
            <label className="label mb-1.5 block" htmlFor="org">Organization name</label>
            <input id="org" required className="input" value={form.organizationName} onChange={(e) => set("organizationName", e.target.value)} placeholder="Acme Inc" />
          </div>
          {error && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>}
          <button type="submit" disabled={busy} className="btn btn-primary w-full">{busy ? "Creating workspace…" : "Create workspace"}</button>
        </form>
        <p className="mt-5 text-center text-[13px] muted">
          Already have an account? <Link href="/login" style={{ color: "var(--accent)" }} className="font-medium">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
