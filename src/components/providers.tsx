'use client'

/**
 * Client-side providers for the whole app.
 * Session state lives here (hydration-safe: restored in an effect, never
 * during first render, so server and client markup always agree).
 */

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { SessionProvider } from '@/lib/auth/session'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
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
    </QueryClientProvider>
  )
}
