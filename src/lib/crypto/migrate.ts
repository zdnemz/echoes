'use client'

import { useEffect, useState } from 'react'
import { api, json } from '@/lib/api/client'
import { generateDataKey, sealEntry, wrapKey } from './envelope'
import { getVault, ensureShareableCek, isUnlocked, onVaultChange } from './vault'
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

async function fetchBatch(): Promise<Entry[]> {
  const nbs = await api<{ data: Array<{ id: string; group_id: string | null }> }>('/api/notebooks?limit=100')
  const out: Entry[] = []
  for (const nb of nbs.data) {
    const res = await api<{ data: Entry[] }>(`/api/notebooks/${nb.id}/entries?page=1&limit=100`)
    const rows = res.data.filter((e) => !e.encrypted)
    for (const row of rows) {
      groupByEntry[row.id] = nb.group_id
      if (row.is_shared && nb.group_id) sharedByEntry[row.id] = true
    }
    out.push(...rows)
    if (out.length >= BATCH) return out.slice(0, BATCH)
  }
  return out
}

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
      if (!vault) break

      const batch = await fetchBatch().catch(() => [] as Entry[])
      if (batch.length === 0) break

      const payload = await Promise.all(
        batch.map(async (e) => {
          const contentKey = await generateDataKey()
          const sealed = await sealEntry({ title: e.title, body: e.body }, contentKey)
          const authorWrap = await wrapKey(contentKey, vault.dek)
          let groupWrap: string | undefined
          const gid = groupByEntry[e.id]
          if (e.is_shared && gid) {
            try {
              const cek = await ensureShareableCek(gid, e.author_id)
              if (cek) groupWrap = await wrapKey(contentKey, cek)
            } catch {}
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
  } finally {
    state = { ...state, running: false }
    emit()
    inFlight = false
  }
}

export function useEncryptMigration(): MigrationState {
  const [snap, setSnap] = useState(state)

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
