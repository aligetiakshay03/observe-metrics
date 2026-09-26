/**
 * Theme colors are CSS variables (light/dark swap at runtime). Expressing them
 * as functions lets Tailwind opacity modifiers (bg-surface-2/60) work via
 * color-mix().
 */
const v = (name) => ({ opacityValue }) =>
  opacityValue === undefined || opacityValue === "1"
    ? `var(--${name})`
    : `color-mix(in srgb, var(--${name}) calc(${opacityValue} * 100%), transparent)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        "surface-3": v("surface-3"),
        border: v("border"),
        "border-strong": v("border-strong"),
        fg: v("text"),
        muted: v("muted"),
        faint: v("faint"),
        accent: v("accent"),
        "accent-hover": v("accent-hover"),
        "accent-soft": v("accent-soft"),
        "accent-fg": v("accent-fg"),
        success: v("success"),
        "success-soft": v("success-soft"),
        warning: v("warning"),
        "warning-soft": v("warning-soft"),
        danger: v("danger"),
        "danger-soft": v("danger-soft"),
        "st-good": v("st-good"),
        "st-warning": v("st-warning"),
        "st-critical": v("st-critical"),
        "chart-axis": v("chart-axis"),
        c1: v("c1"),
        c2: v("c2"),
        c3: v("c3"),
        c4: v("c4"),
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", "16px"],
        xs: ["12px", "16px"],
        sm: ["13px", "20px"],
        base: ["14px", "22px"],
      },
      borderRadius: { DEFAULT: "6px", md: "6px", lg: "8px", xl: "10px" },
      boxShadow: {
        xs: "0 1px 2px rgb(16 24 40 / 0.04)",
        sm: "0 1px 3px rgb(16 24 40 / 0.06), 0 1px 2px rgb(16 24 40 / 0.03)",
        pop: "0 8px 24px -4px rgb(16 24 40 / 0.12), 0 2px 6px rgb(16 24 40 / 0.06)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": { from: { opacity: "0", transform: "translateY(4px) scale(0.98)" }, to: { opacity: "1", transform: "none" } },
        "slide-in": { from: { transform: "translateX(-100%)" }, to: { transform: "none" } },
        "page-in": { from: { opacity: "0", transform: "translateY(3px)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        shimmer: "shimmer 1.4s infinite",
        "fade-in": "fade-in 150ms ease-out",
        "pop-in": "pop-in 140ms cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in": "slide-in 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        "page-in": "page-in 220ms ease-out",
      },
    },
  },
  plugins: [],
};
