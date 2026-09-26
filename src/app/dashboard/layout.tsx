import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getServerAuth } from "@/server/auth/server";
import { buildMe } from "@/server/workspaces";
import { WORKSPACE_COOKIE } from "@/server/auth/session";
import { MeProvider } from "@/components/shell/MeProvider";
import { AppShell } from "@/components/shell/AppShell";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Dashboard", template: "%s · ObserveMetrics" }, robots: { index: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const auth = await getServerAuth();
  if (!auth) redirect("/signin?next=/dashboard");
  if (!auth.workspace) redirect("/onboarding");
  if (!auth.workspace.isDemo && !auth.workspace.onboardingCompletedAt) redirect("/onboarding");
  const me = await buildMe(auth, cookies().get(WORKSPACE_COOKIE)?.value ?? null);
  return (
    <MeProvider initial={me}>
      <AppShell>{children}</AppShell>
    </MeProvider>
  );
}
