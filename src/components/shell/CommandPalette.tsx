"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AppWindow, Boxes, FileText, Lightbulb, Search, User, Users } from "lucide-react";
import { api } from "@/lib/api-client";
import type { SearchResult } from "@/lib/types";
import { cx, Spinner } from "../ui/primitives";

const ICONS: Record<SearchResult["type"], typeof Search> = {
  model: Boxes,
  team: Users,
  application: AppWindow,
  user: User,
  insight: Lightbulb,
  page: FileText,
};

/** ⌘K global search across models, teams, applications, users and insights. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    input.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const d = await api<{ results: SearchResult[] }>(`/api/v1/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        setResults(d.results);
        setError(null);
        setActive(0);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 140);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  if (!open) return null;
  const go = (r: SearchResult) => {
    onClose();
    router.push(r.href);
  };
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-start justify-center p-3 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} aria-hidden />
      <div className="card relative w-full max-w-xl animate-pop-in overflow-hidden shadow-pop">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search size={16} className="text-faint" aria-hidden />
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              }
              if (e.key === "Enter" && results[active]) go(results[active]!);
            }}
            placeholder="Search models, teams, applications, users, insights…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={results[active] ? `cmdk-${active}` : undefined}
          />
          {loading && <Spinner size={14} />}
          <span className="kbd">Esc</span>
        </div>
        <ul id="cmdk-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
          {error && <li className="px-3 py-6 text-center text-sm text-danger">{error}</li>}
          {!error && !loading && results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No matches for “{q}”.</li>}
          {results.map((r, i) => {
            const Icon = ICONS[r.type];
            return (
              <li key={`${r.type}:${r.id}`} id={`cmdk-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r)}
                  className={cx("flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left", i === active ? "bg-surface-2" : "")}
                >
                  <Icon size={15} className="shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-muted">{r.subtitle}</span>
                  </span>
                  <span className="text-2xs capitalize text-faint">{r.type}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
