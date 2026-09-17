import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/marketing/page-header'
import { Button } from '@/components/ui/button'
import { ArrowRight, EnvelopeSimple, MapPin } from '@phosphor-icons/react/dist/ssr'
import { initials } from '@/lib/format'

export const metadata: Metadata = {
  title: 'About',
  description:
    'Echoes is built by Stillwater Studio — a small independent software studio in Singapore. No investors, no engagement metrics, no advertising: quiet tools, paid for by the people who use them.',
  alternates: { canonical: '/about' },
}

const VALUES = [
  {
    heading: 'Privacy is a default, not a setting',
    body: 'Every notebook starts private and stays that way until you deliberately share it — and sharing is one notebook, not your account. The enforcement lives in Postgres row-level security, not in a terms-of-service paragraph. If the interface disappeared tomorrow, the database would still keep your entries to itself.',
  },
  {
    heading: 'No dark patterns, anywhere',
    body: 'No streak guilt, no red-dot notifications engineered to pull you back, no infinite feeds. We count none of the things an advertising business would count. The product is finished when it gets out of your way, which is why the editor has a keyboard shortcut and the marketing site has actual sentences.',
  },
  {
    heading: 'Sustainable, not explosive',
    body: 'Stillwater has no investors and no growth targets. Echoes is priced so that a few thousand quiet subscribers can keep it alive for decades — a tool you can actually plan to write in for the rest of your life, not a rocket that either lands or explodes.',
  },
  {
    heading: 'Small is a feature',
    body: 'Two people build Echoes. Support tickets are answered by the person who wrote the code. Roadmap decisions weigh the writers who email us more heavily than any analytics dashboard — we keep the dashboard almost empty on principle.',
  },
]

const TEAM = [
  { name: 'Mira Halim', role: 'Design & words', note: 'typesets the journal; defends the serif' },
  { name: 'Dev Anand', role: 'Engineering', note: 'writes the policies and the data layer' },
]

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="About"
        title="A small studio, deliberately quiet."
        lede="Echoes is made by Stillwater Studio — an independent software studio of two people, based in Singapore. No investors, no engagement metrics, no advertising: quiet tools, paid for by the people who use them."
      />

      {/* the story */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-12 border-t-[3px] border-foreground pt-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 className="font-display text-2xl uppercase">Why a journal, and why this one</h2>
            <div className="measure mt-5 space-y-4 text-[14.5px] font-bold leading-relaxed">
              <p>
                The studio started in 2024 with a disagreement about notes apps. Every one of them wanted to be a
                workspace: kanban boards, backlinks, team spaces, a second brain with a filing system. What neither of
                us could find was the digital equivalent of a paper notebook — something that holds the day, asks for
                nothing, and keeps its mouth shut.
              </p>
              <p>
                Echoes is our answer. It holds one day per entry, in markdown, with a mood mark and whatever tags you
                invent. It can share exactly one notebook with the few people who matter — a kitchen table, not a
                platform. And it is private at the layer that counts: the database, where a policy, not a promise,
                decides who reads a row.
              </p>
              <p className="border-l-4 border-accent pl-4">
                We fund it with a subscription because we can&apos;t build an advertising business on other
                people&apos;s diaries. Six dollars a month, from people who write often, is the entire plan. There is no
                series A in the drawer and no roadmap pivot toward &ldquo;AI-powered journaling insights&rdquo; — the
                day you write is yours to interpret.
              </p>
            </div>
          </div>

          <aside className="lg:col-span-5">
            <div className="border-2 border-foreground bg-foreground p-6 text-background shadow-brutal-accent">
              <p className="inline-block bg-accent px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-background">
                The studio
              </p>
              <dl className="mt-4 space-y-4">
                <div>
                  <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-background/60">
                    Name
                  </dt>
                  <dd className="mt-1 text-[13.5px] font-black uppercase">Stillwater Studio</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-background/60">
                    Based
                  </dt>
                  <dd className="mt-1 flex items-center gap-1.5 text-[13.5px] font-bold">
                    <MapPin weight="bold" className="h-3.5 w-3.5 text-accent" /> Singapore
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-background/60">
                    Founded
                  </dt>
                  <dd className="mt-1 text-[13.5px] font-bold">2024</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-background/60">
                    Contact
                  </dt>
                  <dd className="mt-1 flex items-center gap-1.5 text-[13.5px] font-bold">
                    <EnvelopeSimple weight="bold" className="h-3.5 w-3.5 text-accent" /> hello@echoes.app
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-background/60">
                    Model
                  </dt>
                  <dd className="mt-1 text-[13.5px] font-bold">Independent · bootstrapped · subscription-funded</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </section>

      {/* values */}
      <section className="border-y-[3px] border-foreground bg-muted">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="inline-block border-2 border-foreground bg-foreground px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-background">
            How we decide
          </p>
          <h2 className="font-display mt-4 max-w-[20ch] text-3xl uppercase">Four commitments, in writing.</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {VALUES.map((v, i) => (
              <div key={v.heading} className="border-2 border-foreground bg-background p-6 shadow-brutal">
                <p className="inline-block bg-accent px-2 py-0.5 font-mono text-[11px] font-black text-background">
                  {String(i + 1).padStart(2, '0')}
                </p>
                <h3 className="font-display mt-3 text-xl uppercase">{v.heading}</h3>
                <p className="measure mt-3 text-[13.5px] font-bold leading-relaxed">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* team */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="inline-block border-2 border-foreground bg-foreground px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-background">
          The people
        </p>
        <h2 className="font-display mt-4 text-3xl uppercase">Everyone who will answer you</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {TEAM.map((person) => (
            <div
              key={person.name}
              className="flex items-start gap-4 border-2 border-foreground bg-background p-6 shadow-brutal"
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-foreground bg-foreground font-mono text-[13px] font-black text-background"
                aria-hidden="true"
              >
                {initials(person.name)}
              </span>
              <div>
                <p className="text-[14px] font-black uppercase">{person.name}</p>
                <p className="mt-0.5 inline-block bg-muted px-1.5 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-accent">
                  {person.role}
                </p>
                <p className="mt-2 text-[12.5px] font-bold leading-relaxed">{person.note}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="border-2 border-foreground bg-foreground px-6 py-10 text-center text-background shadow-brutal-accent sm:px-12">
          <h2 className="font-display text-2xl uppercase">Try the notebook we built for you.</h2>
          <p className="mx-auto mt-3 max-w-[48ch] text-[13.5px] font-bold leading-relaxed text-background/80">
            Nine seconds with Google, or an email and a password — then a blank page that stays yours.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
            <Button asChild variant="destructive">
              <Link href="/register">
                Start free <ArrowRight weight="bold" className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Link
              href="mailto:hello@echoes.app"
              className="border-2 border-background px-4 py-2.5 text-[13px] font-bold uppercase tracking-wide hover:bg-accent"
            >
              Write to us instead
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
