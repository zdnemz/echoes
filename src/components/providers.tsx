'use client'

/**
 * Client-side providers for the whole app.
 * Session state lives here (hydration-safe: restored in an effect, never
 * during first render, so server and client markup always agree).
 */

import { useState, type ReactNode } from 'react'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { Toaster } from 'sonner'
import { SessionProvider } from '@/lib/auth/session'
import { OutboxSyncBridge } from '@/components/pwa/outbox-sync-bridge'
import { idbPersister } from '@/lib/offline/query-persister'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 30_000,
            networkMode: 'offlineFirst',
          },
          mutations: {
            networkMode: 'offlineFirst',
          },
        },
      }),
  )

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: idbPersister,
        maxAge: Infinity,
        dehydrateOptions: {
          // Keep any query that still holds data, not just the ones currently
          // 'success'. Offline, a refetch that fails flips the query to 'error'
          // while the cached rows survive in memory — and the default filter
          // would drop exactly those rows from the persisted snapshot. One
          // offline error in a session would then erase the cache, so the next
          // cold start showed nothing until the network came back.
          shouldDehydrateQuery: (query) => query.state.data !== undefined,
        },
      }}
    >
      <SessionProvider>
        <OutboxSyncBridge />
        {children}
        <Toaster
          position="bottom-right"
          theme="light"
          toastOptions={{
            style: {
              background: 'var(--paper-raised)',
              border: '1px solid var(--line)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-geist-sans)',
              fontSize: '13px',
              boxShadow: '0 18px 40px -18px rgba(39,34,25,0.14)',
            },
          }}
        />
      </SessionProvider>
    </PersistQueryClientProvider>
  )
}
