"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AppWindow,
  Bell,
  BookOpen,
  Boxes,
  Check,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  CircleDollarSign,
  FlaskConical,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings,
  Siren,
  Sun,
  Users,
  Wallet,
  Activity,
  X,
  Lightbulb,
} from "lucide-react";
import { LogoMark } from "../brand/Logo";
import { cx, Button } from "../ui/primitives";
import { MenuItem, Popover } from "../ui/overlay";
import { useTheme } from "../providers/ThemeProvider";
import { useToast } from "../providers/Toaster";
import { useMe } from "./MeProvider";
import { api, clearApiCache, useApi } from "@/lib/api-client";
import { initials } from "@/lib/format";
import { CommandPalette } from "./CommandPalette";
import { NotificationsBell } from "./NotificationsBell";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/usage", label: "Usage", icon: Activity },
  { href: "/dashboard/costs", label: "Costs", icon: CircleDollarSign },
  { href: "/dashboard/models", label: "Models", icon: Boxes },
  { href: "/dashboard/teams", label: "Teams", icon: Users },
  { href: "/dashboard/applications", label: "Applications", icon: AppWindow },
  { href: "/dashboard/budgets", label: "Budgets", icon: Wallet },
  { href: "/dashboard/alerts", label: "Alerts", icon: Siren, badge: true },
  { href: "/dashboard/insights", label: "Insights", icon: Lightbulb },
];

function useSidebarCollapsed(): [boolean, (v: boolean) => void] {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("om-sidebar") === "collapsed");
    } catch {
      /* ignore */
    }
  }, []);
  const set = useCallback((v: boolean) => {
    setCollapsed(v);
    try {
      localStorage.setItem("om-sidebar", v ? "collapsed" : "expanded");
    } catch {
      /* ignore */
    }
  }, []);
  return [collapsed, set];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();
  const { me } = useMe();

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className={cx("sticky top-0 hidden h-screen shrink-0 border-r border-border bg-surface transition-[width] duration-200 lg:block", collapsed ? "w-[60px]" : "w-[232px]")}>
        <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </aside>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-[264px] animate-slide-in border-r border-border bg-surface shadow-pop">
            <SidebarContent collapsed={false} onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-bg/85 px-3 backdrop-blur-md sm:px-5">
          <Button variant="ghost" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation" icon={<Menu size={18} />} />
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm text-faint shadow-xs transition-colors hover:border-border-strong"
            aria-label="Search models, teams, applications and insights"
          >
            <Search size={14} aria-hidden />
            <span className="flex-1 truncate text-left">Search models, teams, apps…</span>
            <span className="kbd hidden sm:inline-flex">⌘K</span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            {me.workspace?.isDemo && (
              <span className="badge badge-warning hidden sm:inline-flex" title="This workspace contains generated sample data">
                <FlaskConical size={11} aria-hidden /> Demo data
              </span>
            )}
            <NotificationsBell />
          </div>
        </header>
        {me.workspace?.isDemo && <DemoBanner guest={me.user.isGuest} />}
        <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 animate-page-in px-3 py-5 sm:px-5 lg:px-7" key={pathname}>
          {children}
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

function DemoBanner({ guest }: { guest: boolean }) {
  const { me, switchWorkspace } = useMe();
  const real = me.workspaces.find((w) => !w.isDemo);
  return (
    <div className="border-b border-warning/25 bg-warning-soft px-3 py-2 text-xs sm:px-5 lg:px-7">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide text-warning">
          <FlaskConical size={12} aria-hidden /> Demo data
        </span>
        <span className="text-muted">You&apos;re exploring Helix Labs, a fictional company with generated usage. Numbers are not real customer data.</span>
        <span className="ml-auto flex gap-2">
          {guest ? (
            <Link href="/signup?from=demo" className="font-medium text-fg underline underline-offset-2">
              Create a free account
            </Link>
          ) : real ? (
            <button className="font-medium text-fg underline underline-offset-2" onClick={() => void switchWorkspace(real.id)}>
              Switch to {real.name}
            </button>
          ) : (
            <Link href="/onboarding" className="font-medium text-fg underline underline-offset-2">
              Set up your workspace
            </Link>
          )}
        </span>
      </div>
    </div>
  );
}

function SidebarContent({ collapsed, onToggle, onClose }: { collapsed: boolean; onToggle?: () => void; onClose?: () => void }) {
  const pathname = usePathname();
  const { data: alerts } = useApi<{ unread: number }>("/api/v1/alerts?status=open");
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(href + "/"));
  const Item = ({ href, label, icon: Icon, exact, badge }: (typeof NAV)[number] & { exact?: boolean; badge?: boolean }) => {
    const active = isActive(href, exact);
    const count = badge ? alerts?.unread ?? 0 : 0;
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cx(
          "group relative flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
          active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
          collapsed && "justify-center px-0",
        )}
        aria-label={collapsed ? label : undefined}
      >
        <Icon size={16} className="shrink-0" aria-hidden />
        {!collapsed && <span className="flex-1 truncate">{label}</span>}
        {count > 0 && (
          <span className={cx("rounded-full bg-danger px-1.5 text-2xs font-semibold leading-4 text-white tabular-nums", collapsed && "absolute right-1 top-0.5 px-1")}>
            {count > 99 ? "99+" : count}
          </span>
        )}
        {collapsed && (
          <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg shadow-pop group-hover:block group-focus-visible:block" role="tooltip">
            {label}
          </span>
        )}
      </Link>
    );
  };
  return (
    <div className="flex h-full flex-col">
      <div className={cx("flex h-14 items-center border-b border-border px-3", collapsed ? "justify-center" : "justify-between")}>
        <Link href="/dashboard" className="flex items-center gap-2 text-fg" aria-label="ObserveMetrics home">
          <LogoMark size={24} />
          {!collapsed && <span className="text-[15px] font-semibold tracking-tight">ObserveMetrics</span>}
        </Link>
        {onClose && <Button variant="ghost" onClick={onClose} aria-label="Close navigation" icon={<X size={16} />} />}
      </div>
      <div className="px-2 pt-3">
        <WorkspaceSwitcher collapsed={collapsed} />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3" aria-label="Main">
        {NAV.map((n) => (
          <Item key={n.href} {...n} />
        ))}
        <div className="my-2 border-t border-border" role="separator" />
        <Item href="/dashboard/requests" label="Requests" icon={Search} />
        <Item href="/dashboard/settings" label="Settings" icon={Settings} />
      </nav>
      <div className="space-y-0.5 border-t border-border px-2 py-2">
        <Link href="/docs" className={cx("flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-muted hover:bg-surface-2 hover:text-fg", collapsed && "justify-center px-0")} aria-label={collapsed ? "Help & docs" : undefined}>
          <LifeBuoy size={16} aria-hidden />
          {!collapsed && "Help & docs"}
        </Link>
        <UserMenu collapsed={collapsed} />
        {onToggle && (
          <button onClick={onToggle} className={cx("flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm text-faint hover:bg-surface-2 hover:text-fg", collapsed && "justify-center px-0")} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            {!collapsed && "Collapse"}
          </button>
        )}
      </div>
    </div>
  );
}

function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { me, switchWorkspace } = useMe();
  const router = useRouter();
  const toast = useToast();
  const ws = me.workspace;
  const [opening, setOpening] = useState(false);
  const openDemo = async () => {
    setOpening(true);
    try {
      await api("/api/v1/demo/start", { body: {} });
      clearApiCache();
      window.location.assign("/dashboard");
    } catch (e) {
      toast({ tone: "error", title: "Couldn't open the demo", body: (e as Error).message });
    } finally {
      setOpening(false);
    }
  };
  return (
    <Popover
      label="Switch workspace"
      align="start"
      width="w-60"
      trigger={({ toggle, ref, ...aria }) => (
        <button
          ref={ref}
          onClick={toggle}
          {...aria}
          className={cx("flex h-10 w-full items-center gap-2 rounded-md border border-border bg-surface-2/50 px-2 text-left transition-colors hover:border-border-strong", collapsed && "justify-center px-0")}
          aria-label={`Workspace: ${ws?.name ?? "none"}. Switch workspace`}
        >
          <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded text-2xs font-semibold", ws?.isDemo ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent")}>
            {initials(ws?.name)}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{ws?.name}</span>
                <span className="block text-2xs capitalize text-faint">{ws?.isDemo ? "Demo workspace" : ws?.role.toLowerCase()}</span>
              </span>
              <ChevronsUpDown size={14} className="text-faint" aria-hidden />
            </>
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <p className="px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-faint">Workspaces</p>
          {me.workspaces.map((w) => (
            <MenuItem
              key={w.id}
              role="menuitemradio"
              active={w.id === ws?.id}
              icon={w.id === ws?.id ? <Check size={14} /> : <span className="inline-block w-3.5" />}
              onSelect={() => {
                close();
                if (w.id !== ws?.id) void switchWorkspace(w.id);
              }}
            >
              {w.name}
            </MenuItem>
          ))}
          <div className="my-1 border-t border-border" />
          {!me.workspaces.some((w) => w.isDemo) && (
            <MenuItem
              icon={<FlaskConical size={14} />}
              onSelect={() => {
                close();
                void openDemo();
              }}
            >
              {opening ? "Opening demo…" : "Explore demo data"}
            </MenuItem>
          )}
          {!me.user.isGuest && (
            <MenuItem
              icon={<Plus size={14} />}
              onSelect={() => {
                close();
                router.push("/onboarding?new=1");
              }}
            >
              Create workspace
            </MenuItem>
          )}
        </>
      )}
    </Popover>
  );
}

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { me } = useMe();
  const { pref, setPref } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const signOut = async () => {
    try {
      await api("/api/v1/auth/signout", { body: {} });
      clearApiCache();
      router.push("/signin");
      router.refresh();
    } catch (e) {
      toast({ tone: "error", title: "Sign out failed", body: (e as Error).message });
    }
  };
  return (
    <Popover
      label="Account"
      align="start"
      width="w-60"
      trigger={({ toggle, ref, ...aria }) => (
        <button ref={ref} onClick={toggle} {...aria} className={cx("flex h-10 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-surface-2", collapsed && "justify-center px-0")} aria-label="Account menu">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-2xs font-semibold">{initials(me.user.name, me.user.email)}</span>
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{me.user.name ?? "Account"}</span>
              <span className="block truncate text-2xs text-faint">{me.user.email}</span>
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <p className="px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-faint">Theme</p>
          {(
            [
              ["light", "Light", Sun],
              ["dark", "Dark", Moon],
              ["system", "System", Monitor],
            ] as const
          ).map(([k, l, I]) => (
            <MenuItem key={k} role="menuitemradio" active={pref === k} icon={<I size={14} />} onSelect={() => setPref(k)}>
              {l}
            </MenuItem>
          ))}
          <div className="my-1 border-t border-border" />
          {!me.user.isGuest && (
            <MenuItem
              icon={<Settings size={14} />}
              onSelect={() => {
                close();
                router.push("/dashboard/settings/security");
              }}
            >
              Account & security
            </MenuItem>
          )}
          <MenuItem
            icon={<BookOpen size={14} />}
            onSelect={() => {
              close();
              router.push("/docs");
            }}
          >
            Documentation
          </MenuItem>
          <MenuItem
            icon={<Bell size={14} />}
            onSelect={() => {
              close();
              router.push("/dashboard/settings/notifications");
            }}
          >
            Notification settings
          </MenuItem>
          <div className="my-1 border-t border-border" />
          <MenuItem icon={<LogOut size={14} />} onSelect={() => void signOut()}>
            {me.user.isGuest ? "Exit demo" : "Sign out"}
          </MenuItem>
        </>
      )}
    </Popover>
  );
}
