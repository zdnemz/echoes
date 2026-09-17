'use client'

/**
 * Cached account key bundle — the salt and sealed wraps the PIN (or a
 * remembered KEK, or a passkey PRF) opens. Cached so unlock works with no
 * connection: a cold boot offline would otherwise dead-end at the PIN gate,
 * because every unlock path fetched the bundle from the server first.
 *
 * Safe to keep on this device: the bundle holds a salt, iteration count, a
 * public key, and AES-GCM-sealed blobs. Nothing in it decrypts without the
 * PIN-derived KEK, so a stolen device gains exactly what the server already
 * holds — ciphertext. The KEK itself is never stored here (see session-store
 * for the explicit 30-day remember tradeoff).
 *
 * Staleness is harmless: a PIN change re-wraps the SAME DEK under a new salt,
 * so an old bundle plus the old PIN still opens the same DEK. An old bundle
 * plus the new PIN fails the auth tag like any wrong PIN. If the DEK itself
 * is ever rotated (not just re-wrapped), revisit this.
 *
 * Total functions never throw — a missing cache just means "ask the server",
 * and the PIN gate remains the fallback.
 */

import { getAccountKeys, type AccountKeyBundle } from '@/lib/api/endpoints'
import { isNetworkDrop } from '@/lib/api/client'

const DB = 'echoes-bundle'
const STORE = 'bundle'
const KEY = 'bundle'

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function saveBundle(bundle: AccountKeyBundle): Promise<void> {
  try {
    const db = await openDb()
    if (!db) return
    await new Promise<void>((resolve) => {
      const t = db.transaction(STORE, 'readwrite')
      t.objectStore(STORE).put({ ...bundle }, KEY)
      t.oncomplete = () => resolve()
      t.onerror = () => resolve()
      t.onabort = () => resolve()
    })
    db.close()
  } catch {
    /* the server remains the source of truth */
  }
}

export async function loadBundle(): Promise<AccountKeyBundle | null> {
  try {
    const db = await openDb()
    if (!db) return null
    const rec = await new Promise<AccountKeyBundle | null>((resolve) => {
      const t = db.transaction(STORE, 'readonly')
      const req = t.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as AccountKeyBundle | undefined) ?? null)
      req.onerror = () => resolve(null)
    })
    db.close()
    if (!rec || !rec.salt || !rec.wrapped_dek || !rec.wrapped_private_key) return null
    return rec
  } catch {
    return null
  }
}

export async function clearBundle(): Promise<void> {
  try {
    const db = await openDb()
    if (!db) return
    await new Promise<void>((resolve) => {
      const t = db.transaction(STORE, 'readwrite')
      t.objectStore(STORE).delete(KEY)
      t.oncomplete = () => resolve()
      t.onerror = () => resolve()
      t.onabort = () => resolve()
    })
    db.close()
  } catch {
    /* nothing cached is nothing to forget */
  }
}

/**
 * Server-first bundle read with an offline fallback. Every success refreshes
 * the on-device cache; only a request that never reached the server falls
 * back to it. Auth and config failures propagate untouched — a 401 must route
 * to the landing, never unlock silently from cache.
 */
export async function getBundle(): Promise<AccountKeyBundle> {
  try {
    const fresh = await getAccountKeys()
    await saveBundle(fresh)
    return fresh
  } catch (err) {
    if (isNetworkDrop(err)) {
      const cached = await loadBundle()
      if (cached) return cached
    }
    throw err
  }
}
