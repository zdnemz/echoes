'use client'

import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'

/**
 * Persists the React Query cache to IndexedDB so the journal opens and reads
 * offline. Safe by construction: queries hold the *server rows* — sealed
 * ciphertext plus key wraps — and decryption happens later, at render, with
 * the vault. Nothing plaintext is ever written here, so a locked device's
 * cached entries stay unreadable, exactly like the outbox.
 *
 * Hand-rolled adapter rather than a localStorage persister: entry bodies make
 * the cache too large for localStorage's ~5MB, and IndexedDB is what the rest
 * of the offline layer already speaks.
 */

const DB = 'echoes-query-cache'
const STORE = 'cache'
const KEY = 'react-query'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> | null {
  if (typeof indexedDB === 'undefined') return null
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function read(key: string): Promise<string | null> {
  const db = openDb()
  if (!db) return Promise.resolve(null)
  return db.then(
    (d) =>
      new Promise((resolve) => {
        const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(key)
        req.onsuccess = () => resolve((req.result as string | undefined) ?? null)
        req.onerror = () => resolve(null)
      }),
  )
}

function write(key: string, value: string): Promise<void> {
  const db = openDb()
  if (!db) return Promise.resolve()
  return db.then(
    (d) =>
      new Promise((resolve) => {
        const req = d.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key)
        req.onsuccess = () => resolve()
        req.onerror = () => resolve() // A full quota or lock never breaks the app.
      }),
  )
}

function clear(key: string): Promise<void> {
  const db = openDb()
  if (!db) return Promise.resolve()
  return db.then(
    (d) =>
      new Promise((resolve) => {
        const req = d.transaction(STORE, 'readwrite').objectStore(STORE).delete(key)
        req.onsuccess = () => resolve()
        req.onerror = () => resolve()
      }),
  )
}

export const idbPersister = createAsyncStoragePersister({
  storage: {
    // NOTE: AsyncStorage is (key, value) — an earlier revision aliased
    // single-arg functions here, which stored the KEY as the value and broke
    // every restore with a JSON.parse error. The signatures below are load-bearing.
    getItem: (key) => read(key),
    setItem: (key, value) => write(key, value),
    removeItem: (key) => clear(key),
  },
  key: KEY,
  // Writes are coalesced — the editor autosaves, so an unthrottled persister
  // would hammer IndexedDB on every keystroke.
  throttleTime: 1_500,
})
