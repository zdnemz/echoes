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
    body: "Groups exist for a handful of people you actually know. Don't invite strangers in bulk, don't use the service to harass, and remember the other members are reading along — in real time.",
  },
  {
    heading: 'This page is a placeholder',
    body: 'As with the privacy page: honest, but not a contract reviewed by a lawyer. Swap in real terms before anything with consequences depends on them.',
  },
]

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-[64ch] px-4 py-14 sm:px-6 md:py-20">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-clay">fine print</p>
      <h1 className="font-display mt-4 text-4xl leading-tight tracking-tight text-ink">The terms, briefly</h1>
      <div className="mt-10 divide-y divide-line border-t border-line">
        {SECTIONS.map((s) => (
          <section key={s.heading} className="py-7">
            <h2 className="font-display text-xl text-ink">{s.heading}</h2>
            <p className="measure mt-3 text-[14px] leading-relaxed text-ink-soft">{s.body}</p>
          </section>
        ))}
      </div>
      <p className="mt-8 font-mono text-[10.5px] text-ink-faint">
        placeholder copy — not a contract ·{' '}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-ink-soft">
          privacy
        </Link>
      </p>
    </div>
  )
}
