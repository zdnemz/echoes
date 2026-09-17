'use client'

/**
 * Group CEK distribution over account-scoped identity keys.
 *
 * Every member's identity public key lives on their profile, so anyone who
 * already holds the group CEK can seal a fresh box for a member who lacks one
 * — the owner no longer has to be online when someone joins. That, plus each
 * author back-filling a group wrap onto their own earlier author-only
 * entries, is what makes shared entries eventually readable by every member
 * even when a save raced ahead of the key distribution.
 */

import { generateDataKey, sealKeyFor, unwrapKey, wrapKey } from './envelope'
import { forgetGroupCek, getGroupCek, getVault, whenReady } from './vault'
import { api, json } from '@/lib/api/client'
import { listGroupMembers, type GroupMemberKeys, type GroupKeyWraps } from '@/lib/api/endpoints'
import type { Entry } from '@/lib/api/types'

type Member = GroupMemberKeys

/** Members of a group with their published identity key and wrap status. */
async function membersOf(groupId: string): Promise<Member[]> {
  return listGroupMembers(groupId)
}

/**
 * Owner path: mint a fresh CEK, seal a box for every member who published a
 * key, replace the set, and re-wrap every entry's group wrap under the new
 * CEK. Used at distribution and after a removal (the removed member's box is
 * gone and their old box can't open the new generation).
 */
export async function distributeOrRotate(groupId: string, me: string): Promise<void> {
  // Keys need the PIN-unlocked vault; throwing here used to surface as a
  // "key not set" error when creating the first entry of a fresh group before
  // the vault had finished resolving.
  const vault = await whenReady()
  if (!vault) throw new Error("Couldn't unlock the journal — check your connection and try again")

  // Recover the current CEK first so existing group wraps get re-wrapped
  // instead of orphaned. 404 (no box for me yet) means there is nothing old to
  // preserve — a brand-new group key.
  let oldCek: CryptoKey | null = null
  try {
    oldCek = await getGroupCek(groupId)
  } catch {
    oldCek = null
  }

  const members = await membersOf(groupId)
  const sealable = members.filter((m) => m.public_key)
  if (sealable.length === 0) throw new Error('No member has published a key yet')

  const newCek = await generateDataKey()
  let generation = 1
  try {
    const current = await api<GroupKeyWraps>(`/api/groups/${groupId}/key`)
    if (current.wraps.length > 0) generation = Math.max(...current.wraps.map((w) => w.generation)) + 1
  } catch {
    generation = 1
  }

  const wraps = await Promise.all(
    sealable.map(async (m) => ({
      user_id: m.user_id,
      sealed_box: await sealKeyFor(m.public_key as string, newCek, vault.identityPrivate, vault.identityPublic),
    })),
  )

  await api(`/api/groups/${groupId}/key`, {
    method: 'PUT',
    ...json({ generation, replace: true, wraps }),
  })

  await rewrapGroupEntries(groupId, oldCek, newCek)

  forgetGroupCek(groupId)
  await getGroupCek(groupId).catch(() => null)
}

/** Re-wrap every entry's group scope under a rotated CEK; bodies never move. */
async function rewrapGroupEntries(groupId: string, oldCek: CryptoKey | null, newCek: CryptoKey): Promise<void> {
  if (!oldCek) return
  const entries = await api<{ data: Entry[] }>(`/api/groups/${groupId}/entries?limit=100&page=1`)
  const rewraps: Array<{ entry_id: string; wrapped_key: string }> = []
  for (const e of entries.data) {
    if (!e.encrypted) continue
    const gw = (e.key_wraps ?? []).find((w) => w.scope === 'group')
    if (!gw) continue
    try {
      const contentKey = await unwrapKey(gw.wrapped_key, oldCek)
      rewraps.push({ entry_id: e.id, wrapped_key: await wrapKey(contentKey, newCek) })
    } catch {
      // Wrapped under something else (already rotated by another device) —
      // leave it; a stale wrap still opens under the cached CEK.
    }
  }
  if (rewraps.length > 0) {
    await api(`/api/groups/${groupId}/rotate`, { method: 'POST', ...json({ rewraps }) })
  }
}

/**
 * Give my own author-only shared entries the group wrap they never got — the
 * save ran before anyone distributed the key. Only the author can do this:
 * the author wrap opens with my own DEK, and RLS lets me write my entries'
 * wraps. Other members' entries heal when THEY next hold the CEK.
 */
async function backfillMySharedEntries(groupId: string, me: string, cek: CryptoKey): Promise<void> {
  const vault = getVault()
  if (!vault) return
  const entries = await api<{ data: Entry[] }>(`/api/groups/${groupId}/entries?limit=100&page=1`)
  for (const e of entries.data) {
    if (!e.encrypted || e.author_id !== me || !e.is_shared) continue
    const kw = e.key_wraps ?? []
    if (kw.some((w) => w.scope === 'group')) continue
    const aw = kw.find((w) => w.scope === 'author')
    if (!aw) continue
    try {
      const contentKey = await unwrapKey(aw.wrapped_key, vault.dek)
      await api(`/api/entries/${e.id}`, {
        method: 'PATCH',
        ...json({
          key_wraps: [
            { scope: 'author', wrapped_key: aw.wrapped_key },
            { scope: 'group', wrapped_key: await wrapKey(contentKey, cek) },
          ],
        }),
      })
    } catch {
      // Not visible / RLS said no — retry on a later pass.
    }
  }
}

/**
 * Bring every member who lacks a box up to date, using the CEK I already
 * hold. Any holder can do this — no new CEK, no rotation, so the group's
 * history stays intact. Runs from the group view; the one honest limit stays
 * in place: a member with no box and no holder online still waits, and their
 * own author-only saves heal themselves once a box reaches them.
 */
export async function ensureMemberCoverage(groupId: string, me: string): Promise<void> {
  const vault = await whenReady()
  if (!vault) return

  let members: Member[]
  let cek: CryptoKey | null
  try {
    members = await membersOf(groupId)
    cek = await getGroupCek(groupId)
  } catch {
    return // not a member / key never distributed — nothing to backfill
  }
  if (!cek) return // I hold no CEK for this group — I can't seal for anyone

  const missing = members.filter((m) => !m.has_wrap && m.public_key)
  if (missing.length > 0) {
    let generation = 1
    try {
      const res = await api<GroupKeyWraps>(`/api/groups/${groupId}/key`)
      if (res.wraps.length > 0) generation = Math.max(...res.wraps.map((w) => w.generation))
    } catch {
      generation = 1
    }
    const wraps = await Promise.all(
      missing.map(async (m) => ({
        user_id: m.user_id,
        sealed_box: await sealKeyFor(
          m.public_key as string,
          cek as CryptoKey,
          vault.identityPrivate,
          vault.identityPublic,
        ),
      })),
    )
    await api(`/api/groups/${groupId}/key`, {
      method: 'PUT',
      ...json({ generation, replace: false, wraps }),
    })
  }

  await backfillMySharedEntries(groupId, me, cek)
}

/**
 * Last-resort distribution at save time: the link-time distribution may have
 * failed or run before this account published a key, leaving a group with no
 * CEK at all. If NO member has a box yet, create the key now so the first
 * shared entry just works. If anyone already holds one, hands off — rotating
 * here would orphan their entries; a holder's next visit covers me instead.
 *
 * Returns a usable CEK, or null when there is nothing safe to do.
 */
export async function tryFirstDistribution(groupId: string, me: string): Promise<CryptoKey | null> {
  const vault = await whenReady()
  if (!vault) return null
  try {
    const members = await membersOf(groupId)
    if (members.some((m) => m.has_wrap)) return null
    const sealable = members.filter((m) => m.public_key)
    if (sealable.length === 0) return null

    const newCek = await generateDataKey()
    const wraps = await Promise.all(
      sealable.map(async (m) => ({
        user_id: m.user_id,
        sealed_box: await sealKeyFor(m.public_key as string, newCek, vault.identityPrivate, vault.identityPublic),
      })),
    )
    await api(`/api/groups/${groupId}/key`, {
      method: 'PUT',
      ...json({ generation: 1, replace: false, wraps }),
    })
    await backfillMySharedEntries(groupId, me, newCek)
    return await getGroupCek(groupId).catch(() => null)
  } catch {
    return null
  }
}

/**
 * The one call a save path needs: return this group's CEK, distributing it
 * first when the group genuinely has no key yet. Cheap after the first load
 * (the CEK is cached in memory), so shared saves can call it unconditionally.
 */
export async function ensureShareableCek(groupId: string, me: string): Promise<CryptoKey | null> {
  const existing = await getGroupCek(groupId).catch(() => null)
  if (existing) return existing
  return tryFirstDistribution(groupId, me)
}

/**
 * Bring every group this account belongs to up to date. Called after an
 * unlock: a returning holder is the most reliable healer of a group where
 * someone joined (or provisioned) after the last distribution. Best-effort
 * and never awaited by the unlock itself — it must not delay the journal.
 */
export async function coverMyGroups(me: string): Promise<void> {
  if (!getVault()) return
  const { listGroups } = await import('@/lib/api/endpoints')
  const groups = await listGroups().catch(() => [])
  await Promise.all(groups.map((g) => ensureMemberCoverage(g.id, me).catch(() => null)))
}
