/**
 * Client-side envelope encryption for journal entries — pure WebCrypto, no deps.
 *
 * Threat model: the database (and anyone with a dump of it) must never see
 * entry titles or bodies. Every entry's text is sealed client-side under a
 * per-entry AES-256-GCM key; that key is wrapped twice:
 *
 *   private entries → wrapped with the user's KEK (derived from the
 *                     password via PBKDF2-SHA256; the wrap is stored on the
 *                     profile — the password itself never leaves the client)
 *   shared entries  → ALSO wrapped with the group's CEK, itself distributed
 *                     to each member as a sealed box against their ECDH
 *                     identity key (server can see sealed boxes, not contents)
 *
 * Metadata the RLS policies and the UI need to sort/filter (notebook_id,
 * author_id, mood, tags, timestamps, is_shared) stays queryable by design.
 *
 * All functions here are pure and synchronous-keyed — `bun test` covers them
 * without mocks because Bun implements the full WebCrypto API.
 */

// --------------------------------------------------------------- primitives

const enc = new TextEncoder()
const dec = new TextDecoder()

export const PBKDF2_ITERATIONS = 600_000

/** v1 marker + separated parts; forward compat without a format registry. */
const CIPHER_VERSION = 'v1'

function b64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Fixed-size safe equality (timing-attack resistant compare of tags). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// --------------------------------------------------------------- key creation

/** Random AES-256-GCM data key (per entry, or the user's KEK-protected DEK). */
export async function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

/** Random 128-bit salt for password KDF — public by design. */
export function randomSalt(): string {
  const s = new Uint8Array(16)
  crypto.getRandomValues(s)
  return b64(s)
}

/**
 * Password → KEK (AES-GCM key for wrapping/unwrapping the DEK).
 * PBKDF2-SHA256, 600k iterations (OWASP 2024 guidance for SHA-256).
 * The salt is stored next to the wrapped DEK on the profile.
 */
export async function deriveKekFromPassword(
  password: string,
  salt: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(salt), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// --------------------------------------------------------------- wrap / unwrap

/** Wrap an extractable AES key to base64 with a wrapping key (AES-GCM). */
export async function wrapKey(key: CryptoKey, wrapper: CryptoKey): Promise<string> {
  const buf = await crypto.subtle.exportKey('raw', key)
  const raw = new Uint8Array(buf)
  return sealBytes(raw, wrapper)
}

/** Unwrap a base64-wrapped key. Throws if the wrapper is wrong (auth tag fails). */
export async function unwrapKey(wrapped: string, wrapper: CryptoKey): Promise<CryptoKey> {
  const raw = await openBytes(wrapped, wrapper)
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
}

/** Seal raw bytes (iv ‖ ciphertext) — the shared core of wrap/seal. */
async function sealBytes(raw: Uint8Array<ArrayBuffer>, wrapper: CryptoKey): Promise<string> {
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapper, raw))
  const blob = new Uint8Array(iv.length + sealed.length)
  blob.set(iv)
  blob.set(sealed, iv.length)
  return `${CIPHER_VERSION}.${b64(blob)}`
}

/** Open raw bytes sealed by sealBytes. */
async function openBytes(sealedText: string, wrapper: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  const [version, blobB64] = sealedText.split('.')
  if (version !== CIPHER_VERSION || !blobB64) throw new Error('bad ciphertext format')
  const blob = unb64(blobB64)
  const iv = blob.slice(0, 12)
  const sealed = blob.slice(12)
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrapper, sealed)
  return new Uint8Array(buf)
}

// --------------------------------------------------------------- text sealing

/** What gets sealed per entry: title + body together under one key. */
export interface EntrySecret {
  title: string
  body: string
}

/** Encrypt an entry secret under a key → opaque string stored in `body`. */
export async function sealText(text: string, key: CryptoKey): Promise<string> {
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)))
  const blob = new Uint8Array(iv.length + sealed.length)
  blob.set(iv)
  blob.set(sealed, iv.length)
  return `${CIPHER_VERSION}.${b64(blob)}`
}

/** Decrypt a sealed string. Throws on wrong key / tampered ciphertext. */
export async function openText(sealedText: string, key: CryptoKey): Promise<string> {
  const [version, blobB64] = sealedText.split('.')
  if (version !== CIPHER_VERSION || !blobB64) throw new Error('bad ciphertext format')
  const blob = unb64(blobB64)
  const iv = blob.slice(0, 12)
  const sealed = blob.slice(12)
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, sealed))
}

/** Is this string an encrypted payload rather than plaintext markdown? */
export function isSealed(s: string): boolean {
  return s.startsWith(`${CIPHER_VERSION}.`)
}

/**
 * Seal {title, body} as one JSON blob — one column, atomic decrypt.
 * The JSON envelope keeps the pair versionable.
 */
export async function sealEntry(secret: EntrySecret, key: CryptoKey): Promise<string> {
  return sealText(JSON.stringify(secret), key)
}

/** Inverse of sealEntry. */
export async function openEntry(sealed: string, key: CryptoKey): Promise<EntrySecret> {
  return JSON.parse(await openText(sealed, key)) as EntrySecret
}

// --------------------------------------------------------------- identity keys

/**
 * ECDH P-256 identity keypair for sealed-box key distribution.
 * Private key stays wrapped under the user's KEK on the profile; the public
 * key is published for anyone who needs to send the user a group key.
 */
export async function generateIdentityKeypair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']) as Promise<CryptoKeyPair>
}

export async function exportPublicKey(spki: CryptoKey): Promise<string> {
  return b64(new Uint8Array(await crypto.subtle.exportKey('spki', spki)))
}
export async function exportPrivateKey(pkcs8: CryptoKey): Promise<string> {
  return b64(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pkcs8)))
}
export async function importPublicKey(spki: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', unb64(spki), { name: 'ECDH', namedCurve: 'P-256' }, true, [])
}
export async function importPrivateKey(pkcs8: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', unb64(pkcs8), { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])
}

// --------------------------------------------------------------- sealed boxes

/**
 * Wrap a group CEK for one specific recipient: ECDH(recipient public,
 * sender private) → shared secret → AES-GCM wrap of the CEK.
 *
 * The server relays the sealed box but cannot open it (it holds neither
 * side's private key). The recipient needs the sender's public key to
 * derive the same secret, so it travels inside the box (public data).
 */
export async function sealKeyFor(
  recipientPublicSpki: string,
  cek: CryptoKey,
  senderPrivatePkcs8: CryptoKey,
  senderPublicSpki: string,
): Promise<string> {
  const recipientPub = await importPublicKey(recipientPublicSpki)
  const shared = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: recipientPub },
    senderPrivatePkcs8,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  const box = await wrapKey(cek, shared)
  return JSON.stringify({ v: CIPHER_VERSION, s: senderPublicSpki, box })
}

export async function openSealedKey(sealedBox: string, myPrivatePkcs8: CryptoKey): Promise<CryptoKey> {
  const parsed = JSON.parse(sealedBox) as { v?: string; s?: string; box?: string }
  if (parsed.v !== CIPHER_VERSION || !parsed.s || !parsed.box) throw new Error('bad sealed box format')
  const senderPub = await importPublicKey(parsed.s)
  const shared = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: senderPub },
    myPrivatePkcs8,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  return unwrapKey(parsed.box, shared)
}
