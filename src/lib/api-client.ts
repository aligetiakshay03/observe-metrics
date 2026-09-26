"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

const FRIENDLY: Record<string, string> = {
  network: "Couldn't reach ObserveMetrics. Check your connection and try again.",
};

/** JSON fetch against our API. Throws ApiClientError with a user-safe message. */
export async function api<T>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiClientError("network", FRIENDLY.network!, 0);
  }
  let json: { ok?: boolean; data?: T; error?: { code: string; message: string; fields?: Record<string, string> } } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok || !json?.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !path.includes("/auth/")) {
      const next = window.location.pathname + window.location.search;
      window.location.href = `/signin?next=${encodeURIComponent(next)}`;
    }
    throw new ApiClientError(json?.error?.code ?? "internal", json?.error?.message ?? `Request failed (HTTP ${res.status}).`, res.status, json?.error?.fields);
  }
  return json.data as T;
}

// Small in-memory cache so navigating back to a page renders instantly
// while it revalidates.
const cache = new Map<string, unknown>();

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(() => (path ? (cache.get(path) as T | undefined) : undefined));
  const [error, setError] = useState<ApiClientError | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path && !cache.has(path));
  const [validating, setValidating] = useState(false);
  const pathRef = useRef(path);
  pathRef.current = path;

  const load = useCallback(async (p: string, signal?: AbortSignal) => {
    setValidating(true);
    try {
      const d = await api<T>(p, { signal });
      cache.set(p, d);
      if (pathRef.current === p) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      if (pathRef.current === p) setError(e instanceof ApiClientError ? e : new ApiClientError("internal", "Something went wrong.", 500));
    } finally {
      if (pathRef.current === p) {
        setLoading(false);
        setValidating(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!path) return;
    const ctrl = new AbortController();
    const cached = cache.get(path) as T | undefined;
    setData(cached);
    setLoading(cached === undefined);
    setError(null);
    void load(path, ctrl.signal);
    return () => ctrl.abort();
  }, [path, load]);

  const refresh = useCallback(() => (pathRef.current ? load(pathRef.current) : Promise.resolve()), [load]);
  return { data, error, loading, validating, refresh, mutate: setData };
}

/** Drop cached responses (e.g. after switching workspace). */
export function clearApiCache(prefix?: string) {
  if (!prefix) return cache.clear();
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}

/** Download a CSV export via fetch so failures surface as errors, not blank tabs. */
export async function downloadExport(dataset: string, query: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/exports/${dataset}?${query}`, { credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiClientError("network", FRIENDLY.network!, 0);
  }
  if (!res.ok) {
    let message = `Export failed (HTTP ${res.status}).`;
    try {
      message = (await res.json()).error?.message ?? message;
    } catch {
      /* ignore */
    }
    throw new ApiClientError("export_failed", message, res.status);
  }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(cd)?.[1] ?? `${dataset}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
