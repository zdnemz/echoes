import Link from 'next/link'
import { Wordmark } from '@/components/brand'

/**
 * 404. Reached for an unknown route, and by any `notFound()` call. Kept
 * deliberately quiet — a wrong URL is not an error state worth alarming
 * anyone about.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <Wordmark className="text-[15px]" />

        <h1 className="font-display mt-6 text-2xl leading-tight tracking-tight text-ink">This page left no echo</h1>
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">
          The link may be old, or the page may have moved. Your notebooks are where you left them.
        </p>

        <Link
          href="/journal"
          className="press mt-6 inline-flex h-10 items-center rounded-md bg-ink px-5 text-[13px] font-medium text-paper shadow-ink"
        >
          Back to the journal
        </Link>
      </div>
    </main>
  )
}
