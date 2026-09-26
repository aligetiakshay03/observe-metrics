"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader, cx } from "@/components/ui/primitives";

const TABS = [
  { href: "/dashboard/settings/workspace", label: "Workspace" },
  { href: "/dashboard/settings/providers", label: "Providers" },
  { href: "/dashboard/settings/team", label: "Team" },
  { href: "/dashboard/settings/notifications", label: "Notifications" },
  { href: "/dashboard/settings/security", label: "Security" },
  { href: "/dashboard/settings/data", label: "Data" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <PageHeader title="Settings" description="Manage your workspace, provider connections, team, notifications and security." />
      <nav aria-label="Settings sections" className="-mx-3 mb-5 overflow-x-auto border-b border-border px-3 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1">
          {TABS.map((t) => {
            const active = pathname === t.href || pathname.startsWith(t.href + "/");
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "-mb-px inline-flex h-9 items-center border-b-2 px-3 text-sm transition-colors",
                    active ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg",
                  )}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </div>
  );
}
