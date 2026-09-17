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
  h1: ({ children }) => (
    <h1 className="font-display mt-8 mb-3 text-3xl uppercase leading-tight text-foreground">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-display mt-7 mb-2.5 text-2xl uppercase leading-tight text-foreground">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="font-display mt-6 mb-2 text-xl uppercase leading-snug text-foreground">{children}</h3>
  ),
  h4: ({ children }) => <h4 className="font-display mt-5 mb-2 text-lg uppercase text-foreground">{children}</h4>,
  p: ({ children }) => <p className="mb-4 leading-[1.75] font-bold">{children}</p>,
  a: ({ children, href }) => {
    // Entries are shared with other people — never let author-supplied
    // markdown run script URLs in a reader's browser.
    const safe = typeof href === 'string' && /^(https?:|mailto:|#|\/|[^:/?#]*([?#]|$))/i.test(href) ? href : undefined
    if (!safe) return <span>{children}</span>
    const external = /^https?:/i.test(safe)
    return (
      <a
        href={safe}
        {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
        className="font-bold text-accent underline decoration-2 underline-offset-[3px] hover:bg-accent hover:text-background"
      >
        {children}
      </a>
    )
  },
  strong: ({ children }) => <strong className="font-black text-foreground">{children}</strong>,
  em: ({ children }) => <em className="font-bold italic text-foreground">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-5 border-l-4 border-accent bg-muted p-4 font-bold">{children}</blockquote>
  ),
  ul: ({ children }) => <ul className="mb-4 list-square space-y-1.5 pl-5 leading-[1.7]">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1.5 pl-5 leading-[1.7] font-bold">{children}</ol>,
  hr: () => <hr className="my-7 border-0 border-t-2 border-foreground" />,
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? '')
    if (isBlock) {
      return (
        <code className="block overflow-x-auto border-2 border-foreground bg-foreground p-3.5 font-mono text-[12.5px] leading-relaxed text-background shadow-brutal-accent">
          {children}
        </code>
      )
    }
    return (
      <code className="border border-foreground bg-muted px-1.5 py-0.5 font-mono text-[0.86em] font-bold text-accent">
        {children}
      </code>
    )
  },
  pre: ({ children }) => <pre className="mb-4">{children}</pre>,
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto border-2 border-foreground shadow-brutal">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b-2 border-foreground bg-foreground p-2.5 text-left font-mono text-[11px] font-bold uppercase tracking-wider text-background">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border-b border-foreground p-2.5 font-bold">{children}</td>,
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
    if (!safe) return <span>{alt ?? ''}</span>
    return (
      <img
        src={safe}
        alt={alt ?? ''}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="my-4 h-auto max-w-full border-2 border-foreground shadow-brutal"
      />
    )
  },
}

export function MarkdownView({ children, className }: { children: string; className?: ClassValue }) {
  return (
    <div className={twMerge(clsx('font-mono text-[14.5px]', className))}>
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  )
}
