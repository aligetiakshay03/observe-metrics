import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerAuth } from "@/server/auth/server";
import { env } from "@/server/env";
import { AuthShell, safeNext } from "../_components/AuthShell";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = { title: "Create your account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SignUpPage({ searchParams }: { searchParams: { next?: string } }) {
  const auth = await getServerAuth().catch(() => null);
  if (auth && !auth.user.isGuest) redirect("/dashboard");
  return (
    <AuthShell title="Start free" subtitle="Create your account. ObserveMetrics is free during launch — no credit card.">
      <SignUpForm google={env.googleAuthEnabled} next={safeNext(searchParams.next)} />
    </AuthShell>
  );
}
