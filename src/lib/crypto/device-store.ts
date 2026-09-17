'use client'

const DB = 'echoes-keys'
const STORE = 'device'
const KEY = 'keys'
const LOCKED_KEY = 'locked'

interface StoredKeys {
  deviceId: string
  dek: CryptoKey
  identityPrivate: CryptoKey
  identityPublic: string
}

/**
 * The app-lock form of the same keys: the raw DEK and identity private key are
 * gone from this device, replaced by AES-GCM wraps that only a PIN (PBKDF2) or
 * a passkey (WebAuthn PRF) can unwrap. Until one is presented, nothing here can
 * decrypt an entry.
 */
export interface LockedKeys {
  deviceId: string
  identityPublic: string
  pin?: KeyWrap
  passkey?: KeyWrap & { credentialId: string }
}

export interface KeyWrap {
  salt: string
  wrappedDek: string
  wrappedIdentity: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function loadDeviceKeys(): Promise<StoredKeys | null> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function saveDeviceKeys(keys: StoredKeys): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(keys, KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearDeviceKeys(): Promise<void> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {}
}

export async function loadLockedKeys(): Promise<LockedKeys | null> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(LOCKED_KEY)
      req.onsuccess = () => resolve((req.result as LockedKeys | undefined) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function saveLockedKeys(keys: LockedKeys): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(keys, LOCKED_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function clearLockedKeys(): Promise<void> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(LOCKED_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {}
}
