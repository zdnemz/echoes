'use client'

/**
 * Lazy E2EE migration — existing plaintext entries get sealed client-side.
 *
 * Runs when the vault unlocks and unencrypted entries exist. Batches are
 * listed (RLS-scoped, plaintext rows only), sealed under a fresh per-entry
 * content key with an author wrap, and flipped via /me/encrypt-migrate.
 * Progress surfaces to the settings screen; a failed batch leaves those
 * rows plaintext — the next unlock resumes, nothing is ever lost.
 */

import { useEffect, useState } from 'react'
import { api, json } from '@/lib/api/client'
import { generateDataKey, sealEntry, wrapKey } from './envelope'
import { getVault, getGroupCek, isUnlocked, onVaultChange } from './vault'
import type { Entry } from '@/lib/api/types'

const BATCH = 25

export interface MigrationState {
  running: boolean
  remaining: number
  migrated: number
}

let state: MigrationState = { running: false, remaining: 0, migrated: 0 }
const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}

/** List the caller's oldest unencrypted entries (both flags honored). */
async function fetchBatch(): Promise<Entry[]> {
  const nbs = await api<{ data: Array<{ id: string; group_id: string | null }> }>('/api/notebooks?limit=100')
  const out: Entry[] = []
  for (const nb of nbs.data) {
    const res = await api<{ data: Entry[] }>(`/api/notebooks/${nb.id}/entries?page=1&limit=100`)
    const rows = res.data.filter((e) => !e.encrypted)
    // Tag rows with their notebook's group so shared entries get the group
    // CEK wrap alongside the author wrap.
    for (const row of rows) {
      groupByEntry[row.id] = nb.group_id
      if (row.is_shared && nb.group_id) sharedByEntry[row.id] = true
    }
    out.push(...rows)
    if (out.length >= BATCH) return out.slice(0, BATCH)
  }
  return out
}

// Entry → notebook group / shared flags discovered during listing.
const groupByEntry: Record<string, string | null> = {}
const sharedByEntry: Record<string, boolean> = {}

let inFlight = false

export async function runMigration(): Promise<void> {
  if (inFlight) return
  inFlight = true
  state = { ...state, running: true }
  emit()
  try {
    for (;;) {
      const vault = getVault()
      if (!vault) break // locked mid-run — next unlock resumes

      const batch = await fetchBatch().catch(() => [] as Entry[])
      if (batch.length === 0) break

      const payload = await Promise.all(
        batch.map(async (e) => {
          const contentKey = await generateDataKey()
          const sealed = await sealEntry({ title: e.title, body: e.body }, contentKey)
          const authorWrap = await wrapKey(contentKey, vault.dek)
          // Shared entries in group notebooks also get a group-CEK wrap so
          // members stay readers. Without a distributed CEK the group wrap
          // is skipped — the owner distributes keys from the share panel.
          let groupWrap: string | undefined
          const gid = groupByEntry[e.id]
          if (e.is_shared && gid) {
            try {
              const cek = await getGroupCek(gid)
              if (cek) groupWrap = await wrapKey(contentKey, cek)
            } catch {
              /* no CEK distributed yet — author wrap only */
            }
          }
          return { id: e.id, title_cipher: sealed, body_cipher: sealed, author_wrap: authorWrap, group_wrap: groupWrap }
        }),
      )

      const res = await api<{ migrated: number; remaining: number }>('/api/me/encrypt-migrate', {
        method: 'POST',
        ...json({ entries: payload }),
      })
      state = { running: true, remaining: res.remaining, migrated: state.migrated + res.migrated }
      emit()
      if (res.remaining === 0) break
    }
  } catch {
    // network/API failure mid-batch — rows stay plaintext, resumable
  } finally {
    state = { ...state, running: false }
    emit()
    inFlight = false
  }
}

/** Observe migration progress; auto-start once when the vault opens. */
export function useEncryptMigration(): MigrationState {
  const [snap, setSnap] = useState<MigrationState>(state)

  useEffect(() => {
    const l = () => setSnap({ ...state })
    listeners.add(l)
    const offVault = onVaultChange(() => {
      l()
      if (isUnlocked()) void runMigration()
    })
    if (isUnlocked()) void runMigration()
    return () => {
      listeners.delete(l)
      offVault()
    }
  }, [])

  return snap
}
