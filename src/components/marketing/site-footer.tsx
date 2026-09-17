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
      <p className="inline-block bg-accent px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-background">
        {heading}
      </p>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link
              href={l.href}
              {...(l.external ? { target: '_blank', rel: 'noreferrer' } : {})}
              className="text-[13px] font-bold uppercase tracking-wide text-background/80 underline-offset-4 hover:text-background hover:underline hover:decoration-accent hover:decoration-2"
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
    <footer className="mt-auto border-t-[3px] border-foreground bg-foreground text-background">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Wordmark className="text-lg" onDark />
            <p className="mt-3.5 max-w-[38ch] border-2 border-background/30 p-3 text-[12.5px] font-bold leading-relaxed text-background/80">
              A quiet place for loud thoughts. Private notebooks of markdown entries — moods, tags, search — and one
              notebook shared with the people who matter. Built by Stillwater Studio.
            </p>
            <p className="mt-4 font-mono text-[10.5px] font-bold uppercase tracking-widest text-background/60">
              hello@echoes.app · Singapore
            </p>
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

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t-2 border-background/30 pt-6">
          <LiveStatusDot />
          <p className="font-mono text-[10.5px] font-bold uppercase tracking-widest text-background/60">
            © {new Date().getFullYear()} Stillwater Studio · Echoes
          </p>
          <p className="ml-auto border-2 border-background bg-accent px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-widest text-background">
            every entry private, unless you say otherwise
          </p>
        </div>
      </div>
    </footer>
  )
}
