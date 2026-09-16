'use client'

/**
 * Entry key resolution — turn an entry's key_wraps into a CryptoKey.
 *
 *   author wrap  → sealed under the author's DEK       (unwrap with vault DEK)
 *   group wrap   → sealed under the group CEK           (unwrap with the CEK)
 *
 * The group CEK arrives through group_key_wraps (the member's sealed box,
 * opened with their identity private key) — vault.getGroupCek does that
 * hop. This module is the last mile only.
 */

import { unwrapKey } from './envelope'
import { forgetGroupCek, getGroupCek } from './vault'
import type { UnlockedVault } from './vault'
import type { Entry } from '@/lib/api/types'

export interface ResolvedEntryKey {
  key: CryptoKey | null
  /** True when a group wrap exists but no CEK is available — show locked UI. */
  locked: boolean
}

/**
 * Resolve the decryption key for one entry.
 *
 * @param groupId the group of the entry's notebook (null for private) —
 *                the only route to the CEK that opens the group wrap.
 */
export async function resolveEntryKey(
  entry: Pick<Entry, 'key_wraps' | 'author_id'>,
  me: string,
  vault: UnlockedVault,
  groupId: string | null,
): Promise<ResolvedEntryKey> {
  const wraps = entry.key_wraps ?? []
  if (wraps.length === 0) return { key: null, locked: false }

  // My own entries: the author wrap under my DEK is the primary path.
  if (entry.author_id === me) {
    const authorWrap = wraps.find((w) => w.scope === 'author')
    if (authorWrap) {
      try {
        return { key: await unwrapKey(authorWrap.wrapped_key, vault.dek), locked: false }
      } catch {
        // DEK mismatch (post-rotation?) — try the group path before giving up.
      }
    }
  }

  // Group path: someone else's shared entry, or the author fallback above.
  const groupWrap = wraps.find((w) => w.scope === 'group')
  if (groupWrap && groupId) {
    const cek = await getGroupCek(groupId)
    if (cek) {
      try {
        return { key: await unwrapKey(groupWrap.wrapped_key, cek), locked: false }
      } catch {
        // The cached CEK may be stale (another device rotated while this tab
        // was open). Drop it, fetch the current generation once, and retry —
        // without this the entry stays unreadable until a full reload.
        forgetGroupCek(groupId)
        const fresh = await getGroupCek(groupId).catch(() => null)
        if (fresh) {
          try {
            return { key: await unwrapKey(groupWrap.wrapped_key, fresh), locked: false }
          } catch {
            /* genuinely unreadable here — locked UI below */
          }
        }
      }
    }
  }

  return { key: null, locked: wraps.length > 0 }
}
