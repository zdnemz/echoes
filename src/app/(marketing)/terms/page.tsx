import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The deal between you and Echoes — placeholder copy.',
  alternates: { canonical: '/terms' },
}

const SECTIONS = [
  {
    heading: 'Your words, your account',
    body: "You own everything you write here. You're responsible for keeping your credentials to yourself, and for what you choose to share into a group — shared entries are visible to its members for exactly as long as the notebook stays linked.",
  },
  {
    heading: 'No uptime promises',
    body: "Echoes is a small MVP running on best-effort infrastructure. Don't keep the only copy of anything precious here — export what matters. Deleting an entry or a notebook is permanent; treat the delete buttons accordingly.",
  },
  {
    heading: 'Be decent in groups',
    body: "Groups exist for a handful of people you actually know. Don't share links in bulk, don't use the service to harass, and remember the other members are reading along.",
  },
  {
    heading: 'This page is a placeholder',
    body: 'As with the privacy page: honest, but not a contract reviewed by a lawyer. Swap in real terms before anything with consequences depends on them.',
  },
]

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-[64ch] px-4 py-14 sm:px-6 md:py-20">
      <p className="inline-block border-2 border-foreground bg-foreground px-2 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.2em] text-background">
        fine print
      </p>
      <h1 className="font-display mt-4 text-4xl uppercase">The terms, briefly</h1>
      <div className="mt-10 space-y-4">
        {SECTIONS.map((s, i) => (
          <section key={s.heading} className="border-2 border-foreground bg-background p-6 shadow-brutal-sm">
            <h2 className="font-display text-xl uppercase">
              <span className="mr-2 bg-accent px-1.5 py-0.5 text-background">{i + 1}</span>
              {s.heading}
            </h2>
            <p className="measure mt-3 text-[14px] font-bold leading-relaxed">{s.body}</p>
          </section>
        ))}
      </div>
      <p className="mt-8 inline-block border-2 border-foreground bg-muted px-3 py-2 font-mono text-[10.5px] font-bold uppercase">
        placeholder copy — not a contract ·{' '}
        <Link href="/privacy" className="border-b-[3px] border-accent hover:bg-accent hover:text-background">
          privacy
        </Link>
      </p>
    </div>
  )
}
