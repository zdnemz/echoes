'use client'

/**
 * The inline failure state for a data-backed list.
 *
 * Three places rendered a bare error line; only one had a way to retry, so the
 * other two left the user stuck until they navigated away. One component keeps
 * the copy, the styling and the retry affordance identical everywhere.
 */

import { ArrowClockwise } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { isUnconfigured } from '@/lib/api/client'

export function QueryError({
  error,
  onRetry,
  fallback = "Couldn't load this.",
  className = '',
}: {
  error: unknown
  onRetry?: () => void
  fallback?: string
  className?: string
}) {
  const message = isUnconfigured(error)
    ? "The journal backend isn't connected on this deployment."
    : error instanceof Error
      ? error.message
      : fallback

  return (
    <div
      role="alert"
      className={`border-2 border-destructive bg-background p-6 text-center shadow-brutal ${className}`.trim()}
    >
      <p className="font-mono text-[13px] font-bold leading-relaxed text-destructive">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          <ArrowClockwise weight="bold" className="mr-1.5 h-3.5 w-3.5" />
          Try again
        </Button>
      )}
    </div>
  )
}
