"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useSession, useTheme } from "../providers";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: "▦" },
  { href: "/dashboard/tokens", label: "Token Analytics", icon: "◔" },
  { href: "/dashboard/costs", label: "Cost Analytics", icon: "▤" },
  { href: "/dashboard/budgets", label: "Budgets & Alerts", icon: "◑" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙" },
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
      <div className="flex h-16 items-center gap-2 border-b px-5 font-semibold">
        <span className="inline-block h-6 w-6 rounded-md" style={{ background: "linear-gradient(135deg, var(--accent), #a855f7)" }} />
        ObserveMetrics
      </div>

      {/* Org switcher */}
      <div className="relative border-b px-4 py-3">
        <button
          onClick={() => setOrgOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5"
        >
          <span className="truncate">{me?.activeOrg?.name ?? "Loading…"}</span>
          <span className="muted text-xs">▼</span>
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
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
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
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
              style={active ? { background: "rgba(99,102,241,0.12)", color: "var(--accent)", fontWeight: 500 } : undefined}
            >
              <span className="w-4 text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t p-3 text-sm">
        <div className="px-3 pb-1 text-xs muted">{userName}</div>
        <button onClick={toggleTheme} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5">
          <span className="w-4 text-center">{theme === "dark" ? "☀" : "☾"}</span>
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5">
          <span className="w-4 text-center">⏻</span>
          Log out
        </button>
      </div>
    </aside>
  );
}
