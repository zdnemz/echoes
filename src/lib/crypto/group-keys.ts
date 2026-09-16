'use client'

import { generateDataKey, openSealedKey, sealKeyFor, unwrapKey, wrapKey } from './envelope'
import { whenReady, forgetGroupCek, getGroupCek } from './vault'
import { api, json } from '@/lib/api/client'
import type { Entry } from '@/lib/api/types'

interface DeviceKeyInfo {
  user_id: string
  device_id: string
  public_key: string
}

export async function distributeOrRotate(groupId: string, me: string): Promise<void> {
  // Keys are generated on first load, so wait for them — throwing here used
  // to surface as a "key not set" error when creating the first entry of a
  // fresh group before the background provisioning had finished.
  const vault = await whenReady()
  if (!vault) throw new Error("couldn't prepare this device — check your connection and try again")

  let oldCek: CryptoKey | null = null
  try {
    const res = await api<{ wraps: Array<{ device_id: string; generation: number; sealed_box: string }> }>(
      `/api/groups/${groupId}/key`,
    )
    const mine = res.wraps.find((w) => w.device_id === vault.deviceId)
    if (mine) oldCek = await openSealedKey(mine.sealed_box, vault.identityPrivate)
  } catch {
    oldCek = null
  }

  const devices = await api<DeviceKeyInfo[]>(`/api/groups/${groupId}/devices`)
  if (devices.length === 0) throw new Error('no member devices registered yet')

  const newCek = await generateDataKey()
  let generation = 1
  try {
    const current = await api<{ wraps: Array<{ generation: number }> }>(`/api/groups/${groupId}/key`)
    if (current.wraps.length > 0) generation = Math.max(...current.wraps.map((w) => w.generation)) + 1
  } catch {
    generation = 1
  }

  const wraps = await Promise.all(
    devices.map(async (d) => ({
      device_id: d.device_id,
      sealed_box: await sealKeyFor(d.public_key, newCek, vault.identityPrivate, vault.identityPublic),
    })),
  )

  await api(`/api/groups/${groupId}/key`, {
    method: 'PUT',
    ...json({ generation, replace: true, wraps }),
  })

  const entries = await api<{ data: Entry[] }>(`/api/groups/${groupId}/entries?limit=100&page=1`)
  const rewraps: Array<{ entry_id: string; wrapped_key: string }> = []
  const newGroupWraps: Array<{ entry_id: string; scope: 'group'; wrapped_key: string }> = []
  for (const e of entries.data) {
    if (!e.encrypted) continue
    const kw = e.key_wraps ?? []
    const gw = kw.find((w) => w.scope === 'group')
    if (gw && oldCek) {
      const contentKey = await unwrapKey(gw.wrapped_key, oldCek)
      rewraps.push({ entry_id: e.id, wrapped_key: await wrapKey(contentKey, newCek) })
    } else if (!gw) {
      const aw = kw.find((w) => w.scope === 'author')
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
    await api(`/api/groups/${groupId}/rotate`, {
      method: 'POST',
      ...json({ rewraps: newGroupWraps.map((w) => ({ entry_id: w.entry_id, wrapped_key: w.wrapped_key })) }),
    })
  }

  forgetGroupCek(groupId)
  await getGroupCek(groupId).catch(() => null)
}

/**
 * Last-resort distribution at save time: the link-time distribution may have
 * run before this device registered its key (or failed on a flaky network),
 * leaving a group with no key at all. If NOBODY has a box yet, distribute
 * now so the first shared entry just works. If anyone already has a box,
 * hands off — rotating here would orphan their entries; their device (or
 * the owner's next visit) brings the missing boxes instead.
 *
 * Returns a usable CEK, or null when there is nothing safe to do.
 */
export async function tryFirstDistribution(groupId: string, me: string): Promise<CryptoKey | null> {
  const vault = await whenReady()
  if (!vault) return null
  try {
    const devices = await api<Array<{ user_id: string; device_id: string; public_key: string; has_wrap: boolean }>>(
      `/api/groups/${groupId}/devices`,
    )
    if (devices.some((d) => d.has_wrap)) return null
    if (devices.length === 0) return null
    await distributeOrRotate(groupId, me)
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
 * Bring this device into a group whose key already exists — silently.
 *
 * A device holding the CEK seals it for every one of MY other registered
 * devices that has no box yet (a fresh browser profile, a new phone). No new
 * CEK and no rotation, so the group's history stays intact and no member
 * loses anything; the new device simply catches up.
 *
 * Runs from a device that ALREADY has the key: a brand-new device cannot open
 * any existing box (its identity key is new), so it can never seal for
 * itself — the gift has to come from a device that can. This is the one
 * honest limit of the no-password design: the new device reads the group once
 * an older device of the same account is online again.
 */
export async function ensureDeviceCoverage(groupId: string, me: string): Promise<void> {
  const vault = await whenReady()
  if (!vault) return

  let devices: Array<{ user_id: string; device_id: string; public_key: string; has_wrap: boolean }>
  let cek: CryptoKey | null = null
  let generation = 1
  try {
    devices = await api<Array<{ user_id: string; device_id: string; public_key: string; has_wrap: boolean }>>(
      `/api/groups/${groupId}/devices`,
    )
    cek = await getGroupCek(groupId)
    if (!cek) return // I hold no key for this group — nothing to share
    const res = await api<{ wraps: Array<{ device_id: string; generation: number; sealed_box: string }> }>(
      `/api/groups/${groupId}/key`,
    )
    if (res.wraps.length > 0) generation = Math.max(...res.wraps.map((w) => w.generation))
  } catch {
    return // not a member / key never distributed — nothing to backfill
  }

  const missing = devices.filter((d) => !d.has_wrap && d.user_id === me)
  if (missing.length === 0) return

  const wraps = await Promise.all(
    missing.map(async (d) => ({
      device_id: d.device_id,
      sealed_box: await sealKeyFor(d.public_key, cek!, vault.identityPrivate, vault.identityPublic),
    })),
  )

  await api(`/api/groups/${groupId}/key`, {
    method: 'PUT',
    ...json({ generation, replace: false, wraps }),
  })
}
