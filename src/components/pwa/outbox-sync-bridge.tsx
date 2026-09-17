'use client'

import { useOutboxSync } from '@/lib/offline/use-outbox-sync'

/**
 * Invisible driver: replays the offline outbox whenever connectivity returns.
 * Mount once, near the root — it needs QueryClient context and nothing else.
 */
export function OutboxSyncBridge() {
  useOutboxSync()
  return null
}
