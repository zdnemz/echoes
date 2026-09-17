'use client'

/**
 * Offline outbox — the durable queue for entry writes made with no network.
 *
 * Security by construction: the only thing ever queued here is the *already
 * sealed* payload that the mutation would have PUT'd to the server (title and
 * body are ciphertext produced by sealForStorage). Plaintext is never written
 * to disk, so a locked device with a pending queue is still unreadable.
 *
 * Offline creates get a client-generated UUID (`local_…`) so the editor can
 * navigate to the not-yet-server-real entry immediately; `remap` holds the
 * local→server id translation filled in when the create finally lands, and
 * later queued ops referencing the local id are re-targeted through it.
 */

export type OutboxKind = 'create-entry' | 'update-entry' | 'delete-entry'

export interface OutboxOp {
  id: string
  kind: OutboxKind
  /** create: the notebook to create in. update/delete: unused (entryId holds it). */
  notebookId?: string
  /** Server id, or a `local_` id for an entry created while offline. */
  entryId?: string
  /** The sealed payload verbatim — ciphertext + key wraps. */
  payload: Record<string, unknown>
  /** updated_at the client saw when it loaded the entry, for staleness checks. */
  baseUpdatedAt?: string
  createdAt: number
  status: 'pending' | 'syncing' | 'failed'
  /** Retry budget — a permanently failed op shouldn't block the queue forever. */
  attempts: number
  /** Last server reason, surfaced to the user as "couldn't sync this entry". */
  lastError?: string
}

const DB = 'echoes-outbox'
const OPS = 'ops'
const REMAP = 'remap'

const MAX_ATTEMPTS = 5

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(OPS)) db.createObjectStore(OPS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(REMAP)) db.createObjectStore(REMAP)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export function createLocalEntryId(): string {
  return `local_${crypto.randomUUID()}`
}

export function isLocalId(id: string | undefined | null): id is string {
  return !!id && id.startsWith('local_')
}

/**
 * Pure coalescing decision for one incoming op against the queue's existing
 * ops for the same entry. Kept free of IndexedDB so it can be unit-tested
 * directly. Rules:
 *  - update after update  → newest payload wins, base preserved (all offline
 *    edits share the last server `updated_at` the client saw, so replaying
 *    three updates in a row would otherwise make the staleness guard
 *    false-positive on the second one).
 *  - delete after update  → the edits are moot; only the delete is kept.
 *  - delete of a `local_` entry whose create is still queued → nothing
 *    server-side exists yet, so the create is dropped and nothing is queued.
 */
export function planCoalesce(
  incoming: Omit<OutboxOp, 'id' | 'createdAt' | 'status' | 'attempts'>,
  existing: OutboxOp[],
): { deleteIds: string[]; put?: OutboxOp } {
  const entryId = incoming.entryId
  const mine = entryId ? existing.filter((o) => o.entryId === entryId) : []
  const full: OutboxOp = {
    ...incoming,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    status: 'pending',
    attempts: 0,
  }

  // Delete of an offline-created, never-synced entry: its queued create is all
  // that exists of it, so drop that and queue nothing.
  if (incoming.kind === 'delete-entry' && isLocalId(entryId) && mine.some((o) => o.kind === 'create-entry')) {
    return { deleteIds: mine.map((o) => o.id) }
  }

  // A delete makes any pending edits to the same row pointless.
  const deleteIds =
    incoming.kind === 'delete-entry' ? mine.filter((o) => o.kind === 'update-entry').map((o) => o.id) : []

  // A second write of the same kind replaces the queued one.
  const dup = mine.find((o) => o.kind === incoming.kind)
  if (dup) {
    return {
      deleteIds,
      put: { ...dup, payload: incoming.payload, baseUpdatedAt: incoming.baseUpdatedAt ?? dup.baseUpdatedAt },
    }
  }
  return { deleteIds, put: full }
}

/** Apply a coalescing plan and enqueue the resulting op. Returns the op id. */
export async function enqueueOp(op: Omit<OutboxOp, 'id' | 'createdAt' | 'status' | 'attempts'>): Promise<string> {
  const db = await openDb()
  const existing = await listOps()
  const plan = planCoalesce(op, existing)
  const id = await new Promise<string>((resolve, reject) => {
    const t = db.transaction(OPS, 'readwrite')
    const store = t.objectStore(OPS)
    for (const del of plan.deleteIds) store.delete(del)
    if (plan.put) store.put(plan.put)
    t.oncomplete = () => resolve(plan.put?.id ?? '')
    t.onerror = () => reject(t.error)
  })
  notify()
  return id
}

/** All pending/syncing/failed ops in insertion order. */
export async function listOps(): Promise<OutboxOp[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(OPS, 'readonly')
    const req = t.objectStore(OPS).getAll()
    req.onsuccess = () => resolve((req.result as OutboxOp[]).sort((a, b) => a.createdAt - b.createdAt))
    req.onerror = () => reject(req.error)
  })
}

export async function updateOp(id: string, patch: Partial<OutboxOp>): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(OPS, 'readwrite')
    const store = t.objectStore(OPS)
    const get = store.get(id)
    get.onsuccess = () => {
      const existing = get.result as OutboxOp | undefined
      if (!existing) return resolve()
      const next = { ...existing, ...patch }
      const put = store.put(next)
      put.onsuccess = () => resolve()
      put.onerror = () => reject(put.error)
    }
    get.onerror = () => reject(get.error)
  })
  notify()
}

export async function removeOp(id: string): Promise<void> {
  await tx(OPS, 'readwrite', (s) => s.delete(id))
  notify()
}

/** Count of ops still worth syncing — failed-but-under-budget included. */
export async function pendingCount(): Promise<number> {
  const ops = await listOps()
  return ops.filter((o) => o.status !== 'syncing' && o.attempts < MAX_ATTEMPTS).length
}

/** The queued create for a `local_` id, if the entry has not synced yet. */
export async function findQueuedCreate(localId: string): Promise<OutboxOp | null> {
  if (!isLocalId(localId)) return null
  const ops = await listOps()
  return ops.find((o) => o.entryId === localId && o.kind === 'create-entry') ?? null
}

// ---------------------------------------------------------------- remap

export async function rememberIdMap(localId: string, serverId: string): Promise<void> {
  await tx(REMAP, 'readwrite', (s) => s.put(serverId, localId))
}

/** Resolve a possibly-local id to its server id, once the create has landed. */
export async function resolveId(id: string): Promise<string> {
  if (!isLocalId(id)) return id
  return (await tx(REMAP, 'readonly', (s) => s.get(id))) ?? id
}

export async function dropIdMap(localId: string): Promise<void> {
  await tx(REMAP, 'readwrite', (s) => s.delete(localId))
}

export const OUTBOX_MAX_ATTEMPTS = MAX_ATTEMPTS

// ---------------------------------------------------------------- observers

type Listener = () => void
const listeners = new Set<Listener>()

function notify() {
  listeners.forEach((l) => l())
}

export function onOutboxChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
