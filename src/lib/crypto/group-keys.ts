'use client'

/**
 * Group key distribution & rotation (owner side).
 *
 * distributeOrRotate(groupId):
 *   1. generate a fresh CEK
 *   2. fetch members + their published public keys
 *   3. seal the CEK per member → PUT /groups/:id/key (one generation)
 *   4. re-wrap every existing group-scope entry key under the new CEK
 *      (opens each with the OLD CEK the owner still holds) → /groups/:id/rotate
 *
 * After a member removal this is exactly the rotation the threat model
 * demands: the removed member's sealed box is deleted server-side and the
 * new CEK never reaches them, while existing entries re-key without
 * touching bodies or needing authors online.
 */

import { generateDataKey, openSealedKey, sealKeyFor, unwrapKey, wrapKey } from './envelope'
import { getVault, forgetGroupCek, getGroupCek } from './vault'
import { api, json } from '@/lib/api/client'
import type { GroupMember, Entry } from '@/lib/api/types'

interface MemberWithKey extends GroupMember {
  public_key?: string | null
}

/** Distribute a fresh CEK and re-wrap existing group entry keys. */
export async function distributeOrRotate(groupId: string, me: string): Promise<void> {
  const vault = getVault()
  if (!vault) throw new Error('vault locked')

  // Current CEK (may not exist yet on first link) — needed to re-wrap.
  let oldCek: CryptoKey | null = null
  try {
    const oldWrap = await api<{ sealed_box: string }>(`/api/groups/${groupId}/key`)
    oldCek = await openSealedKey(oldWrap.sealed_box, vault.identityPrivate)
  } catch {
    oldCek = null // first distribution — nothing to re-wrap
  }

  const members = (await api<GroupMember[]>(`/api/groups/${groupId}/members`)) as MemberWithKey[]
  // Public keys ride on profiles; the members listing doesn't embed them —
  // fetch the group detail which does (key material is public by design).
  let keyed = members.filter((m) => (m as MemberWithKey).public_key)
  if (keyed.length === 0) {
    // fall back: member profiles publish keys via /me/keys only for self.
    // Group owners list members with display names; keys must come from the
    // profiles table — ask the server for the co-member key map.
    try {
      const map = await api<{ keys: Record<string, string> }>(`/api/groups/${groupId}/member-keys`)
      keyed = members.filter((m) => map.keys[m.user_id]).map((m) => ({ ...m, public_key: map.keys[m.user_id] }))
    } catch {
      keyed = []
    }
  }
  if (keyed.length === 0) throw new Error('no members have published encryption keys yet')

  const newCek = await generateDataKey()
  // Generation is a small counter, not a timestamp — read the current one
  // and bump (0 → first distribution).
  let generation = 1
  try {
    const current = await api<{ generation: number }>(`/api/groups/${groupId}/key`)
    generation = (current.generation ?? 0) + 1
  } catch {
    generation = 1 // no existing distribution
  }

  const wraps = await Promise.all(
    keyed.map(async (m) => ({
      user_id: m.user_id,
      sealed_box: await sealKeyFor(m.public_key as string, newCek, vault.identityPrivate, vault.identityPublic),
    })),
  )

  // Store the new generation (delete-then-insert server-side).
  await api(`/api/groups/${groupId}/key`, {
    method: 'PUT',
    ...json({ generation, wraps }),
  })

  // Re-key existing entries under the new CEK.
  //   - rows WITH a group wrap: re-wrap that key (rotation)
  //   - the owner's OWN shared rows WITHOUT one (pre-distribution legacy):
  //     open the author wrap with the owner's DEK and add the group wrap
  const entries = await api<{ data: Entry[] }>(`/api/groups/${groupId}/entries?limit=100&page=1`)
  const rewraps: Array<{ entry_id: string; wrapped_key: string }> = []
  const newGroupWraps: Array<{ entry_id: string; scope: 'group'; wrapped_key: string }> = []
  for (const e of entries.data) {
    if (!e.encrypted) continue
    const wraps = e.key_wraps ?? []
    const gw = wraps.find((w) => w.scope === 'group')
    if (gw && oldCek) {
      const contentKey = await unwrapKey(gw.wrapped_key, oldCek)
      rewraps.push({ entry_id: e.id, wrapped_key: await wrapKey(contentKey, newCek) })
    } else if (!gw) {
      // Owner-authored shared rows can be group-wrapped directly; entries by
      // other authors get their group wrap when those authors next save.
      const aw = wraps.find((w) => w.scope === 'author')
      if (aw && e.author_id === me) {
        const contentKey = await unwrapKey(aw.wrapped_key, vault.dek)
        newGroupWraps.push({ entry_id: e.id, scope: 'group', wrapped_key: await wrapKey(contentKey, newCek) })
      }
    }
  }
  if (rewraps.length > 0) {
    await api(`/api/groups/${groupId}/rotate`, { method: 'POST', ...json({ rewraps }) })
  }
  if (newGroupWraps.length > 0) {
    // The rotate endpoint upserts scope='group' rows — same payload shape.
    await api(`/api/groups/${groupId}/rotate`, {
      method: 'POST',
      ...json({ rewraps: newGroupWraps.map((w) => ({ entry_id: w.entry_id, wrapped_key: w.wrapped_key })) }),
    })
  }

  forgetGroupCek(groupId)
  // warm the owner's own cache with the new CEK
  await getGroupCek(groupId).catch(() => null)
}
