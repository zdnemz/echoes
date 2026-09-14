import { useEffect, useState } from 'react'

/**
 * Returns `value` delayed by `delayMs`. Used to keep a text input responsive
 * while the expensive consumer (a network query) only sees settled values —
 * without this, every keystroke fires its own request.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])

  return debounced
}

/**
 * Re-renders on a slow interval while `active`.
 *
 * Needed for time filters that are relative to "now" (today / past 7 days /
 * past 30 days): a `useMemo` capturing `Date.now()` is computed once per
 * dependency change, so without a tick a tab left open overnight keeps
 * showing yesterday's window — the query key never changes and nothing
 * refetches.
 */
export function useMinuteTick(active: boolean, intervalMs = 60_000): number {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])

  return tick
}
