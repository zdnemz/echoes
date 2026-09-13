/**
 * Paper grain — a fixed, pointer-events-none overlay. Applied once per page,
 * never inside scrolling containers, so it costs nothing to repaint.
 * The noise is an inline SVG (feTurbulence), so it renders identically on
 * server and client — no hydration surface.
 */

export function Grain({ opacity = 0.035 }: { opacity?: number }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1] mix-blend-multiply" style={{ opacity }}>
      <svg xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
        <filter id="echoes-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#echoes-grain)" />
      </svg>
    </div>
  )
}
