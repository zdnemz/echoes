'use client'

import { exportPublicKey, generateDataKey, generateIdentityKeypair, openSealedKey } from './envelope'
import { loadDeviceKeys, saveDeviceKeys } from './device-store'
import { api, getToken, json } from '@/lib/api/client'

export interface UnlockedVault {
  dek: CryptoKey
  identityPrivate: CryptoKey
  identityPublic: string
  deviceId: string
}

let vault: UnlockedVault | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function onVaultChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getVault(): UnlockedVault | null {
  return vault
}

export function isUnlocked(): boolean {
  return vault !== null
}

/**
 * Key setup is automatic and silent: the first time this device runs it
 * generates a DEK + ECDH identity pair, keeps them in IndexedDB and
 * registers only the public key with the server. Nothing here is derived
 * from the password, so signing in on a new device "just works" — and a
 * password reset can never destroy existing entries.
 *
 * The in-flight promise is kept so concurrent callers (session restore,
 * login, first save) share one run instead of racing to register twice.
 */
let starting: Promise<void> | null = null

export function ensureKeys(): Promise<void> {
  if (vault) return Promise.resolve()
  if (!starting) {
    starting = startKeys().finally(() => {
      starting = null
    })
  }
  return starting
}

async function startKeys(): Promise<void> {
  const stored = await loadDeviceKeys()
  if (stored) {
    vault = {
      dek: stored.dek,
      identityPrivate: stored.identityPrivate,
      identityPublic: stored.identityPublic,
      deviceId: stored.deviceId,
    }
    emit()
    return
  }
  // No session → nothing to register the device against. Generating a
  // keypair now would only throw it away (the POST 401s and the keys are
  // never saved). Keys are provisioned on the first authenticated session.
  if (!getToken()) return
  const dek = await generateDataKey()
  const identity = await generateIdentityKeypair()
  const identityPublic = await exportPublicKey(identity.publicKey)
  const res = await api<{ id: string }>('/api/me/devices', {
    method: 'POST',
    ...json({ public_key: identityPublic }),
  })
  await saveDeviceKeys({
    deviceId: res.id,
    dek,
    identityPrivate: identity.privateKey,
    identityPublic,
  })
  vault = {
    dek,
    identityPrivate: identity.privateKey,
    identityPublic,
    deviceId: res.id,
  }
  emit()
}

/**
 * Await this before opening or sealing anything. Key generation is async, so
 * a component that renders before it finishes would otherwise read a locked
 * vault and could show — or worse, overwrite — an entry it simply hasn't
 * had time to decrypt yet.
 */
export async function whenReady(): Promise<UnlockedVault | null> {
  await ensureKeys().catch(() => null)
  return vault
}

export function lock(): void {
  vault = null
  emit()
}

const groupCeks = new Map<string, { key: CryptoKey; generation: number }>()

export async function getGroupCek(groupId: string): Promise<CryptoKey | null> {
  const cached = groupCeks.get(groupId)
  if (cached) return cached.key
  if (!vault) return null
  try {
    const res = await api<{ wraps: Array<{ device_id: string; generation: number; sealed_box: string }> }>(
      `/api/groups/${groupId}/key`,
    )
    const mine = res.wraps.find((w) => w.device_id === vault!.deviceId)
    if (!mine) return null
    const cek = await openSealedKey(mine.sealed_box, vault.identityPrivate)
    groupCeks.set(groupId, { key: cek, generation: mine.generation })
    return cek
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 404) return null
    throw err
  }
}

export function forgetGroupCek(groupId: string) {
  groupCeks.delete(groupId)
}

export { distributeOrRotate, ensureDeviceCoverage, tryFirstDistribution, ensureShareableCek } from './group-keys'
