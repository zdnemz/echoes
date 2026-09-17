import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Offline',
  robots: { index: false, follow: false },
}

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 font-mono text-center text-foreground">
      <div className="w-full max-w-md border-2 border-foreground bg-background p-6 shadow-brutal sm:p-8">
        <h1 className="font-display text-3xl uppercase">You&rsquo;re offline</h1>
        <p className="mt-3 border-l-4 border-accent pl-3 text-left text-sm font-bold leading-relaxed">
          Echoes couldn&rsquo;t reach the server and nothing is cached on this device yet. Reconnect and your journal
          will load — entries written offline are queued and sync automatically.
        </p>
      </div>
    </div>
  )
}
