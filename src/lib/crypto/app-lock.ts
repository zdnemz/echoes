'use client'

/**
 * App lock — a real lock, not a UI gate.
 *
 * Enabling it wraps this device's DEK and identity private key (see vault.ts)
 * under a KEK and deletes the raw keys from IndexedDB, so a locked app cannot
 * decrypt a single entry. The KEK comes from either:
 *
 *   PIN     → PBKDF2-SHA256 600k (same KDF as the account password), or
 *   passkey → the WebAuthn PRF extension, which yields a stable 256-bit secret
 *             bound to this authenticator + site without ever leaving it.
 *
 * Unlocking restores the keys to memory only — nothing is written back to disk
 * in raw form, so closing the tab re-locks. `lock()` (vault) drops them again.
 */

import {
  deriveKekFromPassword,
  exportPrivateKey,
  importPrivateKey,
  openText,
  randomSalt,
  sealText,
  unwrapKey,
  wrapKey,
} from './envelope'
import { getVault, lock as lockVault, unlockVault } from './vault'
import {
  clearLockedKeys,
  loadLockedKeys,
  saveLockedKeys,
  saveDeviceKeys,
  type KeyWrap,
  type LockedKeys,
} from './device-store'
import type { AuthUser } from '@/lib/api/types'

const FLAG_KEY = 'echoes.app-lock'

export interface AppLockMethods {
  pin: boolean
  passkey: boolean
}

const NONE: AppLockMethods = { pin: false, passkey: false }

/** Which methods are configured — read from localStorage so the lock gate never awaits. */
export function getAppLockMethods(): AppLockMethods {
  if (typeof window === 'undefined') return NONE
  try {
    const raw = window.localStorage.getItem(FLAG_KEY)
    if (!raw) return NONE
    const parsed = JSON.parse(raw) as Partial<AppLockMethods>
    return { pin: !!parsed.pin, passkey: !!parsed.passkey }
  } catch {
    return NONE
  }
}

export function appLockEnabled(): boolean {
  const m = getAppLockMethods()
  return m.pin || m.passkey
}

function setMethods(methods: AppLockMethods): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(FLAG_KEY, JSON.stringify(methods))
  emit()
}

// --------------------------------------------------------------- subscribe

const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

/** Components re-render on enable/disable as well as on lock/unlock (vault emits). */
export function onAppLockChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// --------------------------------------------------------------- primitives

// Allocated from an explicit ArrayBuffer so the result satisfies BufferSource
// under TS's strict ArrayBufferLike checks (mirrors envelope.ts).

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(new ArrayBuffer(n))
  crypto.getRandomValues(b)
  return b
}

function toB64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** PRF output is already 256-bit authenticator-derived material; use it directly. */
async function kekFromBytes(bytes: BufferSource): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/**
 * Wrap the unlocked vault's keys under `kek` and persist only the wrapped form.
 * Requires an unlocked vault — enabling a lock is a "while open" operation.
 */
async function persistWrap(
  kek: CryptoKey,
  which: 'pin' | 'passkey',
  salt: string,
  credentialId?: string,
): Promise<void> {
  const vault = getVault()
  if (!vault) throw new Error('Unlock the journal before setting a lock.')

  const wrap: KeyWrap = {
    salt,
    wrappedDek: await wrapKey(vault.dek, kek),
    wrappedIdentity: await sealText(await exportPrivateKey(vault.identityPrivate), kek),
  }

  const record = await loadLockedKeys()
  const next: LockedKeys = record ?? { deviceId: vault.deviceId, identityPublic: vault.identityPublic }
  if (which === 'pin') next.pin = wrap
  else next.passkey = { ...wrap, credentialId: credentialId as string }
  await saveLockedKeys(next)
}

// --------------------------------------------------------------- enable

export async function enablePin(pin: string): Promise<void> {
  await setPin(pin)
  lockVault()
}

/** Re-wrap under a new PIN without locking (the "change PIN" path). */
export async function setPin(pin: string): Promise<void> {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('A PIN is 4 to 8 digits.')
  const salt = randomSalt()
  const kek = await deriveKekFromPassword(pin, salt)
  await persistWrap(kek, 'pin', salt)
  const methods = getAppLockMethods()
  methods.pin = true
  setMethods(methods)
}

export async function enablePasskey(user: AuthUser): Promise<void> {
  const vault = getVault()
  if (!vault) throw new Error('Unlock the journal before setting a lock.')

  const salt = toB64(randomBytes(32))
  const registration = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'Echoes', id: window.location.hostname },
      user: {
        id: new TextEncoder().encode(user.id),
        name: user.email ?? user.id,
        displayName: (user.display_name ?? user.email ?? user.id) as string,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
      timeout: 60_000,
      extensions: { prf: { eval: { first: fromB64(salt) } } },
    },
  })) as PublicKeyCredential | null

  if (!registration) return // user cancelled the OS prompt

  const prf = prfResult(registration)
  if (!prf) {
    throw new Error('This device or browser can’t lock Echoes with a passkey — use a PIN instead.')
  }

  const kek = await kekFromBytes(prf)
  await persistWrap(kek, 'passkey', salt, toB64(new Uint8Array(registration.rawId)))
  const methods = getAppLockMethods()
  methods.passkey = true
  setMethods(methods)
}

// --------------------------------------------------------------- unlock

async function applyWrap(record: LockedKeys, wrap: KeyWrap, kek: CryptoKey): Promise<void> {
  const dek = await unwrapKey(wrap.wrappedDek, kek)
  const identityPrivate = await importPrivateKey(await openText(wrap.wrappedIdentity, kek))
  unlockVault({ dek, identityPrivate, identityPublic: record.identityPublic, deviceId: record.deviceId })
}

export async function unlockWithPin(pin: string): Promise<void> {
  const record = await loadLockedKeys()
  if (!record?.pin) throw new Error('No PIN is set on this device.')
  // A wrong PIN fails the AES-GCM auth tag here — no server round-trip, no
  // oracle beyond the local device.
  const kek = await deriveKekFromPassword(pin, record.pin.salt)
  await applyWrap(record, record.pin, kek)
}

export async function unlockWithPasskey(): Promise<void> {
  const record = await loadLockedKeys()
  if (!record?.passkey) throw new Error('No passkey is set on this device.')

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: window.location.hostname,
      allowCredentials: [{ type: 'public-key', id: fromB64(record.passkey.credentialId) }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: fromB64(record.passkey.salt) } } },
    },
  })) as PublicKeyCredential | null

  if (!assertion) return // user cancelled the OS prompt

  const prf = prfResult(assertion)
  if (!prf) throw new Error('This browser can’t unlock with a passkey. Use the PIN.')

  const kek = await kekFromBytes(prf)
  await applyWrap(record, record.passkey, kek)
}

function prfResult(credential: PublicKeyCredential): Uint8Array<ArrayBuffer> | null {
  const results = credential.getClientExtensionResults() as Record<string, unknown>
  const prf = results.prf as { results?: { first?: ArrayBuffer } } | undefined
  return prf?.results?.first ? new Uint8Array(prf.results.first) : null
}

// --------------------------------------------------------------- disable

/**
 * Remove the lock: the caller is unlocked, so the raw keys are in memory and
 * can be written back to disk as-is. Requires the same unlocked state as
 * enabling (the settings view is behind the lock screen, so this holds).
 */
export async function disableAppLock(): Promise<void> {
  const vault = getVault()
  if (!vault) throw new Error('Unlock the journal before removing the lock.')
  await saveDeviceKeys({
    deviceId: vault.deviceId,
    dek: vault.dek,
    identityPrivate: vault.identityPrivate,
    identityPublic: vault.identityPublic,
  })
  await clearLockedKeys()
  setMethods(NONE)
}

/**
 * The lock flag says a lock exists but no wrapped record does (site data was
 * cleared partway). The keys are unrecoverable either way — offer this instead
 * of silently minting a fresh DEK that could never read the old entries.
 */
export async function isBrokenLock(): Promise<boolean> {
  if (!appLockEnabled()) return false
  const record = await loadLockedKeys()
  return !record
}

export async function resetBrokenLock(): Promise<void> {
  await clearLockedKeys()
  setMethods(NONE)
  lockVault()
}

export { lockVault as lock }
