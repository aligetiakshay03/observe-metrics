"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface InviteInfo {
  email: string;
  role: string;
  team: string | null;
  organization: { name: string; slug: string };
}

export default function InvitePage() {
  // Client hook works whether params is a plain object (Next 14) or a promise (Next 15).
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/v1/invite/" + token)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message ?? "Invite not found");
        setInfo(json.data);
      })
      .catch((e) => setError((e as Error).message));
  }, [token]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/invite/" + token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password: password || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Could not accept invite");
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !info) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="panel max-w-sm p-8 text-center">
          <h1 className="text-lg font-semibold">Invitation unavailable</h1>
          <p className="mt-2 text-sm muted">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="panel w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold">
          Join {info?.organization.name ?? "your team"}
        </h1>
        <p className="mt-1 text-sm muted">
          {info
            ? "You were invited as " + info.role.toLowerCase() + (info.team ? " on the " + info.team + " team" : "") + "."
            : "Loading invitation…"}
        </p>
        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label className="mb-1 block text-sm">Password</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set a password (8+ chars)" />
            <p className="mt-1 text-xs muted">Leave empty if you already have an account for {info?.email}.</p>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button onClick={accept} disabled={busy || !info} className="btn btn-primary w-full disabled:opacity-60">
            {busy ? "Joining…" : "Accept invitation"}
          </button>
        </div>
      </div>
    </main>
  );
}
