/**
 * ObserveMetrics mark: an open observation ring (the "O"), a signal pulse
 * passing through it, and a single observed data point sitting in the ring's
 * gap. Drawn on a 32×32 grid with 2.5px strokes so it holds up at 16px.
 *
 * Colors: the ring and pulse use `currentColor` (ink); the point uses the
 * accent. `mono` renders everything in currentColor.
 */

export const MARK_PATHS = {
  ring: "M26.34 12.24A11 11 0 1 1 19.76 5.66",
  pulse: "M9.25 17.25h3.1l2.15-5 3.1 8.5 2.05-4.25h3.1",
  point: { cx: 23.78, cy: 8.22, r: 2.35 },
} as const;

export function LogoMark({ size = 24, mono = false, className = "", title }: { size?: number; mono?: boolean; className?: string; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path d={MARK_PATHS.ring} stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
      <path d={MARK_PATHS.pulse} stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
      <circle {...MARK_PATHS.point} fill={mono ? "currentColor" : "var(--accent)"} />
    </svg>
  );
}

/** App-icon style: mark knocked out of a rounded ink tile. */
export function LogoTile({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[7px] bg-fg text-bg ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <LogoMark size={Math.round(size * 0.78)} />
    </span>
  );
}

export function Logo({ size = 24, className = "", showWordmark = true }: { size?: number; className?: string; showWordmark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 text-fg ${className}`}>
      <LogoMark size={size} title={showWordmark ? undefined : "ObserveMetrics"} />
      {showWordmark && (
        <span className="text-[15px] font-semibold tracking-[-0.02em]" style={{ fontSize: Math.max(13, size * 0.64) }}>
          Observe<span className="text-muted">Metrics</span>
        </span>
      )}
    </span>
  );
}
