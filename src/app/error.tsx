'use client'

/**
 * Root error boundary.
 *
 * Without this, any uncaught error in a route rendered Next's default screen
 * (or, worse, a blank page). This keeps the Paper & Ink voice and gives the
 * user a way out that is not a browser refresh.
 *
 * `digest` is the only detail safe to surface: it matches the server log line,
 * so a report can be traced without leaking a stack trace to the page.
 */

import { useEffect } from 'react'
import Link from 'next/link'
import { ArrowClockwise } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/brand'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Next already logs the error server-side; keep a client breadcrumb too.
    console.error('[echoes] unhandled route error:', error)
  }, [error])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <Wordmark className="text-[15px]" />

        <h1 className="font-display mt-6 text-2xl leading-tight tracking-tight text-ink">
          Something came apart on our end
        </h1>
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">
          Nothing you wrote is lost — entries save as you go. Try again, and if it keeps happening, come back in a
          little while.
        </p>

        {error.digest && <p className="mt-3 font-mono text-[11px] text-ink-faint">reference: {error.digest}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <Button onClick={reset} className="press h-10 gap-1.5 shadow-ink">
            <ArrowClockwise weight="bold" className="h-3.5 w-3.5" />
            Try again
          </Button>
          <Button asChild variant="outline" className="press h-10 border-line">
            <Link href="/journal">Back to the journal</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
