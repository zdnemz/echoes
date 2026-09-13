import Link from 'next/link'
import { Wordmark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'

/**
 * The marketing site nav — one place for the public pages plus the two
 * account actions. Dev-only surfaces (API console) are intentionally absent.
 */

const LINKS = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'About', href: '/about' },
]

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Echoes — home" className="press text-lg">
          <Wordmark />
        </Link>

        <nav aria-label="Marketing pages" className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-[13.5px] text-ink-soft transition-colors hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/login"
            className="text-[13.5px] text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
          >
            Sign in
          </Link>
          <Button asChild size="sm" className="press shadow-ink h-9 gap-1.5">
            <Link href="/register">
              Start free <ArrowRight weight="bold" className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* compact link row for small screens */}
      <nav
        aria-label="Marketing pages"
        className="flex items-center gap-5 overflow-x-auto border-t border-line px-4 py-2 *:shrink-0 md:hidden"
      >
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
            {l.label}
          </Link>
        ))}
        <Link href="/journal" className="ml-auto font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
          Open journal
        </Link>
      </nav>
    </header>
  )
}
