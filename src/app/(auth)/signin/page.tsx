import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/server/auth/server";
import { env } from "@/server/env";
import { AuthShell, safeNext } from "../_components/AuthShell";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

const OAUTH_ERRORS: Record<string, string> = {
  google_unavailable: "Google sign-in isn't configured on this deployment.",
  google_failed: "Google sign-in didn't complete. Please try again.",
  google_expired: "The Google sign-in request expired. Please try again.",
  google_unverified: "Your Google account email isn't verified, so it can't be used to sign in.",
};

export default async function SignInPage({ searchParams }: { searchParams: { next?: string; error?: string; reset?: string } }) {
  const auth = await getServerAuth().catch(() => null);
  const next = safeNext(searchParams.next);
  if (auth && !auth.user.isGuest) redirect(next ?? "/dashboard");
  return (
    <AuthShell title="Sign in to ObserveMetrics" subtitle="Welcome back. Pick up where you left off.">
      <SignInForm
        next={next}
        google={env.googleAuthEnabled}
        oauthError={searchParams.error ? OAUTH_ERRORS[searchParams.error] ?? "Sign-in failed. Please try again." : null}
        resetDone={searchParams.reset === "1"}
      />
    </AuthShell>
  );
}
