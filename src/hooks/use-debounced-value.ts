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
 * A timestamp that advances on a slow interval while `active`.
 *
 * Needed for time filters relative to "now" (today / past 7 days / past 30
 * days): a `useMemo` capturing `Date.now()` is computed once per dependency
 * change, so without a tick a tab left open overnight keeps showing
 * yesterday's window — the query key never changes, so nothing refetches.
 *
 * Returns the timestamp itself (rather than a counter) so callers can pass it
 * into the computation and have a real dependency to declare.
 */
export function useMinuteTick(active: boolean, intervalMs = 60_000): number {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!active) return
    // Refresh on activation, then on every interval. Both writes happen in
    // callbacks — a synchronous setState in the effect body would cascade a
    // render on every activation.
    const refresh = () => setNowMs(Date.now())
    const boot = setTimeout(refresh, 0)
    const id = setInterval(refresh, intervalMs)
    return () => {
      clearTimeout(boot)
      clearInterval(id)
    }
  }, [active, intervalMs])

  return nowMs
}
