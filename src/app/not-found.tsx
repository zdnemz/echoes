import Link from 'next/link'
import { Wordmark } from '@/components/brand'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-16 font-mono text-foreground">
      <div className="w-full max-w-md border-2 border-foreground bg-background p-6 shadow-brutal sm:p-8">
        <Wordmark className="text-[15px]" />

        <h1 className="font-display mt-6 text-2xl uppercase">This page left no echo</h1>
        <p className="mt-2.5 border-l-4 border-accent pl-3 text-[13.5px] font-bold leading-relaxed">
          The link may be old, or the page may have moved. Your notebooks are where you left them.
        </p>

        <div className="mt-6">
          <Button asChild className="h-10">
            <Link href="/journal">Back to the journal</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
