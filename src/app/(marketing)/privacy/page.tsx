import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'How Echoes and Stillwater Studio treat your entries — plainly.',
  alternates: { canonical: '/privacy' },
}

const SECTIONS = [
  {
    heading: 'What you write stays yours',
    body: "Entries live in a Postgres database where row-level security — not interface logic — decides who can read a row. A query for entries you shouldn't see is declined by the database itself, regardless of who asks it or through what clever route.",
  },
  {
    heading: 'Nothing is public by default',
    body: "Every notebook is private from the moment it's created. Sharing is an explicit, reversible act: linking one notebook to one small group. Unlink it and visibility is revoked immediately for everyone in that group.",
  },
  {
    heading: 'Accounts are an email — or a Google sign-in',
    body: 'If you use Google sign-in, we receive your email address and the name on your Google profile — nothing else. Google shares no contacts, no browsing history, and nothing you have written. We store your email address, a display name, and the authentication record Supabase keeps. No trackers, no analytics beacons, no advertising identifiers — this is a journal, not an audience.',
  },
  {
    heading: 'Invites are narrow',
    body: "Invite links are revocable, can expire on their own, and open exactly one group. A member removed from a group loses access to its shared notebooks the moment they're removed.",
  },
  {
    heading: 'No advertising, no data sales',
    body: 'Echoes is paid for by subscriptions, not by your attention. We do not sell, rent, or share your entries or your identity with third parties, full stop. There is nothing in the product that would even make that possible — the database policies above are the enforcement, not a promise.',
  },
  {
    heading: 'This page is a placeholder',
    body: 'Echoes is an MVP build; this text is honest but not legal counsel. Before relying on it for anything real, Stillwater Studio will have it reviewed by someone qualified.',
  },
]

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[64ch] px-4 py-14 sm:px-6 md:py-20">
      <p className="inline-block border-2 border-foreground bg-foreground px-2 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.2em] text-background">
        fine print
      </p>
      <h1 className="font-display mt-4 text-4xl uppercase">Privacy, plainly</h1>
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
        placeholder copy — not legal counsel ·{' '}
        <Link href="/terms" className="border-b-[3px] border-accent hover:bg-accent hover:text-background">
          terms
        </Link>
      </p>
    </div>
  )
}
