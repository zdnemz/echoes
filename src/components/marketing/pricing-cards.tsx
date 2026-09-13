'use client'

/**
 * Pricing tier cards — the only client island on /pricing: a monthly /
 * annual toggle that swaps the price and cadence copy. Everything else on
 * the page is server-rendered.
 */

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Check } from '@phosphor-icons/react/dist/ssr'

const TIERS = [
  {
    name: 'Free',
    monthly: 0,
    annual: 0,
    blurb: 'The whole journal — for as long as you want it.',
    points: [
      'Up to 3 notebooks',
      'One notebook shared, up to 3 people',
      'Markdown, moods, tags, full-text search',
      'Google sign-in + magic links',
      'Realtime shared updates',
    ],
    cta: 'Start free',
    featured: false,
  },
  {
    name: 'Pro',
    monthly: 6,
    annual: 60,
    blurb: 'For daily writers who want all the room.',
    points: [
      'Unlimited notebooks',
      'Up to 5 shared circles',
      'Priority realtime sync',
      'Email export of any notebook (markdown)',
      'Per-entry privacy in every shared notebook',
      'Supports an independent studio — no ads, ever',
    ],
    cta: 'Go Pro',
    featured: true,
  },
]

export function PricingCards() {
  const [annual, setAnnual] = useState(false)

  return (
    <div>
      {/* billing cadence toggle */}
      <div className="flex items-center justify-center gap-3" role="group" aria-label="Billing period">
        <button
          type="button"
          onClick={() => setAnnual(false)}
          className={`press rounded-full px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] ${
            !annual ? 'bg-ink text-paper' : 'border border-line text-ink-soft hover:text-ink'
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setAnnual(true)}
          className={`press rounded-full px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] ${
            annual ? 'bg-ink text-paper' : 'border border-line text-ink-soft hover:text-ink'
          }`}
        >
          Annual · 2 months free
        </button>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {TIERS.map((tier) => {
          const price = annual ? tier.annual : tier.monthly
          const cadence = tier.monthly === 0 ? 'forever' : annual ? 'per year' : 'per month'
          return (
            <article
              key={tier.name}
              className={`flex flex-col rounded-xl p-7 ${
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

              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="font-display text-[2.6rem] leading-none text-ink">${price}</span>
                <span className="text-[12px] text-ink-faint">{cadence}</span>
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">{tier.blurb}</p>

              <ul className="mt-6 space-y-3 border-t border-line pt-6">
                {tier.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-[12.5px] leading-snug text-ink-soft">
                    <Check weight="bold" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage" />
                    {p}
                  </li>
                ))}
              </ul>

              <div className="mt-7">
                <Button
                  asChild
                  variant={tier.featured ? 'default' : 'outline'}
                  className={`press h-10 w-full ${tier.featured ? 'shadow-ink' : ''}`}
                >
                  <Link href="/register">{tier.cta}</Link>
                </Button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
