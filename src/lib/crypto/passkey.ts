'use client'

/**
 * Passkey unlock — a second way to open the same account key bundle.
 *
 * Registration needs the unlocked vault (the DEK is in memory): the
 * authenticator's PRF output becomes a KEK, the DEK is wrapped under it,
 * and only the wrapped blob plus the public salt and credential id are
 * stored on the profile. Unlocking asserts the same passkey, re-derives
 * the KEK from the PRF output, and opens the bundle — no PIN typed.
 *
 * A passkey is bound to one authenticator on one browser, so it can never
 * recover a new device. The PIN stays the portable path; losing the
 * authenticator loses nothing.
 */

import { getVault, unlockWithKek } from './vault'
import { wrapKey } from './envelope'
import { clearAccountPasskey, setAccountPasskey } from '@/lib/api/endpoints'
import { getBundle } from './bundle-store'
import type { AuthUser } from '@/lib/api/types'

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

function prfResult(credential: PublicKeyCredential): Uint8Array<ArrayBuffer> | null {
  const results = credential.getClientExtensionResults() as Record<string, unknown>
  const prf = results.prf as { results?: { first?: ArrayBuffer } } | undefined
  return prf?.results?.first ? new Uint8Array(prf.results.first) : null
}

export function passkeySupported(): boolean {
  return typeof window !== 'undefined' && 'credentials' in navigator && typeof PublicKeyCredential !== 'undefined'
}

/**
 * Bind this browser's authenticator to the account. Silent no-op when the
 * user cancels the OS prompt; throws when the browser can't do PRF.
 */
export async function registerPasskey(user: AuthUser): Promise<void> {
  const vault = getVault()
  if (!vault) throw new Error('Unlock the journal before adding a passkey.')
  if (!passkeySupported())
    throw new Error('This device or browser can’t use a passkey — the PIN still works everywhere.')

  const salt = toB64(randomBytes(32))
  const credential = (await navigator.credentials.create({
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

  if (!credential) return // user cancelled the OS prompt

  const prf = prfResult(credential)
  if (!prf) {
    throw new Error('This device or browser can’t use a passkey with Echoes — the PIN still works everywhere.')
  }

  await setAccountPasskey({
    salt,
    credential_id: toB64(new Uint8Array(credential.rawId)),
    wrapped_dek: await wrapKey(vault.dek, await kekFromBytes(prf)),
  })
}

/**
 * Open the bundle with the registered passkey. Silent no-op on cancel;
 * throws when none is registered or the browser can't do PRF.
 */
export async function unlockWithPasskey(): Promise<void> {
  // Resilient read like the PIN path: the salt and credential id are public,
  // so a cached bundle opens offline and the authenticator does the rest.
  const bundle = await getBundle()
  const pk = bundle.passkey
  if (!pk) throw new Error('No passkey is set on this account.')
  if (!passkeySupported()) throw new Error('This browser can’t unlock with a passkey. Use the PIN.')

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: window.location.hostname,
      allowCredentials: [{ type: 'public-key', id: fromB64(pk.credential_id) }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: { prf: { eval: { first: fromB64(pk.salt) } } },
    },
  })) as PublicKeyCredential | null

  if (!assertion) return // user cancelled the OS prompt

  const prf = prfResult(assertion)
  if (!prf) throw new Error('This browser can’t unlock with a passkey. Use the PIN.')

  await unlockWithKek(await kekFromBytes(prf))
}

export async function removePasskey(): Promise<void> {
  await clearAccountPasskey()
}
