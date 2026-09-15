'use client'

/**
 * Entry codec — the one place entries cross between plaintext and sealed
 * form. Everything else in the app speaks plaintext.
 *
 * Writing (seal): generate a per-entry content key, seal title+body JSON
 * under it, and store the key wrapped twice: author scope (my DEK) always,
 * group scope (the group CEK) when the entry is shared into a group.
 *
 * Reading (open): resolve the entry's content key (author or group wrap)
 * and unseal. Titles and bodies are never stored plaintext server-side.
 */

import { generateDataKey, openEntry, sealEntry, unwrapKey, wrapKey } from './envelope'
import { getGroupCek, getVault } from './vault'
import { resolveEntryKey } from './resolve'
import type { Entry } from '@/lib/api/types'

export interface KeyWrapInput {
  scope: 'author' | 'group'
  wrapped_key: string
}

/** What sealForStorage managed to do about the group wrap. */
export type ShareSealState = 'shared' | 'author-only'

/**
 * Seal an entry for storage. Returns the fields to send the API.
 * `groupId` must be the entry's notebook group when is_shared is true.
 *
 * When the group CEK is missing (not distributed yet, or nobody has
 * published keys) the entry is still saved — sealed under the author wrap
 * only — and `shareState` reports 'author-only'. Throwing here instead
 * meant a missing key lost the writing entirely, so the entry is kept and
 * the caller warns that it isn't shared yet.
 */
export async function sealForStorage(
  title: string,
  body: string,
  groupId: string | null,
  isShared: boolean,
): Promise<{
  title: string
  body: string
  encrypted: true
  key_wraps: KeyWrapInput[]
  shareState: ShareSealState
}> {
  const vault = getVault()
  if (!vault) throw new Error('vault locked')

  const wantsGroup = Boolean(groupId && isShared)
  const cek = wantsGroup ? await getGroupCek(groupId as string) : null
  const contentKey = await generateDataKey()

  const sealed = await sealEntry({ title, body }, contentKey)
  const wraps: KeyWrapInput[] = [{ scope: 'author', wrapped_key: await wrapKey(contentKey, vault.dek) }]
  if (cek) {
    wraps.push({ scope: 'group', wrapped_key: await wrapKey(contentKey, cek) })
  }

  return {
    title: sealed,
    body: sealed,
    encrypted: true,
    key_wraps: wraps,
    shareState: wantsGroup && !cek ? 'author-only' : 'shared',
  }
}

/**
 * Open a stored entry back into plaintext. Returns the original strings for
 * legacy plaintext rows. Throws when the key cannot be resolved (locked).
 */
export async function openFromStorage(
  entry: Pick<Entry, 'title' | 'body' | 'encrypted' | 'key_wraps' | 'author_id'>,
  me: string,
  groupId: string | null,
): Promise<{ title: string; body: string }> {
  if (!entry.encrypted) return { title: entry.title, body: entry.body }

  const vault = getVault()
  if (!vault) throw new Error('vault locked')

  const { key, locked } = await resolveEntryKey(entry, me, vault, groupId)
  if (!key) {
    if (locked) throw new Error('locked — the key for this entry is not available to you')
    throw new Error('no key wraps on this encrypted entry')
  }
  return openEntry(entry.title, key)
}

/**
 * Take a decrypted title/body preview for list rows: opens the entry if
 * needed and returns a short plaintext snippet. Null when it cannot be
 * opened (locked / no key) — rows then render a locked placeholder.
 */
export async function previewFromStorage(
  entry: Pick<Entry, 'title' | 'body' | 'encrypted' | 'key_wraps' | 'author_id'>,
  me: string,
  groupId: string | null,
): Promise<{ title: string; bodyPreview: string } | null> {
  try {
    const opened = await openFromStorage(entry, me, groupId)
    return { title: opened.title, bodyPreview: opened.body.slice(0, 150) }
  } catch {
    return null
  }
}

/**
 * Re-wrap an entry's content key for sharing changes:
 *  - sharing ON  → re-seal nothing, just add the group wrap (needs CEK)
 *  - sharing OFF → drop the group wrap
 * Returns the new key_wraps array for PATCH /entries/:id.
 *
 * A missing CEK is not fatal: the author wrap alone is returned so the edit
 * survives. Callers mark the entry unshared in that case.
 */
export async function rewrapForSharing(
  entry: Pick<Entry, 'key_wraps' | 'encrypted' | 'author_id'>,
  me: string,
  groupId: string | null,
  isShared: boolean,
): Promise<KeyWrapInput[] | undefined> {
  if (!entry.encrypted) return undefined
  const vault = getVault()
  if (!vault) throw new Error('vault locked')

  const authorWrap = (entry.key_wraps ?? []).find((w) => w.scope === 'author')
  if (!authorWrap) return undefined // pre-rotation shape — nothing to do

  if (!isShared) return [{ scope: 'author', wrapped_key: authorWrap.wrapped_key }]

  if (groupId) {
    const cek = await getGroupCek(groupId)
    // No CEK yet: keep the author wrap so the edit is never lost. The caller
    // marks the entry unshared rather than advertising a row nobody can open.
    if (!cek) return [{ scope: 'author', wrapped_key: authorWrap.wrapped_key }]
    const contentKey = await unwrapKey(authorWrap.wrapped_key, vault.dek)
    return [
      { scope: 'author', wrapped_key: authorWrap.wrapped_key },
      { scope: 'group', wrapped_key: await wrapKey(contentKey, cek) },
    ]
  }
  return [{ scope: 'author', wrapped_key: authorWrap.wrapped_key }]
}
