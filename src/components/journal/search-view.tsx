'use client'

/**
 * Search — over the locally-decrypted corpus. The server never sees the
 * words, so every hit is resolved on this device.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react/dist/ssr'
import { useNotebooks } from '@/lib/api/hooks'
import { searchCorpus, useSearchCorpus, type SearchHit } from '@/lib/crypto/local-search'
import { EntryRow, EntryRowSkeleton } from './entry-row'
import type { Entry } from '@/lib/api/types'
import type { View } from './workspace'

export function SearchView({ initialQuery, onNavigate }: { initialQuery: string; onNavigate: (v: View) => void }) {
  const [term, setTerm] = useState(initialQuery)
  const [submitted, setSubmitted] = useState(initialQuery)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const notebooks = useNotebooks()
  const corpus = useSearchCorpus()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(term.trim())
  }

  // Local hits: decrypted rows straight from the corpus.
  const localHits: SearchHit[] = useMemo(
    () => (corpus.items ? searchCorpus(corpus.items, submitted) : []),
    [corpus.items, submitted],
  )

  // Unified result rows for rendering — entries with previews.
  const rows: Array<{ entry: Entry; preview?: { title: string; bodyPreview: string } }> = localHits.map((h) => ({
    entry: h.entry,
    preview: { title: h.title, bodyPreview: h.body.slice(0, 150) },
  }))
  const total = localHits.length

  const nbTitle = (id: string) => notebooks.data?.data.find((nb) => nb.id === id)?.title ?? null
  const loading = !corpus.ready && submitted.length > 0

  return (
    <div className="mx-4 lg:mx-0">
      <p className="inline-block bg-foreground px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.18em] text-background">
        search
      </p>

      <form onSubmit={submit} className="mt-3 flex gap-2.5">
        <div className="relative flex-1">
          <MagnifyingGlass
            weight="bold"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2"
          />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="COFFEE, SOURDOUGH, THE ARGUMENT…"
            aria-label="Search your entries"
            className="h-11 w-full border-2 border-foreground bg-background pl-11 pr-10 font-mono text-[14px] font-bold placeholder:font-mono placeholder:text-[12px] placeholder:text-muted-foreground focus:border-accent focus:outline-none"
          />
          {term && (
            <button
              type="button"
              onClick={() => {
                setTerm('')
                setSubmitted('')
                inputRef.current?.focus()
              }}
              className="press absolute right-3 top-1/2 -translate-y-1/2 border border-foreground p-1 hover:bg-muted"
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
          <p className="border-b-2 border-foreground pb-3 font-mono text-[10.5px] font-bold uppercase">
            {total === 0
              ? `nothing matches “${submitted}”`
              : `${total} ${total === 1 ? 'entry' : 'entries'} · your own words only`}
          </p>
        )}

        {loading ? (
          <ul className="divide-y-2 divide-foreground border-b-2 border-foreground">
            <EntryRowSkeleton />
            <EntryRowSkeleton />
            <EntryRowSkeleton />
          </ul>
        ) : !submitted ? (
          <div className="py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center border-2 border-foreground bg-muted">
              <MagnifyingGlass weight="bold" className="h-6 w-6" />
            </div>
            <p className="font-display mt-5 text-xl uppercase">Search everything you wrote</p>
            <p className="mx-auto mt-2 max-w-[44ch] border-l-4 border-accent pl-3 text-left text-[12.5px] font-bold leading-relaxed">
              Titles, bodies and tags across every notebook you own — the phrase, the person, the day you can&apos;t
              quite place. Encrypted entries are searched right here, after decryption; the server never sees the words.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="font-display text-xl uppercase">Nothing in your notebooks matches.</p>
            <p className="mx-auto mt-2 max-w-[44ch] border-l-4 border-accent pl-3 text-left text-[12.5px] font-bold leading-relaxed">
              Try the shorter half of the phrase, or a tag you remember using.
            </p>
          </div>
        ) : (
          <ul className="divide-y-2 divide-foreground border-b-2 border-foreground">
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
