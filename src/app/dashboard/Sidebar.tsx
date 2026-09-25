"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useSession, useTheme } from "../providers";
import { IconGrid, IconPie, IconCoins, IconTarget, IconSettings, IconSun, IconMoon, IconLogout } from "@/components/icons";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: IconGrid, exact: true },
  { href: "/dashboard/tokens", label: "Token Analytics", icon: IconPie },
  { href: "/dashboard/costs", label: "Cost Analytics", icon: IconCoins },
  { href: "/dashboard/budgets", label: "Budgets & Alerts", icon: IconTarget },
  { href: "/dashboard/settings", label: "Settings", icon: IconSettings },
];

export function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, setActiveOrg } = useSession();
  const { theme, toggleTheme } = useTheme();
  const [orgOpen, setOrgOpen] = useState(false);

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r"
      style={{ background: "var(--panel)" }}
    >
      <div className="flex h-16 items-center gap-2.5 border-b px-5">
        <span
          className="inline-block h-7 w-7 rounded-lg"
          style={{ background: "linear-gradient(135deg, var(--accent), #a855f7)" }}
        />
        <span className="text-[15px] font-semibold tracking-tight">ObserveMetrics</span>
      </div>

      {/* Org switcher */}
      <div className="relative border-b px-4 py-3">
        <button
          onClick={() => setOrgOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        >
          <span className="truncate">{me?.activeOrg?.name ?? "Loading…"}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={"muted transition-transform " + (orgOpen ? "rotate-180" : "")} aria-hidden="true">
            <path d="M1.5 3.5 5 7l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {orgOpen && me && (
          <div className="absolute left-4 right-4 z-20 mt-1 rounded-lg border p-1 shadow-lg" style={{ background: "var(--panel)" }}>
            {me.organizations.map((o) => (
              <button
                key={o.id}
                onClick={async () => {
                  setOrgOpen(false);
                  await setActiveOrg(o.id);
                }}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className="truncate">{o.name}</span>
                {o.id === me.activeOrg?.id && <span style={{ color: "var(--accent)" }}>●</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={
                active
                  ? { background: "rgba(99,102,241,0.12)", color: "var(--accent)", fontWeight: 600 }
                  : { color: "var(--text)" }
              }
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full"
                  style={{ background: "var(--accent)" }}
                  aria-hidden="true"
                />
              )}
              <Icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t p-3 text-sm">
        <div className="truncate px-3 pb-2 text-xs muted">{userName}</div>
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        >
          {theme === "dark" ? <IconSun size={17} /> : <IconMoon size={17} />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        >
          <IconLogout size={17} />
          Log out
        </button>
      </div>
    </aside>
  );
}
