import Link from "next/link";
import { Activity, Lightbulb, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

/** Two-column auth layout: form on the left, a compact value panel on the right (desktop). */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 min-h-screen lg:grid-cols-[1fr_minmax(420px,0.9fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-8">
        <Link href="/" className="self-start" aria-label="ObserveMetrics home">
          <Logo size={24} />
        </Link>
        <main id="main" className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-10">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
        </main>
        <p className="text-center text-xs text-faint lg:text-left">
          <Link href="/docs/security" className="hover:text-muted">Security</Link> · <Link href="/docs" className="hover:text-muted">Docs</Link> · Free during launch
        </p>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-border bg-surface lg:flex lg:flex-col lg:justify-center lg:px-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
          aria-hidden
        />
        <div className="relative max-w-md">
          <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-accent">Track. Understand. Optimize.</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">Every model, token, dollar and millisecond in one place.</h2>
          <ul className="mt-8 space-y-4 text-sm">
            {[
              { icon: Activity, t: "Unified usage", b: "OpenAI, Anthropic, Google Gemini and Mistral, attributed to teams and applications." },
              { icon: Lightbulb, t: "Explained insights", b: "Anomalies and optimizations with evidence, cause and a recommended action." },
              { icon: ShieldCheck, t: "Keys stay server-side", b: "Credentials are encrypted and never returned to the browser." },
            ].map((x) => (
              <li key={x.t} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2">
                  <x.icon size={15} aria-hidden />
                </span>
                <span>
                  <span className="block font-medium">{x.t}</span>
                  <span className="block text-muted">{x.b}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-10 grid grid-cols-3 gap-2 rounded-lg border border-border bg-bg/60 p-3 text-center" aria-label="Sample metrics">
            {[
              ["AI spend", "$4,182.50"],
              ["Requests", "128,902"],
              ["Avg latency", "1.84s"],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-2xs uppercase tracking-wide text-muted">{k}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-2xs text-faint">Sample workspace figures.</p>
        </div>
      </aside>
    </div>
  );
}

export function GoogleButton() {
  return (
    <>
      <a href="/api/v1/auth/google" className="btn btn-secondary btn-lg w-full">
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.2 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        Continue with Google
      </a>
      <div className="my-5 flex items-center gap-3 text-xs text-faint">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}

/** Only allow same-site relative redirects. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
