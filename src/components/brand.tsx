/**
 * The Echoes neo-brutalist wordmark and mark:
 * Stepped geometric sound waves radiating from a solid origin block.
 * Sharp 90° corners, heavy strokes, and an accent pulse.
 */

export function EchoMark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      {/* Origin sound block */}
      <rect x="3" y="10" width="3.5" height="4" fill="currentColor" />
      {/* Wave 1 */}
      <path
        d="M9.5 7.5 H12 V16.5 H9.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      {/* Wave 2 */}
      <path
        d="M15 5 H17.5 V19 H15"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      {/* Wave 3 (Accent) */}
      <path
        d="M20 2.5 H22 V21.5 H20"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  )
}

export function Wordmark({ className = '', onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${onDark ? 'text-background' : 'text-foreground'} ${className}`}>
      <span
        className={`flex h-8 w-8 items-center justify-center border-2 ${
          onDark
            ? 'border-background bg-background text-foreground shadow-[2px_2px_0_#ff3b00]'
            : 'border-foreground bg-foreground text-background shadow-[2px_2px_0_#ff3b00]'
        }`}
      >
        <EchoMark className="h-4.5 w-4.5" />
      </span>
      <span className="flex items-center font-mono text-[1.1em] font-black uppercase tracking-tight">
        Echoes
        <span className="ml-0.5 text-accent">.</span>
      </span>
    </span>
  )
}
