"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React, { useState } from "react";
import { useSession, useTheme } from "../providers";
import {
  IconGrid, IconPie, IconCoins, IconLayers, IconUsers, IconBoxes, IconTarget, IconBell,
  IconSettings, IconSun, IconMoon, IconLogout, IconMenu, IconX, IconChevronDown,
} from "@/components/icons";
import { LogoMark, PROVIDER_LABELS } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: IconGrid, exact: true },
  { href: "/dashboard/usage", label: "Usage", icon: IconPie },
  { href: "/dashboard/costs", label: "Costs", icon: IconCoins },
  { href: "/dashboard/models", label: "Models", icon: IconLayers },
  { href: "/dashboard/teams", label: "Teams", icon: IconUsers },
  { href: "/dashboard/applications", label: "Applications", icon: IconBoxes },
  { href: "/dashboard/budgets", label: "Budgets", icon: IconTarget },
  { href: "/dashboard/alerts", label: "Alerts", icon: IconBell },
];

export function DashboardShell({ userName, children }: { userName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, setActiveOrg } = useSession();
  const { theme, toggleTheme } = useTheme();
  const [orgOpen, setOrgOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function nav(active: boolean) {
    return active
      ? { background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600 }
      : { color: "var(--muted)" };
  }

  const sidebarInner = (
    <div className="flex h-full flex-col" style={{ background: "var(--surface)" }}>
      {/* Brand */}
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b px-4">
        <LogoMark size={20} />
        <span className="text-[13.5px] font-semibold tracking-tight">ObserveMetrics</span>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="focusable flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors hover:bg-[var(--surface-2)]"
              style={nav(active)}
            >
              <Icon size={15.5} />
              {item.label}
              {item.label === "Alerts" && <UnreadDot />}
            </Link>
          );
        })}

        <div className="mx-2.5 my-2.5 border-t" />

        <Link
          href="/dashboard/settings"
          onClick={() => setMobileOpen(false)}
          className="focusable flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors hover:bg-[var(--surface-2)]"
          style={nav(pathname.startsWith("/dashboard/settings") || pathname.startsWith("/dashboard/billing"))}
        >
          <IconSettings size={15.5} />
          Settings
        </Link>
      </nav>

      {/* Workspace selector */}
      <div className="relative border-t p-2.5">
        <button
          onClick={() => setOrgOpen((o) => !o)}
          className="focusable flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-2)]"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
        >
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider faint">Workspace</span>
            <span className="block truncate text-[13px] font-medium">{me?.activeOrg?.name ?? "…"}</span>
          </span>
          <IconChevronDown size={13} className={"shrink-0 muted transition-transform " + (orgOpen ? "rotate-180" : "")} />
        </button>
        {orgOpen && me && (
          <div className="absolute bottom-full left-2.5 right-2.5 z-30 mb-1 rounded-lg border p-1 shadow-lg" style={{ background: "var(--surface)" }}>
            {me.organizations.map((o) => (
              <button
                key={o.id}
                onClick={async () => {
                  setOrgOpen(false);
                  await setActiveOrg(o.id);
                }}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-[var(--surface-2)]"
              >
                <span className="truncate">{o.name}</span>
                {o.id === me.activeOrg?.id && <span className="dot dot-accent" />}
              </button>
            ))}
          </div>
        )}

        {/* User block */}
        <div className="mt-2.5 flex items-center justify-between gap-2 px-1.5 pb-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              {initials(userName)}
            </span>
            <span className="truncate text-[12.5px] muted">{userName}</span>
          </div>
          <div className="flex shrink-0 items-center">
            <button onClick={toggleTheme} className="rounded-md p-1.5 muted transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]" aria-label="Toggle theme">
              {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
            </button>
            <button onClick={logout} className="rounded-md p-1.5 muted transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]" aria-label="Log out">
              <IconLogout size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 border-r lg:block">{sidebarInner}</aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[264px] border-r shadow-xl">{sidebarInner}</div>
        </div>
      )}

      {/* Main column */}
      <div className="min-w-0 flex-1">
        {/* Mobile topbar */}
        <div className="sticky top-0 z-40 flex h-[52px] items-center justify-between border-b px-4 lg:hidden" style={{ background: "color-mix(in srgb, var(--surface) 86%, transparent)", backdropFilter: "blur(10px)" }}>
          <button onClick={() => setMobileOpen(true)} className="rounded-md p-1.5 muted hover:bg-[var(--surface-2)]" aria-label="Open menu">
            <IconMenu size={18} />
          </button>
          <span className="flex items-center gap-2 text-[13px] font-semibold"><LogoMark size={18} /> ObserveMetrics</span>
          <Link href="/dashboard/settings" className="rounded-md p-1.5 muted hover:bg-[var(--surface-2)]" aria-label="Settings">
            <IconSettings size={17} />
          </Link>
        </div>

        <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-6">{children}</div>
      </div>
    </div>
  );
}

function UnreadDot() {
  const { me } = useSession();
  const [hasUnread, setHasUnread] = React.useState(false);
  React.useEffect(() => {
    fetch("/api/v1/alerts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.data?.alerts?.some((a: { readAt: string | null }) => !a.readAt) && setHasUnread(true))
      .catch(() => {});
  }, []);
  if (!hasUnread || !me) return null;
  return <span className="dot dot-danger ml-auto" />;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : name.slice(0, 2)).toUpperCase();
}
