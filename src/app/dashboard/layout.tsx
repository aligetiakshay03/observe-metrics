import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { DashboardShell } from "./shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}

async function AuthGate({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");
  return <DashboardShell userName={user.name ?? user.email}>{children}</DashboardShell>;
}
