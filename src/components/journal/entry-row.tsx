'use client'

/**
 * One entry, as an editorial row — hairline-separated, not boxed. Reused
 * by the notebook list, group journal and search results. Encrypted rows
 * render from the decrypted preview (passed by the list parent) with a
 * sealed fallback when the key is unavailable.
 */

import { motion } from 'framer-motion'
import { EyeSlash, LockKey } from '@phosphor-icons/react/dist/ssr'
import { MoodGlyph } from '@/components/mood/glyphs'
import { excerpt, formatStamp } from '@/lib/format'
import type { Entry } from '@/lib/api/types'

export function EntryRow({
  entry,
  onOpen,
  flash = false,
  authorName,
  showPrivate = false,
  notebookTitle,
  preview,
}: {
  entry: Entry
  onOpen: (entry: Entry) => void
  flash?: boolean
  /** Set for shared notebooks: entries by other members. */
  authorName?: string | null
  /** Highlight the per-entry opt-out marker. */
  showPrivate?: boolean
  /** Set in search results: which notebook this entry lives in. */
  notebookTitle?: string | null
  /** Decrypted title/preview for encrypted rows (null = locked). */
  preview?: { title: string; bodyPreview: string } | null
}) {
  const sealed = entry.encrypted
  const title = sealed ? (preview?.title ?? '') : entry.title
  const body = sealed ? (preview?.bodyPreview ?? '') : entry.body
  const locked = sealed && !preview

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
    >
      <button
        type="button"
        onClick={() => onOpen(entry)}
        className={`press group block w-full border-2 px-3 py-4 text-left transition-colors sm:px-4 ${
          flash ? 'border-accent bg-muted' : 'border-transparent hover:border-foreground hover:bg-muted'
        }`}
      >
        <div className="flex items-baseline gap-3">
          <span className="shrink-0 bg-foreground px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-background">
            {formatStamp(entry.created_at)}
          </span>
          {notebookTitle && (
            <span className="shrink-0 border border-foreground px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase">
              {notebookTitle}
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            {entry.mood && (
              <span title={entry.mood}>
                <span style={{ color: `var(--mood-${entry.mood})` }}>
                  <MoodGlyph mood={entry.mood} className="h-4 w-4" />
                </span>
              </span>
            )}
            {sealed && (
              <span
                title="Encrypted on this device — only you and your circle hold the key"
                className="inline-flex items-center gap-1 font-mono text-[9.5px] font-bold uppercase"
              >
                <LockKey weight="bold" className="h-3.5 w-3.5" /> sealed
              </span>
            )}
            {showPrivate && !entry.is_shared && (
              <span
                title="Kept private from the group"
                className="inline-flex items-center gap-1 border border-foreground bg-background px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase text-accent"
              >
                <EyeSlash weight="bold" className="h-3.5 w-3.5" /> private
              </span>
            )}
          </span>
        </div>

        <h3 className="font-display mt-1.5 text-[19px] uppercase underline-offset-4 group-hover:underline group-hover:decoration-accent group-hover:decoration-[3px]">
          {locked ? 'An entry from another device' : title || 'Untitled entry'}
        </h3>

        {locked ? (
          <p className="mt-1 flex items-center gap-1.5 text-[13.5px] font-bold italic leading-relaxed">
            <LockKey weight="bold" className="h-3.5 w-3.5" /> written on a different device — open it there to read it
          </p>
        ) : (
          body.trim().length > 0 && (
            <p className="mt-1 line-clamp-2 max-w-[70ch] text-[14px] font-bold leading-relaxed">{excerpt(body, 150)}</p>
          )
        )}

        {(entry.tags.length > 0 || authorName) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {entry.tags.slice(0, 5).map((t) => (
              <span key={t} className="font-mono text-[10.5px] font-bold">
                <span className="text-accent">#</span>
                {t}
              </span>
            ))}
            {entry.tags.length > 5 && (
              <span className="font-mono text-[10.5px] font-bold">+{entry.tags.length - 5}</span>
            )}
            {authorName && <span className="ml-auto font-mono text-[10.5px] font-bold">by {authorName}</span>}
          </div>
        )}
      </button>
    </motion.li>
  )
}

/** Skeleton variant — same silhouette, shimmering. */
export function EntryRowSkeleton() {
  return (
    <li className="px-3 py-4 sm:px-4">
      <div className="skeleton-line h-3 w-28" />
      <div className="skeleton-line mt-3 h-5 w-2/3" />
      <div className="skeleton-line mt-2.5 h-3.5 w-full max-w-[70ch]" />
      <div className="skeleton-line mt-1.5 h-3.5 w-1/2" />
    </li>
  )
}
