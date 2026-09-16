'use client'

/**
 * Local (client-side) search over the decrypted corpus.
 *
 * Server-side ilike search is dead for encrypted rows by design — the
 * server never sees plaintext again. This hook builds the corpus once per
 * vault session (every own entry, decrypted with the DEK), caches it, and
 * runs a case-insensitive scan over title/body/tags. For a personal
 * journal (thousands of entries, each a few KB) this is a sub-10ms scan
 * on the main thread — no worker needed yet.
 * ponytail: move to an indexed worker if corpora exceed ~10 MB.
 */

import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api/client'
import { openFromStorage } from './entry-codec'
import { isUnlocked, onVaultChange, whenReady } from './vault'
import type { Entry } from '@/lib/api/types'

export interface SearchHit {
  entry: Entry
  title: string
  body: string
}

interface CorpusItem {
  entry: Entry
  title: string
  body: string
  haystack: string
}

let corpusCache: CorpusItem[] | null = null
const corpusListeners = new Set<() => void>()

export function invalidateCorpus() {
  corpusCache = null
  for (const l of corpusListeners) l()
}

async function buildCorpus(): Promise<CorpusItem[]> {
  // List every entry the caller can see in their own notebooks (RLS).
  const nbs = await api<{ data: Array<{ id: string; group_id: string | null }> }>('/api/notebooks?limit=100')
  const items: CorpusItem[] = []
  for (const nb of nbs.data) {
    let page = 1
    for (;;) {
      const res = await api<{ data: Entry[]; pagination: { page: number; limit: number; total: number } }>(
        `/api/notebooks/${nb.id}/entries?page=${page}&limit=100`,
      )
      for (const e of res.data) {
        let title = e.title
        let body = e.body
        if (e.encrypted) {
          try {
            // own rows open via the author wrap; other members' shared rows
            // via the group CEK — the resolver needs the notebook's group.
            const opened = await openFromStorage(e, e.author_id, nb.group_id)
            title = opened.title
            body = opened.body
          } catch {
            continue // locked row — not searchable locally
          }
        }
        items.push({
          entry: e,
          title,
          body,
          haystack: `${title}\n${body}\n${(e.tags ?? []).join(' ')}`.toLowerCase(),
        })
      }
      if (page * res.pagination.limit >= res.pagination.total || res.data.length === 0) break
      page += 1
    }
  }
  return items
}

let corpusPromise: Promise<CorpusItem[] | null> | null = null

/**
 * Resolve to the decrypted corpus (null when the vault has no keys — nothing
 * is readable). Builds on demand and shares the hook's cache, so the Reflect
 * composer can attach a bundle to its very first message even on a cold load
 * where the hook hasn't populated yet.
 */
export async function corpusReady(): Promise<CorpusItem[] | null> {
  if (corpusCache) return corpusCache
  if (corpusPromise) return corpusPromise
  const vault = await whenReady()
  if (!vault) return null
  corpusPromise = buildCorpus()
    .then((built) => {
      corpusCache = built
      for (const l of corpusListeners) l()
      return built
    })
    .catch(() => null)
    .finally(() => {
      corpusPromise = null
    })
  return corpusPromise
}

/** One-shot corpus build + cache. Rebuilds on vault lock/unlock. */
export function useSearchCorpus(): { items: CorpusItem[] | null; ready: boolean } {
  const [items, setItems] = useState<CorpusItem[] | null>(corpusCache)
  const [ready, setReady] = useState(corpusCache !== null)

  useEffect(() => {
    const sync = () => {
      // Derived from the shared cache — no cascading state, just mirroring.
      if (corpusCache) {
        setItems(corpusCache)
        setReady(true)
      } else {
        setItems(null)
        setReady(false)
      }
    }
    const rebuild = () => {
      corpusCache = null
      if (!isUnlocked()) {
        sync()
        return
      }
      void buildCorpus()
        .then((built) => {
          corpusCache = built
          sync()
          for (const l of corpusListeners) l()
        })
        .catch(() => setReady(false))
    }
    if (!corpusCache && isUnlocked()) rebuild()
    else sync()
    const off = onVaultChange(() => {
      if (!isUnlocked()) {
        corpusCache = null
        sync()
      } else if (!corpusCache) rebuild()
    })
    // First load generates the keys asynchronously, so the corpus build has
    // to be retried once they exist — otherwise search stays empty forever.
    void whenReady().then(() => {
      if (isUnlocked() && !corpusCache) rebuild()
    })
    return off
  }, [])

  return { items, ready }
}

/** Case-insensitive scan; empty term → no hits. */
export function searchCorpus(items: CorpusItem[], term: string): SearchHit[] {
  const t = term.trim().toLowerCase()
  if (!t) return []
  return items
    .filter((i) => i.haystack.includes(t))
    .slice(0, 100)
    .map((i) => ({ entry: i.entry, title: i.title, body: i.body }))
}
