import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Check } from '@phosphor-icons/react/dist/ssr'

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    points: ['3 notebooks', '1 shared circle', 'Full-text search'],
    cta: 'Start free',
    featured: false,
  },
  {
    name: 'Pro',
    price: '$6',
    cadence: 'per month',
    points: ['Unlimited notebooks', '5 shared circles', 'Priority sync'],
    cta: 'Go Pro',
    featured: true,
  },
]

export function PricingTeaser() {
  return (
    <section id="pricing" className="scroll-mt-16 border-b-[3px] border-foreground py-14 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            <p className="inline-block border-2 border-foreground bg-foreground px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.2em] text-background">
              Pricing
            </p>
            <h2 className="font-display mt-3 text-3xl uppercase md:text-4xl">
              Free to write.
              <br />
              Fair to upgrade.
            </h2>
            <p className="mt-4 max-w-[40ch] border-l-4 border-accent pl-4 text-sm font-bold leading-relaxed">
              No trial countdown. Upgrade only when you want unlimited notebooks.
            </p>
            <Link
              href="/pricing"
              className="mt-6 inline-flex items-center gap-2 border-2 border-foreground px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-wide hover:bg-muted"
            >
              Compare all features <ArrowRight weight="bold" className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:col-span-7">
            {TIERS.map((tier) => (
              <article
                key={tier.name}
                className={`flex flex-col border-2 border-foreground bg-background p-6 ${
                  tier.featured ? 'shadow-brutal-accent' : 'shadow-brutal'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <p className="bg-foreground px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-background">
                    {tier.name}
                  </p>
                  {tier.featured ? (
                    <span className="bg-accent px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-background">
                      most popular
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 flex items-baseline gap-1.5">
                  <span className="font-mono text-4xl font-black">{tier.price}</span>
                  <span className="font-mono text-[12px] font-bold uppercase">{tier.cadence}</span>
                </p>
                <ul className="mt-4 space-y-2 border-t-2 border-foreground pt-4">
                  {tier.points.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-xs font-bold">
                      <Check weight="bold" className="h-3.5 w-3.5 text-accent" />
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
