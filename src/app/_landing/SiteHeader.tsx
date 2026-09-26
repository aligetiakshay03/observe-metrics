"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, Monitor, Moon, Sun, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/primitives";
import { useTheme } from "@/components/providers/ThemeProvider";

const LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#solutions", label: "Solutions" },
  { href: "/docs", label: "Docs" },
];

export function ThemeToggle() {
  const { pref, setPref } = useTheme();
  const next = pref === "light" ? "dark" : pref === "dark" ? "system" : "light";
  const Icon = pref === "light" ? Sun : pref === "dark" ? Moon : Monitor;
  return <Button variant="ghost" onClick={() => setPref(next)} aria-label={`Theme: ${pref}. Switch to ${next}`} icon={<Icon size={16} />} />;
}

/** Public site header (landing + docs). */
export function SiteHeader({ authed }: { authed: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="ObserveMetrics home">
          <Logo size={24} />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <ThemeToggle />
          {authed ? (
            <Link href="/dashboard" className="btn btn-primary">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/signin" className="btn btn-ghost">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Start free
              </Link>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <Button variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"} icon={open ? <X size={18} /> : <Menu size={18} />} />
        </div>
      </div>
      {open && (
        <div id="mobile-nav" className="animate-fade-in border-t border-border bg-surface px-4 py-3 md:hidden">
          <nav className="flex flex-col" aria-label="Mobile">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-md px-2 py-2.5 text-sm font-medium hover:bg-surface-2">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
            {authed ? (
              <Link href="/dashboard" className="btn btn-primary col-span-2">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link href="/signin" className="btn btn-secondary">
                  Sign in
                </Link>
                <Link href="/signup" className="btn btn-primary">
                  Start free
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <Logo size={22} />
          <p className="mt-3 text-sm text-muted">AI usage & cost intelligence. Track. Understand. Optimize.</p>
        </div>
        <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm sm:grid-cols-3">
          <div className="space-y-2">
            <p className="text-2xs font-medium uppercase tracking-wide text-faint">Product</p>
            <Link href="/#product" className="block text-muted hover:text-fg">Overview</Link>
            <Link href="/demo" className="block text-muted hover:text-fg">Live demo</Link>
            <Link href="/signup" className="block text-muted hover:text-fg">Start free</Link>
          </div>
          <div className="space-y-2">
            <p className="text-2xs font-medium uppercase tracking-wide text-faint">Docs</p>
            <Link href="/docs/quickstart" className="block text-muted hover:text-fg">Quickstart</Link>
            <Link href="/docs/providers" className="block text-muted hover:text-fg">Providers</Link>
            <Link href="/docs/sdk" className="block text-muted hover:text-fg">Ingestion API</Link>
          </div>
          <div className="space-y-2">
            <p className="text-2xs font-medium uppercase tracking-wide text-faint">Company</p>
            <Link href="/docs/security" className="block text-muted hover:text-fg">Security</Link>
            <Link href="/signin" className="block text-muted hover:text-fg">Sign in</Link>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[1200px] border-t border-border px-4 py-4 text-xs text-faint sm:px-6">© {new Date().getFullYear()} ObserveMetrics. Free during launch.</div>
    </footer>
  );
}
