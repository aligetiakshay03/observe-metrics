"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LogoMark } from "@/components/ui";

interface InviteInfo {
  email: string;
  role: string;
  team: string | null;
  organization: { name: string; slug: string };
}

export default function InvitePage() {
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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5">
      <div className="surface w-full max-w-[380px] p-6">
        <div className="flex items-center gap-2">
          <LogoMark size={22} />
          <span className="text-[15px] font-semibold tracking-tight">ObserveMetrics</span>
        </div>
        <h1 className="mt-5 text-lg font-semibold">
          Join {info?.organization.name ?? "your team"}
        </h1>
        <p className="mt-1 text-[13px] muted">
          {info
            ? "You were invited as " + info.role.toLowerCase() + (info.team ? " on the " + info.team + " team" : "") + "."
            : error
              ? null
              : "Loading invitation…"}
        </p>
        <div className="mt-5 space-y-3.5">
          <div>
            <label className="label mb-1.5 block">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <label className="label mb-1.5 block">Password</label>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set a password (8+ chars)" />
            <p className="mt-1.5 text-xs muted">Leave empty if you already have an account for {info?.email}.</p>
          </div>
          {error && <p className="text-[13px]" style={{ color: "var(--danger)" }}>{error}</p>}
          <button onClick={accept} disabled={busy || !info} className="btn btn-primary w-full">
            {busy ? "Joining…" : "Accept invitation"}
          </button>
        </div>
      </div>
    </main>
  );
}
