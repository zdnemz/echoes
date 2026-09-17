/**
 * The Echoes wordmark — three offset arcs radiating from a dot: a voice and
 * its echoes. Stroke weight matches the icon system (1.5).
 */

export function EchoMark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="6.5" cy="12" r="1.9" fill="currentColor" />
      <path d="M10.2 8.2a5.6 5.6 0 0 1 0 7.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14 5.6a9.4 9.4 0 0 1 0 12.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M17.8 3a13.2 13.2 0 0 1 0 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  )
}

export function Wordmark({ className = '', onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${onDark ? 'text-background' : 'text-foreground'} ${className}`}>
      <span
        className={`grid place-items-center border-2 ${onDark ? 'border-background bg-background text-foreground' : 'border-foreground bg-foreground text-background'}`}
      >
        <EchoMark className="h-[1.15em] w-[1.15em]" />
      </span>
      <span className="font-mono text-[1.06em] font-black uppercase leading-none tracking-tight">Echoes</span>
    </span>
  )
}
