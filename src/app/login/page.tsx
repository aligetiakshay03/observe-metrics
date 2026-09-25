"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Login failed");
      // Honor ?next= from the middleware redirect, defaulting to the dashboard.
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next && next.startsWith("/") ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-semibold">
          <span className="inline-block h-6 w-6 rounded-md" style={{ background: "linear-gradient(135deg, var(--accent), #a855f7)" }} />
          ObserveMetrics
        </Link>
        <div className="panel p-6">
          <h1 className="text-xl font-semibold">Log in</h1>
          <p className="mt-1 text-sm muted">Welcome back — enter your details.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm" htmlFor="email">Email</label>
              <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div>
              <label className="mb-1 block text-sm" htmlFor="password">Password</label>
              <input id="password" type="password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary w-full disabled:opacity-60">
              {busy ? "Logging in…" : "Log in"}
            </button>
          </form>
          <div className="my-4 flex items-center gap-3 text-xs muted">
            <span className="h-px flex-1" style={{ background: "var(--border)" }} /> or <span className="h-px flex-1" style={{ background: "var(--border)" }} />
          </div>
          <a href="/api/v1/auth/google" className="btn btn-outline w-full">Continue with Google</a>
          <p className="mt-6 text-center text-sm muted">
            No account? <Link href="/register" style={{ color: "var(--accent)" }}>Start free</Link>
          </p>
        </div>
        <p className="mt-4 text-center text-xs muted">Demo: demo@observemetrics.dev / demo1234</p>
      </div>
    </main>
  );
}
