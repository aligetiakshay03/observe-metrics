import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <LogoMark size={40} className="mx-auto" />
        <p className="mt-6 font-mono text-xs text-faint">404</p>
        <h1 className="mt-1 text-xl font-semibold">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-sm text-muted">The link may be broken, or the page may have moved.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/dashboard" className="btn btn-primary">
            Go to dashboard
          </Link>
          <Link href="/" className="btn btn-secondary">
            Home
          </Link>
          <Link href="/docs" className="btn btn-ghost">
            Docs
          </Link>
        </div>
      </div>
    </main>
  );
}
