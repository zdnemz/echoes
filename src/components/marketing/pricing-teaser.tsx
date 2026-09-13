import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Check } from '@phosphor-icons/react/dist/ssr'

/**
 * Home-page pricing teaser — two quiet tier cards, the full comparison
 * lives on /pricing. Server component.
 */

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    blurb: 'Everything you need to keep a real journal.',
    points: ['Up to 3 notebooks', 'One shared notebook, up to 3 people', 'Markdown, moods, tags, search'],
    cta: 'Start free',
    featured: false,
  },
  {
    name: 'Pro',
    price: '$6',
    cadence: 'per month',
    blurb: 'For the daily writer who wants all the room.',
    points: ['Unlimited notebooks', 'Up to 5 shared circles', 'Priority realtime sync · email export'],
    cta: 'Go Pro',
    featured: true,
  },
]

export function PricingTeaser() {
  return (
    <section id="pricing" className="scroll-mt-16 border-t border-line bg-paper-deep">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-clay">03 — Pricing</p>
            <h2 className="font-display mt-4 max-w-[16ch] text-3xl leading-tight tracking-tight text-ink md:text-4xl">
              Free to write. Fair to upgrade.
            </h2>
            <p className="mt-5 max-w-[50ch] text-[14.5px] leading-relaxed text-ink-soft">
              The whole journal is free — forever, no trial countdown. Pro exists for writers who outgrow the free
              notebooks, and it pays for the servers instead of an ad network.
            </p>
            <Link
              href="/pricing"
              className="mt-7 inline-flex items-center gap-2 text-[13.5px] text-ink underline decoration-line-strong underline-offset-[5px] transition-colors hover:decoration-clay"
            >
              Compare every detail <ArrowRight weight="bold" className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:col-span-7">
            {TIERS.map((tier) => (
              <article
                key={tier.name}
                className={`flex flex-col rounded-xl p-6 ${
                  tier.featured
                    ? 'border border-clay/50 bg-paper-raised shadow-lift'
                    : 'border border-line bg-paper-raised'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-faint">{tier.name}</p>
                  {tier.featured ? (
                    <span className="rounded-full bg-clay-tint px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-clay-ink">
                      most popular
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 flex items-baseline gap-1.5">
                  <span className="font-display text-4xl text-ink">{tier.price}</span>
                  <span className="text-[12px] text-ink-faint">{tier.cadence}</span>
                </p>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-soft">{tier.blurb}</p>
                <ul className="mt-5 space-y-2.5 border-t border-line pt-5">
                  {tier.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-[12.5px] leading-snug text-ink-soft">
                      <Check weight="bold" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage" />
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <Button
                    asChild
                    variant={tier.featured ? 'default' : 'outline'}
                    className={`press h-10 w-full ${tier.featured ? 'shadow-ink' : ''}`}
                  >
                    <Link href="/register">{tier.cta}</Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
