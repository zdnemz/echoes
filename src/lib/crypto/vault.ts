'use client'

/**
 * The key vault — the client half of E2EE.
 *
 * Lifecycle:
 *   signup → provision(): new DEK + identity keys, sealed under the chosen
 *            password (PBKDF2 600k in-browser), published to the profile.
 *   login   → unlock(): fetch the stored blobs, re-derive the KEK from the
 *            password, unwrap the DEK + identity private key, keep both in
 *            module memory for the session. The password is never stored.
 *   logout  → lock(): drop every key from memory.
 *
 * The unlocked DEK lives in a closure variable — not localStorage, not a
 * cookie, not React state — so an XSS-free page holds it only while the
 * session runs and any full reload requires a fresh unlock. Auto-unlock
 * after reload reuses the stashed password only within the same tab session
 * (sessionStorage, cleared on tab close) — a deliberate usability trade:
 * the password lives at most one tab-lifetime in the browser.
 */

import {
  deriveKekFromPassword,
  exportPrivateKey,
  exportPublicKey,
  generateDataKey,
  generateIdentityKeypair,
  importPrivateKey,
  openSealedKey,
  randomSalt,
  unwrapKey,
  wrapKey,
  PBKDF2_ITERATIONS,
} from './envelope'
import { api, json } from '@/lib/api/client'

// ---------------------------------------------------------------- storage keys

const UNLOCK_STASH = 'echoes.keys.stash' // sessionStorage — password for this tab
const UNLOCKED_FLAG = 'echoes.keys.unlocked' // localStorage — "was unlocked this session"

// ---------------------------------------------------------------- vault state

export interface UnlockedVault {
  dek: CryptoKey
  /** ECDH identity private key (unwrapped). */
  identityPrivate: CryptoKey
  /** ECDH identity public key (SPKI base64) — matches the profile. */
  identityPublic: string
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

/** Raw access for crypto operations; null when locked. */
export function getVault(): UnlockedVault | null {
  return vault
}

export function isUnlocked(): boolean {
  return vault !== null
}

function setUnlockedFlag(on: boolean) {
  try {
    if (on) window.localStorage.setItem(UNLOCKED_FLAG, '1')
    else window.localStorage.removeItem(UNLOCKED_FLAG)
  } catch {
    /* storage blocked — unlock state just won't persist */
  }
}

export function wasUnlockedBeforeReload(): boolean {
  try {
    return window.localStorage.getItem(UNLOCKED_FLAG) === '1'
  } catch {
    return false
  }
}

// ---------------------------------------------------------------- server types

interface KeyMaterialResponse {
  salt: string | null
  iterations: number | null
  wrapped_dek: string | null
  public_key: string | null
  wrapped_private_key: string | null
}

const fetchKeys = () => api<KeyMaterialResponse>('/api/me/keys')

// ---------------------------------------------------------------- provisioning

/**
 * Create + publish key material for a fresh account. Returns the unlock
 * password's derived artifacts already cached — the caller just signed up,
 * so the vault opens immediately without a second derivation.
 */
export async function provision(password: string): Promise<void> {
  const dek = await generateDataKey()
  const salt = randomSalt()
  const kek = await deriveKekFromPassword(password, salt)
  const wrappedDek = await wrapKey(dek, kek)

  const identity = await generateIdentityKeypair()
  // Identity private key sealed under the DEK: unwrapping it proves the DEK.
  const identityPrivatePem = await exportPrivateKey(identity.privateKey)
  const identityPublic = await exportPublicKey(identity.publicKey)
  const wrappedIdentityPrivate = await wrapKey(identity.privateKey, dek)

  await api('/api/me/keys', {
    method: 'PUT',
    ...json({
      salt,
      iterations: PBKDF2_ITERATIONS,
      wrapped_dek: wrappedDek,
      public_key: identityPublic,
      wrapped_private_key: wrappedIdentityPrivate,
    }),
  })

  vault = {
    dek,
    identityPrivate: await importPrivateKey(identityPrivatePem),
    identityPublic,
  }
  stashPassword(password)
  setUnlockedFlag(true)
  emit()
}

// ---------------------------------------------------------------- unlocking

function stashPassword(password: string) {
  try {
    window.sessionStorage.setItem(UNLOCK_STASH, password)
  } catch {
    /* private mode — no auto-unlock after reload, user re-enters */
  }
}

function popStashedPassword(): string | null {
  try {
    return window.sessionStorage.getItem(UNLOCK_STASH)
  } catch {
    return null
  }
}

function clearStash() {
  try {
    window.sessionStorage.removeItem(UNLOCK_STASH)
  } catch {
    /* nothing stashed */
  }
}

/**
 * Unlock with an explicit password (fresh login or the unlock prompt).
 * Throws on a wrong password (GCM auth failure inside unwrapKey).
 */
export async function unlock(password: string): Promise<void> {
  const keys = await fetchKeys()
  if (!keys.salt || !keys.wrapped_dek || !keys.public_key || !keys.wrapped_private_key) {
    throw new Error('No key material on this account yet')
  }
  const iterations = keys.iterations ?? PBKDF2_ITERATIONS
  const kek = await deriveKekFromPassword(password, keys.salt, iterations)
  const dek = await unwrapKey(keys.wrapped_dek, kek)
  const identityPrivate = await unwrapKey(keys.wrapped_private_key, dek)
  vault = { dek, identityPrivate, identityPublic: keys.public_key }
  stashPassword(password)
  setUnlockedFlag(true)
  emit()
}

/**
 * Best-effort auto-unlock after a page reload (same tab): the password was
 * stashed in sessionStorage at unlock time. Returns false when no stash
 * exists — the UI then shows the unlock prompt.
 */
export async function tryAutoUnlock(): Promise<boolean> {
  if (vault) return true
  const pw = popStashedPassword()
  if (!pw || !wasUnlockedBeforeReload()) return false
  try {
    await unlock(pw)
    return true
  } catch {
    clearStash()
    return false
  }
}

// ---------------------------------------------------------------- locking

export function lock(): void {
  vault = null
  clearStash()
  setUnlockedFlag(false)
  emit()
}

// ---------------------------------------------------------------- group CEKs

const groupCeks = new Map<string, { key: CryptoKey; generation: number }>()

/**
 * Get the group CEK for a linked notebook: fetch my sealed box, open it with
 * my identity key, cache per generation. Returns null when no box exists
 * yet (the owner hasn't distributed) — the caller treats entries as locked.
 */
export async function getGroupCek(groupId: string): Promise<CryptoKey | null> {
  const cached = groupCeks.get(groupId)
  if (cached) return cached.key
  try {
    const wrap = await api<{ group_id: string; generation: number; sealed_box: string }>(`/api/groups/${groupId}/key`)
    const cek = await openSealedKey(wrap.sealed_box, vault!.identityPrivate)
    groupCeks.set(groupId, { key: cek, generation: wrap.generation })
    return cek
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 404) return null // not distributed yet
    throw err
  }
}

/** Drop cached CEKs (after rotation or when leaving a group). */
export function forgetGroupCek(groupId: string) {
  groupCeks.delete(groupId)
}
