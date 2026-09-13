import Link from 'next/link'
import { Wordmark } from '@/components/brand'
import { LiveStatusDot } from '@/components/landing/live-status'

/**
 * The marketing footer — sitemap, business identity (Stillwater Studio),
 * legal, and the live status island.
 */

function FooterCol({
  heading,
  links,
}: {
  heading: string
  links: Array<{ label: string; href: string; external?: boolean }>
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">{heading}</p>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link
              href={l.href}
              {...(l.external ? { target: '_blank', rel: 'noreferrer' } : {})}
              className="text-[13px] text-ink-soft transition-colors hover:text-ink"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Wordmark className="text-lg" />
            <p className="mt-3.5 max-w-[38ch] text-[12.5px] leading-relaxed text-ink-faint">
              A quiet place for loud thoughts. Private notebooks of markdown entries — moods, tags, search — and one
              notebook shared with the people who matter. Built by Stillwater Studio.
            </p>
            <p className="mt-4 font-mono text-[10.5px] text-ink-faint">hello@echoes.app · Singapore</p>
          </div>
          <FooterCol
            heading="Product"
            links={[
              { label: 'Features', href: '/features' },
              { label: 'Pricing', href: '/pricing' },
              { label: 'Your journal', href: '/journal' },
            ]}
          />
          <FooterCol
            heading="Company & fine print"
            links={[
              { label: 'About the studio', href: '/about' },
              { label: 'Privacy', href: '/privacy' },
              { label: 'Terms', href: '/terms' },
            ]}
          />
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-6">
          <LiveStatusDot />
          <p className="font-mono text-[10.5px] text-ink-faint">
            © {new Date().getFullYear()} Stillwater Studio · Echoes
          </p>
          <p className="ml-auto font-mono text-[10.5px] text-ink-faint">
            every entry private, unless you say otherwise
          </p>
        </div>
      </div>
    </footer>
  )
}
