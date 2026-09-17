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
      <div className="flex items-center justify-center gap-0" role="group" aria-label="Billing period">
        <button
          type="button"
          onClick={() => setAnnual(false)}
          className={`press border-2 border-foreground px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] ${
            !annual ? 'bg-foreground text-background' : 'bg-background hover:bg-muted'
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setAnnual(true)}
          className={`press -ml-0.5 border-2 border-foreground px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] ${
            annual ? 'bg-accent text-background' : 'bg-background hover:bg-muted'
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
              className={`flex flex-col border-2 border-foreground bg-background p-7 ${
                tier.featured ? 'shadow-brutal-accent' : 'shadow-brutal'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <p className="bg-foreground px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-background">
                  {tier.name}
                </p>
                {tier.featured ? (
                  <span className="bg-accent px-2 py-1 font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-background">
                    most popular
                  </span>
                ) : null}
              </div>

              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="font-mono text-[2.6rem] font-black leading-none">${price}</span>
                <span className="font-mono text-[12px] font-bold uppercase">{cadence}</span>
              </p>
              <p className="mt-3 text-[13px] font-bold leading-relaxed">{tier.blurb}</p>

              <ul className="mt-6 space-y-3 border-t-2 border-foreground pt-6">
                {tier.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-[12.5px] font-bold leading-snug">
                    <Check weight="bold" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                    {p}
                  </li>
                ))}
              </ul>

              <div className="mt-7">
                <Button asChild variant={tier.featured ? 'destructive' : 'outline'} className="h-10 w-full">
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
