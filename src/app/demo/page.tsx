"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/primitives";
import { api, clearApiCache } from "@/lib/api-client";

const STAGES = ["Creating Helix Labs demo workspace", "Generating 12 months of usage", "Running the insight engine", "Preparing your dashboard"];

/** Launches the demo workspace (guest account for anonymous visitors), then opens the dashboard. */
export default function DemoPage() {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState(0);

  const start = useCallback(async () => {
    setError(null);
    setStage(0);
    const timer = setInterval(() => setStage((s) => Math.min(STAGES.length - 1, s + 1)), 1400);
    try {
      await api("/api/v1/demo/start", { body: {} });
      clearApiCache();
      setStage(STAGES.length - 1);
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearInterval(timer);
    }
  }, [router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
  }, [start]);

  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <LogoMark size={40} className="mx-auto" />
        {error ? (
          <div role="alert" className="mt-6">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-danger-soft text-danger">
              <AlertTriangle size={18} aria-hidden />
            </div>
            <h1 className="mt-3 text-lg font-semibold">Couldn&apos;t open the demo</h1>
            <p className="mt-1 text-sm text-muted">{error}</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="primary" icon={<RefreshCw size={14} />} onClick={() => void start()}>
                Try again
              </Button>
              <Link href="/" className="btn btn-secondary">
                Back home
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6" aria-live="polite" aria-busy="true">
            <h1 className="text-lg font-semibold">Preparing your demo workspace…</h1>
            <p className="mt-1 text-sm text-muted">Helix Labs is a fictional company. Everything you&apos;ll see is generated sample data.</p>
            <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${((stage + 1) / STAGES.length) * 100}%` }} />
            </div>
            <ul className="mt-5 space-y-2 text-left text-sm">
              {STAGES.map((s, i) => (
                <li key={s} className={i <= stage ? "text-fg" : "text-faint"}>
                  <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${i < stage ? "bg-success" : i === stage ? "animate-pulse bg-accent" : "bg-border-strong"}`} aria-hidden />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
