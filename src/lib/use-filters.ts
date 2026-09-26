"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export const FILTER_KEYS = ["range", "from", "to", "provider", "team", "app", "model"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

/**
 * Dashboard filters live in the URL so views are shareable and survive
 * reloads. Returns the current values and a query string for API calls.
 */
export function useFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const values = useMemo(() => {
    const v: Partial<Record<FilterKey, string>> = {};
    for (const k of FILTER_KEYS) {
      const x = sp.get(k);
      if (x) v[k] = x;
    }
    return v;
  }, [sp]);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    for (const k of FILTER_KEYS) if (values[k]) q.set(k, values[k]!);
    return q.toString();
  }, [values]);

  const set = useCallback(
    (patch: Partial<Record<FilterKey, string | null>>) => {
      const q = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") q.delete(k);
        else q.set(k, v);
      }
      if (patch.range) {
        q.delete("from");
        q.delete("to");
      }
      const s = q.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [sp, router, pathname],
  );

  return { values, query, set, range: values.range ?? (values.from ? "custom" : "30d") };
}

/** Carry the current date range when linking to another dashboard page. */
export function withRange(href: string, values: Partial<Record<FilterKey, string>>) {
  const q = new URLSearchParams();
  for (const k of ["range", "from", "to"] as const) if (values[k]) q.set(k, values[k]!);
  const s = q.toString();
  if (!s) return href;
  return href + (href.includes("?") ? "&" : "?") + s;
}
