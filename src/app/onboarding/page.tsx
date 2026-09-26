import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { getServerAuth } from "@/server/auth/server";
import { OnboardingWizard } from "./OnboardingWizard";

export const metadata: Metadata = { title: "Set up your workspace", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: { new?: string } }) {
  const auth = await getServerAuth();
  if (!auth) redirect("/signin?next=/onboarding");
  if (auth.user.isGuest) redirect("/signup?from=demo");

  const creatingAnother = searchParams.new === "1";
  const members = await prisma.workspaceMember.findMany({
    where: { userId: auth.user.id, workspace: { isDemo: false } },
    include: { workspace: { select: { id: true, name: true, companyName: true, onboardingCompletedAt: true } } },
    orderBy: { createdAt: "asc" },
  });
  const pending = members.find((m) => !m.workspace.onboardingCompletedAt && (m.role === "OWNER" || m.role === "ADMIN"));
  if (!creatingAnother && !pending && members.some((m) => m.workspace.onboardingCompletedAt)) redirect("/dashboard");

  return (
    <OnboardingWizard
      userName={auth.user.name ?? ""}
      resume={!creatingAnother && pending ? { id: pending.workspace.id, name: pending.workspace.name, companyName: pending.workspace.companyName } : null}
      canCancel={creatingAnother}
    />
  );
}
