import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Offline',
  robots: { index: false, follow: false },
}

/**
 * Last-resort shell: served by the service worker only when the device is
 * offline and no cached navigation document exists yet. In practice the
 * network-first navigation handler already has `/journal` cached, so this
 * exists so the precache list (`CORE_URLS` in sw.js) resolves cleanly.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="font-newsreader text-3xl text-foreground">You&rsquo;re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Echoes couldn&rsquo;t reach the server and nothing is cached on this device yet. Reconnect and your journal will
        load — entries written offline are queued and sync automatically.
      </p>
    </div>
  )
}
