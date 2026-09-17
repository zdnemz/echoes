import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Check } from '@phosphor-icons/react/dist/ssr'

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
    <section id="pricing" className="scroll-mt-16 border-y-[3px] border-foreground bg-foreground text-background">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="inline-block bg-accent px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-background">
              03 — Pricing
            </p>
            <h2 className="font-display mt-4 max-w-[16ch] text-3xl uppercase md:text-4xl">
              Free to write. Fair to upgrade.
            </h2>
            <p className="mt-5 max-w-[50ch] border-l-4 border-accent pl-4 text-[14.5px] font-bold leading-relaxed text-background/80">
              The whole journal is free — forever, no trial countdown. Pro exists for writers who outgrow the free
              notebooks, and it pays for the servers instead of an ad network.
            </p>
            <Link
              href="/pricing"
              className="mt-7 inline-flex items-center gap-2 border-2 border-background px-4 py-2.5 font-mono text-[13px] font-bold uppercase tracking-wide hover:bg-accent"
            >
              Compare every detail <ArrowRight weight="bold" className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:col-span-7">
            {TIERS.map((tier) => (
              <article
                key={tier.name}
                className={`flex flex-col border-2 border-background bg-background p-6 text-foreground ${
                  tier.featured ? 'shadow-brutal-accent' : 'shadow-[4px_4px_0_#fff]'
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
                <p className="mt-4 flex items-baseline gap-1.5">
                  <span className="font-mono text-4xl font-black">{tier.price}</span>
                  <span className="font-mono text-[12px] font-bold uppercase">{tier.cadence}</span>
                </p>
                <p className="mt-2.5 text-[12.5px] font-bold leading-relaxed">{tier.blurb}</p>
                <ul className="mt-5 space-y-2.5 border-t-2 border-foreground pt-5">
                  {tier.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-[12.5px] font-bold leading-snug">
                      <Check weight="bold" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <Button asChild variant={tier.featured ? 'destructive' : 'outline'} className="h-10 w-full">
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
