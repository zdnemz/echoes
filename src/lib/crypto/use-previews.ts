'use client'

/**
 * Batch decryption for entry lists — one pass per page of results.
 *
 * Rows arrive with sealed title/body plus their key_wraps; the hook opens
 * each with the vault (author wrap for own entries, group CEK for shared)
 * and returns a lookup of plaintext {title, preview} by entry id. Locked
 * rows (no resolvable key) map to null — the row renders a sealed state.
 */

import { useEffect, useState } from 'react'
import { previewFromStorage } from './entry-codec'
import { isUnlocked, onVaultChange, whenReady } from './vault'
import type { Entry } from '@/lib/api/types'

export type EntryPreview = { title: string; bodyPreview: string }

export function useDecryptedPreviews(
  entries: Array<Pick<Entry, 'id' | 'title' | 'body' | 'encrypted' | 'key_wraps' | 'author_id'>>,
  me: string | null | undefined,
  groupIdOf: (entry: Entry) => string | null,
): Record<string, EntryPreview | null> {
  const [previews, setPreviews] = useState<Record<string, EntryPreview | null>>({})
  const [unlocked, setUnlocked] = useState(isUnlocked())

  useEffect(() => {
    const off = onVaultChange(() => setUnlocked(isUnlocked()))
    // Keys are generated on first load, so the first `isUnlocked()` read is
    // usually false — without this the list would render every row as
    // "written on another device" and never recover.
    void whenReady().then(() => setUnlocked(isUnlocked()))
    return off
  }, [])

  useEffect(() => {
    // A locked vault must not keep showing plaintext that was decrypted
    // before the lock — drop every preview the moment keys leave memory.
    if (!unlocked) {
      setPreviews({})
      return
    }
    if (entries.length === 0) return
    let alive = true
    void (async () => {
      const next: Record<string, EntryPreview | null> = {}
      for (const e of entries) {
        if (!e.encrypted) continue
        next[e.id] = await previewFromStorage(e, me ?? '', groupIdOf(e as Entry))
      }
      if (alive && Object.keys(next).length > 0) setPreviews(next)
    })()
    return () => {
      alive = false
    }
    // entries identity changes per fetch; me/group resolution are stable fns
    // from callers — eslint disabled in favor of correctness on new pages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, entries, me])

  return previews
}
