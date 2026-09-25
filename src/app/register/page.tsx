"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-semibold">
          <span className="inline-block h-6 w-6 rounded-md" style={{ background: "linear-gradient(135deg, var(--accent), #a855f7)" }} />
          ObserveMetrics
        </Link>
        <div className="panel p-6">
          <h1 className="text-xl font-semibold">Create your workspace</h1>
          <p className="mt-1 text-sm muted">Free plan — no credit card required.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm" htmlFor="name">Your name</label>
              <input id="name" required className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ada Lovelace" />
            </div>
            <div>
              <label className="mb-1 block text-sm" htmlFor="email">Work email</label>
              <input id="email" type="email" required className="input" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@company.com" />
            </div>
            <div>
              <label className="mb-1 block text-sm" htmlFor="password">Password</label>
              <input id="password" type="password" required minLength={8} className="input" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="mb-1 block text-sm" htmlFor="org">Organization name</label>
              <input id="org" required className="input" value={form.organizationName} onChange={(e) => set("organizationName", e.target.value)} placeholder="Acme Inc" />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary w-full disabled:opacity-60">
              {busy ? "Creating workspace…" : "Create workspace"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm muted">
            Already have an account? <Link href="/login" style={{ color: "var(--accent)" }}>Log in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
