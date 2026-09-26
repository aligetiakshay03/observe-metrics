"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MailOpen } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { Button, Notice, Spinner } from "@/components/ui/primitives";
import { api, ApiClientError, clearApiCache } from "@/lib/api-client";

interface Preview {
  workspaceName: string;
  role: string;
  email: string;
}

export function InviteAccept({ token, signedInAs }: { token: string; signedInAs: string | null }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = `/invite/${encodeURIComponent(token)}`;

  useEffect(() => {
    api<Preview>(`/api/v1/invites/accept?token=${encodeURIComponent(token)}`)
      .then(setPreview)
      .catch((e: ApiClientError) => setLoadError(e.code === "not_found" ? "This invitation is invalid, has expired or was revoked. Ask a workspace admin to send a new one." : e.message));
  }, [token]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/invites/accept", { body: { token } });
      clearApiCache();
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const mismatch = preview && signedInAs && preview.email.toLowerCase() !== signedInAs.toLowerCase();

  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <LogoMark size={32} />
        {!preview && !loadError && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {loadError && (
          <div className="mt-5 space-y-4">
            <h1 className="text-lg font-semibold">Invitation unavailable</h1>
            <Notice tone="warning">{loadError}</Notice>
            <Link href="/" className="btn btn-secondary">
              Go to ObserveMetrics
            </Link>
          </div>
        )}
        {preview && (
          <div className="mt-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <MailOpen size={18} aria-hidden />
            </div>
            <h1 className="mt-4 text-xl font-semibold tracking-tight">Join {preview.workspaceName}</h1>
            <p className="mt-1.5 text-sm text-muted">
              You&apos;ve been invited as <span className="font-medium capitalize text-fg">{preview.role.toLowerCase()}</span>. This invitation was sent to{" "}
              <span className="font-medium text-fg">{preview.email}</span>.
            </p>
            {error && (
              <div className="mt-4">
                <Notice tone="danger">{error}</Notice>
              </div>
            )}
            {mismatch && (
              <div className="mt-4">
                <Notice tone="warning" title="Signed in with a different account">
                  You&apos;re signed in as {signedInAs}. Sign in as {preview.email} to accept this invitation.
                </Notice>
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              {signedInAs ? (
                <Button variant="primary" onClick={accept} loading={busy} disabled={!!mismatch}>
                  Accept invitation
                </Button>
              ) : (
                <>
                  <Link href={`/signin?next=${encodeURIComponent(next)}`} className="btn btn-primary">
                    Sign in to accept
                  </Link>
                  <Link href={`/signup?next=${encodeURIComponent(next)}`} className="btn btn-secondary">
                    Create account
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
