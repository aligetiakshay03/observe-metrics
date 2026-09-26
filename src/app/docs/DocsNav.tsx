"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cx } from "@/components/ui/primitives";

export const DOCS_NAV = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/quickstart", label: "Quickstart" },
  { href: "/docs/providers", label: "Providers" },
  { href: "/docs/sdk", label: "Ingestion API & SDK" },
  { href: "/docs/security", label: "Security" },
];

export function DocsNav() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <>
      <div className="mb-6 lg:hidden">
        <label htmlFor="docs-nav" className="sr-only">
          Documentation section
        </label>
        <select id="docs-nav" className="select" value={pathname} onChange={(e) => router.push(e.target.value)}>
          {DOCS_NAV.map((n) => (
            <option key={n.href} value={n.href}>
              {n.label}
            </option>
          ))}
        </select>
      </div>
      <nav className="sticky top-20 hidden w-52 shrink-0 lg:block" aria-label="Documentation">
        <p className="mb-2 px-2 text-2xs font-semibold uppercase tracking-wide text-faint">Documentation</p>
        <ul className="space-y-0.5">
          {DOCS_NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cx("block rounded-md px-2 py-1.5 text-sm transition-colors", active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-2 hover:text-fg")}
                >
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
