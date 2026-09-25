"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// ── Session context ──

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role?: string;
  team?: string | null;
  limits?: {
    maxProviders: number;
    maxMembers: number;
    retentionDays: number;
    budgets: boolean;
    exports: boolean;
    features: string[];
  };
}

export interface Me {
  billingEnabled: boolean;
  user: { id: string; name: string | null; email: string; avatarUrl: string | null };
  organizations: OrgSummary[];
  activeOrg: OrgSummary | null;
}

interface SessionCtx {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setActiveOrg: (orgId: string) => Promise<void>;
}

const SessionContext = createContext<SessionCtx>({
  me: null,
  loading: true,
  refresh: async () => {},
  setActiveOrg: async () => {},
});

export const useSession = () => useContext(SessionContext);

export function Providers({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/me", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setMe(json.data ?? null);
      } else {
        setMe(null);
      }
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const setActiveOrg = useCallback(
    async (orgId: string) => {
      document.cookie = "om_active_org=" + orgId + "; path=/; max-age=" + 60 * 60 * 24 * 365;
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── Theme ──
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const stored = localStorage.getItem("om-theme");
    const initial =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("om-theme", next);
      document.documentElement.classList.toggle("dark", next === "dark");
      return next;
    });
  }, []);

  const themeCtx = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  const sessionCtx = useMemo(
    () => ({ me, loading, refresh, setActiveOrg }),
    [me, loading, refresh, setActiveOrg],
  );

  return (
    <ThemeContext.Provider value={themeCtx}>
      <SessionContext.Provider value={sessionCtx}>{children}</SessionContext.Provider>
    </ThemeContext.Provider>
  );
}

// ── Theme context ──

interface ThemeCtx {
  theme: "light" | "dark";
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeCtx>({ theme: "light", toggleTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);
