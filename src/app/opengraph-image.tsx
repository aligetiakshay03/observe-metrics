import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ObserveMetrics — AI Usage & Cost Intelligence";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0B0C10", color: "#F5F7FA", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="56" height="56" viewBox="0 0 32 32" fill="none">
            <path d="M26.34 12.24A11 11 0 1 1 19.76 5.66" stroke="#F5F7FA" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M9.25 17.25h3.1l2.15-5 3.1 8.5 2.05-4.25h3.1" stroke="#F5F7FA" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="23.78" cy="8.22" r="2.35" fill="#7C74FF" />
          </svg>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>
            Observe<span style={{ color: "#98A2B3" }}>Metrics</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 22, letterSpacing: 4, color: "#7C74FF", fontWeight: 700 }}>AI USAGE &amp; COST INTELLIGENCE</div>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2, marginTop: 18, maxWidth: 980 }}>Know exactly what your AI is costing you.</div>
          <div style={{ fontSize: 34, color: "#98A2B3", marginTop: 16 }}>Then find where to optimize it.</div>
        </div>
        <div style={{ display: "flex", gap: 40, fontSize: 24, color: "#98A2B3" }}>
          <span>Track.</span>
          <span>Understand.</span>
          <span>Optimize.</span>
        </div>
      </div>
    ),
    size,
  );
}
