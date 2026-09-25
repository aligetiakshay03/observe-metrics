"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "@/components/ui";

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
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <Link href="/" className="mb-7 flex items-center gap-2">
        <LogoMark size={22} />
        <span className="text-[15px] font-semibold tracking-tight">ObserveMetrics</span>
      </Link>
      <div className="surface w-full max-w-[360px] p-6">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="mt-1 text-[13px] muted">Welcome back.</p>
        <form onSubmit={submit} className="mt-5 space-y-3.5">
          <div>
            <label className="label mb-1.5 block" htmlFor="email">Email</label>
            <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <div>
            <label className="label mb-1.5 block" htmlFor="password">Password</label>
            <input id="password" type="password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>
          {error && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>}
          <button type="submit" disabled={busy} className="btn btn-primary w-full">{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <div className="my-4 flex items-center gap-3 text-xs faint">
          <span className="h-px flex-1" style={{ background: "var(--border)" }} /> or <span className="h-px flex-1" style={{ background: "var(--border)" }} />
        </div>
        <a href="/api/v1/auth/google" className="btn btn-secondary w-full">Continue with Google</a>
        <p className="mt-5 text-center text-[13px] muted">
          No account? <Link href="/register" style={{ color: "var(--accent)" }} className="font-medium">Start free</Link>
        </p>
      </div>
      <p className="mt-4 text-xs faint">Demo: demo@observemetrics.dev · demo1234</p>
    </main>
  );
}
