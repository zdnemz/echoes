import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/marketing/page-header'
import { Button } from '@/components/ui/button'
import { ArrowRight, EnvelopeSimple, MapPin } from '@phosphor-icons/react/dist/ssr'
import { avatarTone, initials } from '@/lib/format'

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
        <div className="grid gap-12 border-t border-line pt-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 className="font-display text-2xl tracking-tight text-ink">Why a journal, and why this one</h2>
            <div className="measure mt-5 space-y-4 text-[14.5px] leading-relaxed text-ink-soft">
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
              <p>
                We fund it with a subscription because we can&apos;t build an advertising business on other
                people&apos;s diaries. Six dollars a month, from people who write often, is the entire plan. There is no
                series A in the drawer and no roadmap pivot toward &ldquo;AI-powered journaling insights&rdquo; — the
                day you write is yours to interpret.
              </p>
            </div>
          </div>

          <aside className="lg:col-span-5">
            <div className="rounded-xl border border-line bg-paper-raised p-6 shadow-diffuse">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">The studio</p>
              <dl className="mt-4 space-y-4">
                <div>
                  <dt className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">Name</dt>
                  <dd className="mt-1 text-[13.5px] text-ink">Stillwater Studio</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">Based</dt>
                  <dd className="mt-1 flex items-center gap-1.5 text-[13.5px] text-ink">
                    <MapPin weight="light" className="h-3.5 w-3.5 text-ink-faint" /> Singapore
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">Founded</dt>
                  <dd className="mt-1 text-[13.5px] text-ink">2024</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">Contact</dt>
                  <dd className="mt-1 flex items-center gap-1.5 text-[13.5px] text-ink">
                    <EnvelopeSimple weight="light" className="h-3.5 w-3.5 text-ink-faint" /> hello@echoes.app
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">Model</dt>
                  <dd className="mt-1 text-[13.5px] text-ink">Independent · bootstrapped · subscription-funded</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </section>

      {/* values */}
      <section className="border-t border-line bg-paper-deep">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-clay">How we decide</p>
          <h2 className="font-display mt-4 max-w-[20ch] text-3xl leading-tight tracking-tight text-ink">
            Four commitments, in writing.
          </h2>
          <div className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-2">
            {VALUES.map((v) => (
              <div key={v.heading} className="border-t border-line-strong pt-6">
                <h3 className="font-display text-xl text-ink">{v.heading}</h3>
                <p className="measure mt-3 text-[13.5px] leading-relaxed text-ink-soft">{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* team */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-clay">The people</p>
        <h2 className="font-display mt-4 text-3xl leading-tight tracking-tight text-ink">
          Everyone who will answer you
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {TEAM.map((person) => {
            const tone = avatarTone(person.name)
            return (
              <div
                key={person.name}
                className="flex items-start gap-4 rounded-xl border border-line bg-paper-raised p-6"
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-semibold"
                  style={{ background: tone.bg, color: tone.fg }}
                  aria-hidden="true"
                >
                  {initials(person.name)}
                </span>
                <div>
                  <p className="text-[14px] font-medium text-ink">{person.name}</p>
                  <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-clay">{person.role}</p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-ink-faint">{person.note}</p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="rounded-xl border border-line bg-paper-deep px-6 py-10 text-center sm:px-12">
          <h2 className="font-display text-2xl tracking-tight text-ink">Try the notebook we built for you.</h2>
          <p className="mx-auto mt-3 max-w-[48ch] text-[13.5px] leading-relaxed text-ink-soft">
            Nine seconds with Google, or an email and a password — then a blank page that stays yours.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
            <Button asChild className="press h-10 gap-2 shadow-ink">
              <Link href="/register">
                Start free <ArrowRight weight="bold" className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Link
              href="mailto:hello@echoes.app"
              className="text-[13.5px] text-ink-soft underline decoration-line-strong underline-offset-[5px] transition-colors hover:text-ink hover:decoration-clay"
            >
              Write to us instead
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
