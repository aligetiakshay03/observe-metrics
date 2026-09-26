"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";

const ThemeCtx = createContext<{ pref: ThemePref; resolved: "light" | "dark"; setPref: (p: ThemePref) => void }>({
  pref: "system",
  resolved: "light",
  setPref: () => {},
});

export const useTheme = () => useContext(ThemeCtx);

/** Runs before paint (inlined in <head>) so there's no flash of the wrong theme. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('om-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();`;

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    let stored: ThemePref = "system";
    try {
      const t = localStorage.getItem("om-theme");
      if (t === "light" || t === "dark") stored = t;
    } catch {
      /* storage unavailable */
    }
    setPrefState(stored);
    setResolved(stored === "system" ? (systemDark() ? "dark" : "light") : stored);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setPrefState((p) => {
      if (p === "system") setResolved(mq.matches ? "dark" : "light");
      return p;
    });
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    const root = document.documentElement;
    if (p === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", p);
    setResolved(p === "system" ? (systemDark() ? "dark" : "light") : p);
    try {
      if (p === "system") localStorage.removeItem("om-theme");
      else localStorage.setItem("om-theme", p);
    } catch {
      /* ignore */
    }
  }, []);

  return <ThemeCtx.Provider value={{ pref, resolved, setPref }}>{children}</ThemeCtx.Provider>;
}
