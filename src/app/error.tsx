'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ArrowClockwise } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/brand'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[echoes] unhandled route error:', error)
  }, [error])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-16 font-mono text-foreground">
      <div className="w-full max-w-md border-2 border-foreground bg-background p-6 shadow-brutal sm:p-8">
        <Wordmark className="text-[15px]" />

        <h1 className="font-display mt-6 text-2xl uppercase">Something came apart on our end</h1>
        <p className="mt-2.5 border-l-4 border-accent pl-3 text-[13.5px] font-bold leading-relaxed">
          Nothing you wrote is lost — entries save as you go. Try again, and if it keeps happening, come back in a
          little while.
        </p>

        {error.digest && (
          <p className="mt-3 bg-muted px-2 py-1 font-mono text-[11px] font-bold uppercase">reference: {error.digest}</p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button onClick={reset} className="h-10 gap-1.5">
            <ArrowClockwise weight="bold" className="h-3.5 w-3.5" />
            Try again
          </Button>
          <Button asChild variant="outline" className="h-10">
            <Link href="/journal">Back to the journal</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
