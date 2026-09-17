'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { flushOutbox } from './sync'
import { listOps, onOutboxChange, OUTBOX_MAX_ATTEMPTS } from './outbox'

/**
 * Drives the offline outbox: replays queued writes whenever connectivity
 * returns, and exposes how many are still waiting.
 *
 * Triggers, in order of eagerness: the browser regaining the network
 * (`online`), the tab regaining focus (a laptop waking still-online but with a
 * socket the app believed dead), and a periodic sweep while online — a phone
 * can report `online` for a captive portal that isn't actually reachable.
 */
export function useOutboxSync(): { pending: number; online: boolean } {
  const qc = useQueryClient()
  const [pending, setPending] = useState(0)
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    const refresh = () =>
      listOps().then((ops) => setPending(ops.filter((o) => o.attempts < OUTBOX_MAX_ATTEMPTS).length))

    const tryFlush = () => {
      if (!navigator.onLine) return
      setOnline(true)
      flushOutbox(qc).finally(refresh)
    }

    refresh()
    tryFlush()

    const unsub = onOutboxChange(refresh)
    const goOnline = () => {
      setOnline(true)
      // Give the network a beat — the event fires the instant the interface
      // comes up, before DNS is necessarily answering.
      setTimeout(tryFlush, 400)
    }
    const goOffline = () => setOnline(false)
    const onVisible = () => document.visibilityState === 'visible' && tryFlush()

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    document.addEventListener('visibilitychange', onVisible)
    // ponytail: 60s sweep is the safety net, not the primary driver.
    const sweep = setInterval(tryFlush, 60_000)

    return () => {
      unsub()
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(sweep)
    }
  }, [qc])

  return { pending, online }
}

/** Just the queue depth — for a "syncing N" badge without mounting the driver. */
export function usePendingCount(): number {
  const [pending, setPending] = useState(0)
  useEffect(() => {
    const refresh = () =>
      listOps().then((ops) => setPending(ops.filter((o) => o.attempts < OUTBOX_MAX_ATTEMPTS).length))
    refresh()
    return onOutboxChange(refresh)
  }, [])
  return pending
}
