'use client'

/**
 * Search — over the locally-decrypted corpus (E2EE) with the server search
 * as fallback for pre-encryption rows on locked vaults.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react/dist/ssr'
import { useNotebooks, useSearch } from '@/lib/api/hooks'
import { useVaultStatus } from '@/lib/crypto/use-vault'
import { searchCorpus, useSearchCorpus, type SearchHit } from '@/lib/crypto/local-search'
import { EntryRow, EntryRowSkeleton } from './entry-row'
import type { Entry } from '@/lib/api/types'
import type { View } from './workspace'

export function SearchView({ initialQuery, onNavigate }: { initialQuery: string; onNavigate: (v: View) => void }) {
  const [term, setTerm] = useState(initialQuery)
  const [submitted, setSubmitted] = useState(initialQuery)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const notebooks = useNotebooks()
  const vaultOpen = useVaultStatus()
  const corpus = useSearchCorpus()
  // Server search only covers plaintext-era rows now; with the vault open
  // the local corpus is the source of truth.
  const serverResults = useSearch(submitted, !vaultOpen)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(term.trim())
  }

  // Local hits: decrypted rows straight from the corpus.
  const localHits: SearchHit[] = useMemo(
    () => (vaultOpen && corpus.items ? searchCorpus(corpus.items, submitted) : []),
    [vaultOpen, corpus.items, submitted],
  )
  const serverList = useMemo(() => serverResults.data?.pages.flatMap((p) => p.data) ?? [], [serverResults.data])

  // Unified result rows for rendering — entries with previews.
  const rows: Array<{ entry: Entry; preview?: { title: string; bodyPreview: string } }> = vaultOpen
    ? localHits.map((h) => ({
        entry: h.entry,
        preview: { title: h.title, bodyPreview: h.body.slice(0, 150) },
      }))
    : serverList.map((e) => ({ entry: e }))
  const total = vaultOpen ? localHits.length : (serverResults.data?.pages[0]?.pagination.total ?? 0)

  const nbTitle = (id: string) => notebooks.data?.data.find((nb) => nb.id === id)?.title ?? null
  const loading = vaultOpen ? !corpus.ready && submitted.length > 0 : serverResults.isLoading

  return (
    <div className="mx-4 lg:mx-0">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-clay">search</p>

      <form onSubmit={submit} className="mt-3 flex gap-2.5">
        <div className="relative flex-1">
          <MagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-ink-faint" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="coffee, sourdough, the argument…"
            aria-label="Search your entries"
            className="h-11 w-full rounded-lg border border-line bg-paper-raised pl-11 pr-10 font-serif text-[15px] text-ink placeholder:font-sans placeholder:text-[13px] placeholder:text-ink-faint focus:border-clay-soft focus:outline-none focus:ring-2 focus:ring-clay-soft/40"
          />
          {term && (
            <button
              type="button"
              onClick={() => {
                setTerm('')
                setSubmitted('')
                inputRef.current?.focus()
              }}
              className="press absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-faint hover:text-ink"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </form>

      {/* results */}
      <div className="mt-6">
        {submitted && !loading && (
          <p className="border-b border-line pb-3 font-mono text-[10.5px] text-ink-faint">
            {total === 0
              ? `nothing matches “${submitted}”`
              : `${total} ${total === 1 ? 'entry' : 'entries'} · your own words only${vaultOpen ? ' · decrypted on this device' : ''}`}
          </p>
        )}

        {loading ? (
          <ul className="divide-y divide-line border-b border-line">
            <EntryRowSkeleton />
            <EntryRowSkeleton />
            <EntryRowSkeleton />
          </ul>
        ) : !submitted ? (
          <div className="py-16 text-center">
            <MagnifyingGlass weight="light" className="mx-auto h-8 w-8 text-ink-ghost" />
            <p className="font-display mt-5 text-xl text-ink">Search everything you wrote</p>
            <p className="mx-auto mt-2 max-w-[44ch] text-[12.5px] leading-relaxed text-ink-faint">
              Titles, bodies and tags across every notebook you own — the phrase, the person, the day you can&apos;t
              quite place. Encrypted entries are searched right here, after decryption; the server never sees the words.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-display text-xl text-ink">Nothing in your notebooks matches.</p>
            <p className="mx-auto mt-2 max-w-[44ch] text-[12.5px] leading-relaxed text-ink-faint">
              Try the shorter half of the phrase, or a tag you remember using.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line border-b border-line">
            {rows.map(({ entry, preview }) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                preview={preview}
                notebookTitle={nbTitle(entry.notebook_id)}
                onOpen={(e) => onNavigate({ kind: 'entry', entryId: e.id, notebookId: e.notebook_id })}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
