'use client'

/**
 * Account-scoped key vault, unlocked by a PIN.
 *
 * One key bundle per ACCOUNT (not per device): a random DEK and an ECDH
 * identity keypair, stored on the profile as opaque blobs — the DEK wrapped
 * under a KEK derived from the user's PIN (PBKDF2-SHA256), the identity
 * private key wrapped under the DEK. The PIN never leaves the browser, so the
 * server cannot decrypt anything.
 *
 * Why this beats per-device keys: signing in on a new device used to mint
 * fresh keys that could never open the account's existing entries. Now the
 * new device asks for the PIN, re-derives the same KEK, and recovers the exact
 * same keys — every own entry and every group box opens. The tradeoff is
 * deliberate and irreversible: forget the PIN and the entries are gone, since
 * no recovery path exists (that's the price of the server never holding the
 * KEK).
 *
 * The vault lives in memory only. `lock()` drops it; closing the tab drops it.
 * Nothing key-shaped is written to this device.
 */

import {
  PBKDF2_ITERATIONS,
  deriveKekFromPassword,
  exportPrivateKey,
  exportPublicKey,
  generateDataKey,
  generateIdentityKeypair,
  importPrivateKey,
  openSealedKey,
  openText,
  randomSalt,
  sealText,
  unwrapKey,
  wrapKey,
} from './envelope'
import { api, getToken, json } from '@/lib/api/client'
import { getAccountKeys, publishAccountKeys, type AccountKeyBundle, type GroupKeyWraps } from '@/lib/api/endpoints'
import { clearSessionKek, loadSessionKek, saveSessionKek } from './session-store'

/** A remembered browser re-asks the PIN only after 30 idle days. */
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface UnlockedVault {
  dek: CryptoKey
  identityPrivate: CryptoKey
  identityPublic: string
}

/**
 * `resolving`      — asking the server whether a bundle exists (show a loader,
 *                    not a gate: flashing "create a PIN" at a returning user
 *                    would invite them to overwrite their account's keys).
 * `unprovisioned`  — authenticated but no bundle yet: the UI asks to CREATE a PIN.
 * `locked`         — a bundle exists but no keys in memory: the UI asks for the PIN.
 * `unlocked`       — keys are in memory and usable.
 */
export type KeyState = 'resolving' | 'unprovisioned' | 'locked' | 'unlocked'

let vault: UnlockedVault | null = null
let keyState: KeyState = 'resolving'
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function onVaultChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getVault(): UnlockedVault | null {
  return vault
}

export function isUnlocked(): boolean {
  return vault !== null
}

export function getKeyState(): KeyState {
  return keyState
}

const hasStatus = (err: unknown, status: number): boolean => (err as { status?: number }).status === status

/**
 * Resolve the account's key state from the server. This NEVER unlocks —
 * unlocking needs the PIN, which only the user can type. It only decides
 * which question the PIN gate asks: "create one" or "enter yours".
 */
let starting: Promise<void> | null = null

export function ensureKeys(): Promise<void> {
  if (vault) return Promise.resolve()
  if (!starting) {
    starting = resolveKeyState().finally(() => {
      starting = null
    })
  }
  return starting
}

async function resolveKeyState(): Promise<void> {
  if (!getToken()) {
    keyState = 'unprovisioned'
    emit()
    return
  }
  try {
    const bundle = await getAccountKeys()
    if (!bundle.salt || !bundle.wrapped_dek || !bundle.wrapped_private_key) {
      keyState = 'unprovisioned'
      emit()
      return
    }
    // Remembered browser? The stored KEK opens the bundle with no PBKDF2
    // and no prompt. A stale KEK (PIN changed on another device) fails the
    // auth tag — wipe it and fall through to the gate.
    const remembered = await loadSessionKek()
    if (remembered) {
      try {
        const dek = await unwrapKey(bundle.wrapped_dek, remembered)
        const identityPrivate = await importPrivateKey(await openText(bundle.wrapped_private_key, dek))
        vault = { dek, identityPrivate, identityPublic: bundle.public_key ?? '' }
        keyState = 'unlocked'
        emit()
        void saveSessionKek(remembered, REMEMBER_TTL_MS)
        return
      } catch {
        await clearSessionKek()
      }
    }
    keyState = 'locked'
  } catch (err) {
    // 404 = the account never chose a PIN. 401 = the session is gone; the
    // auth layer will route to the landing, so the state here is inert.
    keyState = hasStatus(err, 404) || hasStatus(err, 401) ? 'unprovisioned' : 'locked'
  }
  emit()
}
/**
 * First-time provisioning: choose a PIN, mint the account's keys, publish the
 * wrapped bundle, and unlock in one step. Throws if the server already has a
 * bundle (the gate won't offer this path once one exists).
 */
export async function provisionKeys(pin: string): Promise<void> {
  if (vault) return
  if (!/^\d{4,8}$/.test(pin)) throw new Error('A PIN is 4 to 8 digits.')

  const dek = await generateDataKey()
  const identity = await generateIdentityKeypair()
  const identityPublic = await exportPublicKey(identity.publicKey)
  const salt = randomSalt()
  const kek = await deriveKekFromPassword(pin, salt)

  await publishAccountKeys({
    salt,
    iterations: PBKDF2_ITERATIONS,
    wrapped_dek: await wrapKey(dek, kek),
    public_key: identityPublic,
    // Identity private sits under the DEK, not the KEK, so a PIN change only
    // has to re-wrap the DEK wrap — the identity wrap is untouched.
    wrapped_private_key: await sealText(await exportPrivateKey(identity.privateKey), dek),
  })

  vault = { dek, identityPrivate: identity.privateKey, identityPublic }
  keyState = 'unlocked'
  emit()
  await saveSessionKek(kek, REMEMBER_TTL_MS)
}

/**
 * Unlock with the account PIN on any device. A wrong PIN fails the AES-GCM
 * auth tag while unwrapping the DEK — no server round-trip, no oracle beyond
 * the local device.
 */
export async function unlockWithPin(pin: string): Promise<void> {
  if (vault) return
  const bundle = await getAccountKeys()
  if (!bundle.salt || !bundle.wrapped_dek || !bundle.wrapped_private_key) {
    throw new Error('No account keys are set yet.')
  }
  const kek = await deriveKekFromPassword(pin, bundle.salt, bundle.iterations ?? PBKDF2_ITERATIONS)
  await applyBundle(bundle, kek)
}

/**
 * Unlock with a KEK from any source (PIN derivation, passkey PRF, tests).
 * The KEK itself is the credential — callers must have earned it.
 */
export async function unlockWithKek(kek: CryptoKey): Promise<void> {
  if (vault) return
  await applyBundle(await getAccountKeys(), kek)
}

async function applyBundle(bundle: AccountKeyBundle, kek: CryptoKey): Promise<void> {
  if (!bundle.wrapped_dek || !bundle.wrapped_private_key) {
    throw new Error('No account keys are set yet.')
  }
  const dek = await unwrapKey(bundle.wrapped_dek, kek)
  const identityPrivate = await importPrivateKey(await openText(bundle.wrapped_private_key, dek))
  vault = {
    dek,
    identityPrivate,
    identityPublic: bundle.public_key ?? '',
  }
  keyState = 'unlocked'
  emit()
  await saveSessionKek(kek, REMEMBER_TTL_MS)
}

/**
 * Re-wrap the same DEK under a new PIN. Requires the current PIN (or an
 * already-unlocked vault) — the server rejects a replace without proof of the
 * current wrapped DEK, so a second device can't orphan the account's history.
 */
export async function changePin(oldPin: string, newPin: string): Promise<void> {
  if (!/^\d{4,8}$/.test(newPin)) throw new Error('A PIN is 4 to 8 digits.')
  if (!vault) await unlockWithPin(oldPin)

  const current = await getAccountKeys()
  if (!current.wrapped_dek || !current.wrapped_private_key) {
    throw new Error('No account keys are set yet.')
  }
  const salt = randomSalt()
  const kek = await deriveKekFromPassword(newPin, salt)
  await publishAccountKeys({
    salt,
    iterations: PBKDF2_ITERATIONS,
    wrapped_dek: await wrapKey(vault!.dek, kek),
    public_key: vault!.identityPublic,
    wrapped_private_key: current.wrapped_private_key,
    previous_wrapped_dek: current.wrapped_dek,
  })
  // The changed device stays remembered under the new PIN; remembered KEKs
  // elsewhere die on their next restore.
  await saveSessionKek(kek, REMEMBER_TTL_MS)
}

/**
 * Await this before opening or sealing anything. On a locked vault this
 * resolves to null — callers should be behind the PIN gate, which is the only
 * path to an unlocked vault.
 */
export async function whenReady(): Promise<UnlockedVault | null> {
  await ensureKeys().catch(() => null)
  return vault
}

export function lock(): void {
  vault = null
  keyState = 'locked'
  // Forgetting the remembered KEK is what makes "lock" real — the next
  // visit asks for the PIN again.
  void clearSessionKek()
  emit()
  // Correct to 'unprovisioned' if the account genuinely has no bundle (a
  // brand-new account that locked before provisioning). On an anonymous
  // session the state is inert — the auth layer shows the landing.
  if (getToken()) void ensureKeys().catch(() => null)
}

// --------------------------------------------------------------- group CEKs

const groupCeks = new Map<string, { key: CryptoKey; generation: number }>()

/**
 * This account's sealed box for a group. Every row the route returns is the
 * caller's own (RLS filters on user_id, one box per (group, member)), so the
 * first wrap is mine — opened with the account identity key.
 */
export async function getGroupCek(groupId: string): Promise<CryptoKey | null> {
  const cached = groupCeks.get(groupId)
  if (cached) return cached.key
  if (!vault) return null
  try {
    const res = await api<GroupKeyWraps>(`/api/groups/${groupId}/key`)
    const mine = res.wraps[0]
    if (!mine) return null
    const cek = await openSealedKey(mine.sealed_box, vault.identityPrivate)
    groupCeks.set(groupId, { key: cek, generation: mine.generation })
    return cek
  } catch (err) {
    if (hasStatus(err, 404)) return null
    throw err
  }
}

export function forgetGroupCek(groupId: string): void {
  groupCeks.delete(groupId)
}

export {
  distributeOrRotate,
  ensureMemberCoverage,
  tryFirstDistribution,
  ensureShareableCek,
  coverMyGroups,
} from './group-keys'
