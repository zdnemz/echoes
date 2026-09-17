import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/marketing/page-header'
import { PricingCards } from '@/components/marketing/pricing-cards'
import { Button } from '@/components/ui/button'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Echoes pricing: the whole journal is free — three notebooks, one shared. Pro is $6/month (or $60/year) for unlimited notebooks and five shared circles. No ads, no trackers, cancel anytime.',
  alternates: { canonical: '/pricing' },
}

const COMPARISON: Array<{ feature: string; free: string; pro: string }> = [
  { feature: 'Notebooks', free: '3', pro: 'Unlimited' },
  { feature: 'Shared notebooks', free: '1, up to 3 people', pro: 'Up to 5 circles, 12 people each' },
  { feature: 'Entries per notebook', free: 'Unlimited', pro: 'Unlimited' },
  { feature: 'Markdown, moods, tags', free: 'Included', pro: 'Included' },
  { feature: 'Full-text search', free: 'Included', pro: 'Included' },
  { feature: 'Realtime shared updates', free: 'Standard', pro: 'Priority sync' },
  { feature: 'Per-entry privacy opt-out', free: 'Included', pro: 'Included' },
  { feature: 'Email export (markdown)', free: '—', pro: 'Included' },
  { feature: 'Sign-in methods', free: 'Google, email, magic link', pro: 'Google, email, magic link' },
]

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Is the free tier a trial?',
    a: "No. It's a complete journal — the same editor, moods, search, sharing and privacy model as Pro, bounded only by how many notebooks and shared circles you have. Many people will never need to pay, and that's fine.",
  },
  {
    q: 'What does "priority sync" actually change?',
    a: 'Shared notebooks refresh whenever you open them — no sync buttons, no stale views. Under heavy load, Pro traffic gets first position in the queue — the difference between fast and slightly faster, nothing more.',
  },
  {
    q: 'When am I charged?',
    a: 'Billing activates when Echoes leaves beta. Until then every account — free or Pro-intent — runs on the free tier at no cost, and early signups keep their plan free for six months after billing starts. Nothing is collected today.',
  },
  {
    q: 'Can I cancel?',
    a: 'Any time, in one click, no retention flows. Your notebooks export as markdown; if you cancel, your account reverts to the free tier rather than locking your words away.',
  },
  {
    q: 'Why a subscription and not ads?',
    a: "Because it's a journal. We can't simultaneously promise that your entries are private and build an advertising business on them. The subscription is the whole business model, which keeps the incentives pointed at you.",
  },
  {
    q: 'Do groups need one person on Pro?',
    a: 'Only the notebook owner needs the plan that allows the circle size they want. Free lets one notebook be shared with up to three people; Pro extends that to five circles of up to twelve. Members join and read on any tier.',
  },
]

export default function PricingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pricing"
        title="Free to write. Six dollars to never think about it again."
        lede="One price, one upgrade, no seats-per-person arithmetic. The free tier is a complete journal — Pro exists for writers who outgrow it, and pays for servers instead of an ad network."
      />

      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <PricingCards />

        <p className="mt-6 inline-block w-full border-2 border-foreground bg-muted px-3 py-2 text-center font-mono text-[10.5px] font-bold uppercase tracking-[0.14em]">
          billing activates at launch · beta accounts run free · early signups keep 6 months free
        </p>
      </section>

      {/* comparison */}
      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <h2 className="font-display text-2xl uppercase">The fine differences</h2>
        <div className="mt-6 overflow-x-auto border-2 border-foreground shadow-brutal">
          <table className="w-full min-w-[560px] border-collapse bg-background text-left">
            <thead>
              <tr className="border-b-2 border-foreground bg-foreground text-background">
                <th scope="col" className="px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                  Feature
                </th>
                <th scope="col" className="px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                  Free
                </th>
                <th
                  scope="col"
                  className="bg-accent px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
                >
                  Pro
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.feature} className="border-b-2 border-foreground last:border-b-0">
                  <th scope="row" className="px-4 py-3 text-[13px] font-bold">
                    {row.feature}
                  </th>
                  <td className="px-4 py-3 text-[12.5px] font-bold">{row.free}</td>
                  <td className="border-l-2 border-foreground bg-muted px-4 py-3 text-[12.5px] font-black">
                    {row.pro}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <h2 className="font-display text-2xl uppercase">Asked, answered</h2>
        <div className="mt-6 space-y-4">
          {FAQ.map((item) => (
            <details key={item.q} className="group border-2 border-foreground bg-background shadow-brutal-sm">
              <summary className="flex cursor-pointer list-none items-center gap-4 p-4 text-[14px] font-black uppercase hover:bg-muted">
                <span className="flex-1">{item.q}</span>
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 shrink-0 place-items-center border-2 border-foreground bg-accent font-mono text-[16px] font-black leading-none text-background transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="measure border-t-2 border-foreground bg-muted p-4 text-[13px] font-bold leading-relaxed">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
        <div className="border-2 border-foreground bg-foreground px-6 py-10 text-center text-background shadow-brutal-accent sm:px-12">
          <h2 className="font-display text-2xl uppercase">Still deciding?</h2>
          <p className="mx-auto mt-3 max-w-[46ch] text-[13.5px] font-bold leading-relaxed text-background/80">
            Start on free — you'll know within a week of writing whether you want the room. No card, no countdown.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
            <Button asChild variant="destructive">
              <Link href="/register">
                Start free <ArrowRight weight="bold" className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Link
              href="/features"
              className="border-2 border-background px-4 py-2.5 text-[13px] font-bold uppercase tracking-wide hover:bg-accent"
            >
              Read the features first
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
