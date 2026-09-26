/** Formatting helpers shared by server-generated text and the UI. */

export function fmtUsd(v: number | null | undefined, opts: { dp?: number; compact?: boolean } = {}): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (opts.compact && abs >= 10_000) {
    return (v < 0 ? "-" : "") + "$" + fmtCompact(abs);
  }
  const dp = opts.dp ?? (abs > 0 && abs < 1 ? (abs < 0.01 ? 4 : 3) : 2);
  return (v < 0 ? "-$" : "$") + abs.toLocaleString("en-US", { minimumFractionDigits: Math.min(dp, 2), maximumFractionDigits: dp });
}

export function fmtUsd0(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
}

export function fmtNumber(v: number | null | undefined, dp = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: dp, minimumFractionDigits: dp });
}

export function fmtCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [n, s] of units) {
    if (abs >= n) {
      const x = abs / n;
      return sign + (x >= 100 ? Math.round(x).toString() : x.toFixed(x >= 10 ? 1 : 2).replace(/\.?0+$/, "")) + s;
    }
  }
  return sign + (abs % 1 === 0 ? abs.toString() : abs.toFixed(1));
}

/** Ratio (0..1) → "0.42%". */
export function fmtRate(v: number | null | undefined, dp = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return (v * 100).toFixed(dp) + "%";
}

/** Percent change value (e.g. 12.4) → "+12.4%". */
export function fmtChange(v: number | null | undefined, dp = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(dp);
  return (v > 0 ? "+" : "") + s + "%";
}

export function fmtMs(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1000) return (v / 1000).toFixed(2) + "s";
  return Math.round(v) + "ms";
}

export function fmtDate(iso: string | Date, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  const d = typeof iso === "string" ? new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso) : iso;
  return d.toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
}

export function fmtDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function fmtRelative(iso: string | Date | null | undefined): string {
  if (!iso) return "Never";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diff = Date.now() - d.getTime();
  const future = diff < 0;
  const s = Math.abs(diff) / 1000;
  const fmt = (n: number, unit: string) => {
    const v = Math.max(1, Math.floor(n));
    return future ? `in ${v}${unit}` : `${v}${unit} ago`;
  };
  if (s < 45) return future ? "in a moment" : "just now";
  if (s < 3600) return fmt(s / 60, "m");
  if (s < 86400) return fmt(s / 3600, "h");
  if (s < 86400 * 30) return fmt(s / 86400, "d");
  return fmtDate(d, { month: "short", day: "numeric", year: "numeric" });
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  mistral: "Mistral",
};

export function providerLabel(p: string | null | undefined): string {
  if (!p) return "—";
  return PROVIDER_LABELS[p] ?? p.charAt(0).toUpperCase() + p.slice(1);
}

/** Categorical provider palette (validated for light and dark surfaces). */
export const PROVIDER_COLORS: Record<string, string> = {
  openai: "var(--c1)",
  anthropic: "var(--c2)",
  google: "var(--c3)",
  mistral: "var(--c4)",
};

export function providerColor(p: string, i = 0): string {
  return PROVIDER_COLORS[p] ?? `var(--c${(i % 6) + 1})`;
}

/** "claude-sonnet-4-6" → "Claude Sonnet 4.6", "gpt-4.1-mini" → "GPT-4.1 mini". */
export function prettyModel(model: string): string {
  const m = model.toLowerCase();
  if (m.startsWith("claude-")) {
    const parts = m.slice(7).split("-");
    const name: string[] = [];
    const ver: string[] = [];
    for (const p of parts) (/^\d+$/.test(p) ? ver : name).push(p);
    return ["Claude", ...name.map(cap), ver.join(".")].filter(Boolean).join(" ");
  }
  if (m.startsWith("gpt-")) {
    const [, ...rest] = m.split("-");
    const [ver, ...tail] = rest;
    return `GPT-${ver}${tail.length ? " " + tail.join(" ") : ""}`;
  }
  if (m.startsWith("gemini-")) {
    return "Gemini " + m.slice(7).split("-").map((p) => (/^\d/.test(p) ? p : cap(p))).join(" ");
  }
  if (m.startsWith("mistral-") || m.startsWith("codestral")) {
    return m
      .split("-")
      .filter((p) => p !== "latest")
      .map(cap)
      .join(" ");
  }
  if (m.startsWith("text-embedding")) return m;
  return model;
}

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export function initials(name: string | null | undefined, email?: string): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}
