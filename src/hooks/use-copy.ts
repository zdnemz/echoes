import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Copy-to-clipboard with a transient "copied" flag.
 *
 * Three components had this inline, each with the same two defects: the reset
 * timer was never cleared (so it fired on an unmounted component, or cleared
 * a *fresh* flag when the view remounted inside 1.6s), and a rejected
 * clipboard write — very common on http:// LAN origins — was silently
 * swallowed, so the button just did nothing.
 */
export function useCopy({ resetMs = 1600, onError }: { resetMs?: number; onError?: (err: unknown) => void } = {}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
      } catch (err) {
        // Clipboard is unavailable (insecure origin, denied permission,
        // document not focused). Surface it instead of pretending it worked.
        onError?.(err)
        return false
      }
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), resetMs)
      return true
    },
    [resetMs, onError],
  )

  return { copied, copy }
}
