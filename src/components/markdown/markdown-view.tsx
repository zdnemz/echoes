'use client'

/**
 * The typeset reading view for markdown entries — used by the
 * shared-notebook reading mode and landing-page artifacts. Serif body,
 * mono code, clay blockquote rules, hairline dividers. The editor is
 * WYSIWYG now (no live preview); its content CSS mirrors this file.
 */

import ReactMarkdown, { type Components } from 'react-markdown'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

const components: Components = {
  h1: ({ children }) => <h1 className="font-display mt-8 mb-3 text-3xl leading-tight text-ink">{children}</h1>,
  h2: ({ children }) => <h2 className="font-display mt-7 mb-2.5 text-2xl leading-tight text-ink">{children}</h2>,
  h3: ({ children }) => <h3 className="font-display mt-6 mb-2 text-xl leading-snug text-ink">{children}</h3>,
  h4: ({ children }) => <h4 className="font-display mt-5 mb-2 text-lg text-ink">{children}</h4>,
  p: ({ children }) => <p className="mb-4 leading-[1.75] text-ink-soft">{children}</p>,
  a: ({ children, href }) => {
    // Entries are shared with other people — never let author-supplied
    // markdown run script URLs in a reader's browser.
    const safe = typeof href === 'string' && /^(https?:|mailto:|#|\/|[^:/?#]*([?#]|$))/i.test(href) ? href : undefined
    if (!safe) return <span className="text-ink-soft">{children}</span>
    const external = /^https?:/i.test(safe)
    return (
      <a
        href={safe}
        {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
        className="text-clay-ink underline decoration-clay-soft underline-offset-[3px] hover:decoration-clay"
      >
        {children}
      </a>
    )
  },
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="font-serif italic text-ink">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-5 border-l-2 border-clay pl-4 font-serif italic text-ink-soft">{children}</blockquote>
  ),
  ul: ({ children }) => <ul className="mb-4 list-disc space-y-1.5 pl-5 leading-[1.7] text-ink-soft">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1.5 pl-5 leading-[1.7] text-ink-soft">{children}</ol>,
  hr: () => <hr className="my-7 border-0 border-t border-line" />,
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? '')
    if (isBlock) {
      return (
        <code className="block overflow-x-auto rounded-md border border-line bg-paper-deep p-3.5 font-mono text-[12.5px] leading-relaxed text-ink">
          {children}
        </code>
      )
    }
    return <code className="rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[0.86em] text-clay-ink">{children}</code>
  },
  pre: ({ children }) => <pre className="mb-4">{children}</pre>,
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-line-strong pb-2 pr-4 text-left font-mono text-[11px] uppercase tracking-wider text-ink-faint">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-line py-2 pr-4 text-ink-soft">{children}</td>,
  img: ({ src, alt }) => {
    // Same threat model as links above: author-supplied markdown must not
    // hand a reader an executable/blocked URL. Mirror the page CSP
    // (img-src 'self' data: https: blob:) — javascript:, data:text/html
    // and other schemes render as a bare alt-text span instead. Restrict data
    // URIs strictly to safe raster images (prevent SVG script injection).
    const safe =
      typeof src === 'string' &&
      src.length > 0 &&
      /^(https?:|#|\/|[^:/?#]*([?#]|$)|data:image\/(png|jpeg|jpg|webp|gif|avif);base64,|blob:)/i.test(src)
        ? src
        : undefined
    if (!safe) return <span className="text-ink-soft">{alt ?? ''}</span>
    return (
      <img
        src={safe}
        alt={alt ?? ''}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="my-4 h-auto max-w-full rounded-md border border-line"
      />
    )
  },
}

export function MarkdownView({ children, className }: { children: string; className?: ClassValue }) {
  return (
    <div className={twMerge(clsx('font-serif text-[15.5px]', className))}>
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  )
}
