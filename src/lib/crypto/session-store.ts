'use client'

/**
 * Remembered unlock — the KEK that opens the account bundle, kept on this
 * browser so a returning session doesn't re-ask the PIN.
 *
 * The stored KEK decrypts exactly what the PIN decrypts, so a remembered
 * browser is as powerful as a typed PIN: that is the explicit tradeoff of
 * "remember me". Locking (menu, settings, sign-out) wipes it, and it dies
 * on its own after 30 idle days. A PIN change elsewhere silently
 * invalidates it — the old KEK fails the auth tag and the gate reappears.
 *
 * Total functions: they never throw (private mode, quota, no IndexedDB
 * under tests) — the PIN gate is always the fallback.
 */

const DB = 'echoes-session'
const STORE = 'kek'
const KEY = 'kek'

interface StoredSession {
  kek: CryptoKey
  expiresAt: number
}

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

export async function saveSessionKek(kek: CryptoKey, ttlMs: number): Promise<void> {
  try {
    const db = await openDb()
    if (!db) return
    await new Promise<void>((resolve) => {
      const t = db.transaction(STORE, 'readwrite')
      t.objectStore(STORE).put({ kek, expiresAt: Date.now() + ttlMs }, KEY)
      t.oncomplete = () => resolve()
      t.onerror = () => resolve()
      t.onabort = () => resolve()
    })
    db.close()
  } catch {
    /* the PIN gate remains the fallback */
  }
}

export async function loadSessionKek(): Promise<CryptoKey | null> {
  try {
    const db = await openDb()
    if (!db) return null
    const rec = await new Promise<StoredSession | null>((resolve) => {
      const t = db.transaction(STORE, 'readonly')
      const req = t.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as StoredSession | undefined) ?? null)
      req.onerror = () => resolve(null)
    })
    db.close()
    if (!rec || rec.expiresAt <= Date.now() || !rec.kek) {
      if (rec) void clearSessionKek()
      return null
    }
    return rec.kek
  } catch {
    return null
  }
}

export async function clearSessionKek(): Promise<void> {
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
    /* already forgotten for all practical purposes */
  }
}
