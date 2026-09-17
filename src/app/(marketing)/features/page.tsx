import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/marketing/page-header'
import { Button } from '@/components/ui/button'
import { MarkdownView } from '@/components/markdown/markdown-view'
import { MOOD_META, MOODS, MoodGlyph } from '@/components/mood/glyphs'
import { initials } from '@/lib/format'
import {
  ArrowRight,
  Check,
  Clock,
  Eye,
  EyeSlash,
  MagnifyingGlass,
  LinkSimple,
  LockSimple,
  UserPlus,
} from '@phosphor-icons/react/dist/ssr'

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Everything in Echoes: a markdown editor that typesets as you write, five moods, free tags, full-text search, one shared notebook, per-entry privacy, and Postgres row-level security underneath it all.',
  alternates: { canonical: '/features' },
}

// ------------------------------------------------------------- shared bits

function PersonDot({ name }: { name: string }) {
  return (
    <span
      className="flex h-7 w-7 items-center justify-center border-2 border-foreground bg-foreground font-mono text-[10px] font-bold text-background"
      aria-label={name}
    >
      {initials(name)}
    </span>
  )
}

function Row({
  eyebrow,
  title,
  body,
  bullets,
  children,
  flip = false,
}: {
  eyebrow: string
  title: string
  body: string
  bullets: Array<{ label: string; desc: string }>
  children: React.ReactNode
  flip?: boolean
}) {
  return (
    <div className="grid items-center gap-12 border-t-[3px] border-foreground py-16 first:border-t-0 lg:grid-cols-2 lg:gap-20 lg:py-20">
      <div className={flip ? 'order-last lg:order-first' : ''}>
        <p className="inline-block border-2 border-foreground bg-foreground px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-background">
          {eyebrow}
        </p>
        <h2 className="font-display mt-4 max-w-[22ch] text-3xl uppercase">{title}</h2>
        <p className="mt-5 max-w-[52ch] border-l-4 border-accent pl-4 text-[14.5px] font-bold leading-relaxed">
          {body}
        </p>
        <ul className="mt-7 border-2 border-foreground shadow-brutal-sm">
          {bullets.map((b, i) => (
            <li key={b.label} className={`flex gap-4 p-4 ${i > 0 ? 'border-t-2 border-foreground' : ''}`}>
              <span className="h-fit shrink-0 bg-foreground px-2 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-background">
                {b.label}
              </span>
              <span className="text-[12.5px] font-bold leading-relaxed">{b.desc}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={flip ? 'order-first lg:order-last' : ''}>{children}</div>
    </div>
  )
}

// ------------------------------------------------------------- artifacts

function EditorDemo() {
  return (
    <figure>
      <div className="overflow-hidden border-2 border-foreground bg-background shadow-brutal">
        <div className="flex items-center justify-between border-b-2 border-foreground px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            Kitchen Table · entry
          </span>
          <span className="font-mono text-[10px] text-ink-faint">⌘S to save</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="p-4 font-mono text-[12px] font-bold leading-6 sm:border-r-2">
            <p>## Sunday, the long walk</p>
            <p>&nbsp;</p>
            <p>We took the river path past the mill</p>
            <p>and turned back only when the</p>
            <p>
              light went **amber**.
              <span className="ml-0.5 inline-block h-3.5 w-[7px] animate-pulse bg-accent align-middle" />
            </p>
            <p>&nbsp;</p>
            <p>- herons, two</p>
            <p>- the rowing crew, loud</p>
            <p>- silence, finally</p>
          </div>
          <div className="border-t-2 border-foreground bg-muted p-4 sm:border-t-0">
            <MarkdownView className="text-[13px]">
              {`## Sunday, the long walk

We took the river path past the mill and turned back only when the light went **amber**.

- herons, two
- the rowing crew, loud
- silence, finally`}
            </MarkdownView>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 border-l-4 border-accent pl-3 font-mono text-[10px] font-bold uppercase">
        Raw markdown on the left, typeset on the right — the split keeps both honest.
      </figcaption>
    </figure>
  )
}

function MoodDemo() {
  return (
    <figure>
      <div className="overflow-hidden border-2 border-foreground bg-background shadow-brutal p-5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">A month of evenings</span>
          <span className="font-mono text-[10px] text-ink-faint">scroll back</span>
        </div>
        <div className="mt-5 grid grid-cols-10 gap-2.5" aria-hidden="true">
          {[
            'great',
            'good',
            'good',
            'okay',
            'low',
            'rough',
            'low',
            'okay',
            'good',
            'great',
            'good',
            'okay',
            'okay',
            'low',
            'low',
            'okay',
            'good',
            'good',
            'great',
            'good',
            'okay',
            'low',
            'rough',
            'rough',
            'low',
            'okay',
            'good',
            'good',
            'good',
            'great',
          ].map((m, i) => (
            <span key={i} style={{ color: MOOD_META[m as keyof typeof MOOD_META].color }}>
              <MoodGlyph mood={m as (typeof MOODS)[number]} className="h-5 w-5" />
            </span>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t-2 border-foreground pt-4">
          {MOODS.map((m) => (
            <span key={m} className="inline-flex items-center gap-1.5">
              <span style={{ color: MOOD_META[m].color }}>
                <MoodGlyph mood={m} className="h-4 w-4" />
              </span>
              <span className="font-mono text-[10px] text-ink-soft">{MOOD_META[m].label}</span>
            </span>
          ))}
        </div>
      </div>
      <figcaption className="mt-3 border-l-4 border-accent pl-3 font-mono text-[10px] font-bold uppercase">
        Five hand-drawn marks — a month at a glance, no charts required.
      </figcaption>
    </figure>
  )
}

function SearchDemo() {
  return (
    <figure>
      <div className="overflow-hidden border-2 border-foreground bg-background shadow-brutal">
        <div className="flex items-center gap-3 border-b-2 border-foreground px-4 py-3">
          <MagnifyingGlass weight="bold" className="h-4 w-4 text-ink-faint" />
          <span className="font-mono text-[12.5px] text-ink">sourdough</span>
          <span className="ml-auto font-mono text-[10px] text-ink-faint">4 entries · full text</span>
        </div>
        <ul className="divide-y-2 divide-foreground">
          {[
            { date: 'Sep 08', title: 'Bread notes, week 36', hint: '…the starter finally smells like apples —' },
            { date: 'Aug 31', title: 'Bread notes, week 35', hint: '…second attempt at the sourdough batards…' },
            { date: 'Aug 12', title: 'The market at six a.m.', hint: 'Bought the last sourdough before the crowd…' },
          ].map((r) => (
            <li key={r.title} className="px-4 py-3">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[10px] text-ink-faint">{r.date}</span>
                <span className="text-[13px] text-ink">{r.title}</span>
              </div>
              <p className="mt-1 border-l-4 border-accent pl-3 text-[12px] font-bold">{r.hint}</p>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="mt-3 border-l-4 border-accent pl-3 font-mono text-[10px] font-bold uppercase">
        Search reaches into every entry body — your words, findable years later.
      </figcaption>
    </figure>
  )
}

function SharingDemo() {
  return (
    <figure>
      <div className="overflow-hidden border-2 border-foreground bg-background shadow-brutal">
        <div className="flex items-center gap-3 border-b-2 border-foreground px-4 py-3">
          <span className="font-display text-[15px] text-ink">Kitchen Table</span>
          <span className="inline-flex items-center gap-1.5 border-2 border-foreground bg-accent px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-background">
            <LinkSimple weight="bold" className="h-3 w-3" /> shared · Family
          </span>
          <span className="ml-auto flex">
            <PersonDot name="Maya Lindqvist" />
            <PersonDot name="Jonas Adeyemi" />
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="p-4 sm:border-r-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-ink-faint">Maya's screen · 06:41</span>
              <Eye weight="light" className="h-3.5 w-3.5 text-clay" />
            </div>
            <p className="mt-3 text-[13px] text-ink">The market at six a.m.</p>
            <p className="mt-1.5 font-serif text-[12px] leading-relaxed text-ink-soft">
              Bought the last sourdough before the crowd thickened…
            </p>
          </div>
          <div className="border-t-2 border-foreground bg-muted p-4 sm:border-t-0">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-ink-faint">Jonas's screen · 06:41</span>
              <span className="h-2 w-2 bg-accent" aria-hidden="true" />
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-2.5 w-3/5 bg-accent" />
              <div className="h-2 w-full bg-foreground/15" />
              <div className="h-2 w-4/5 bg-foreground/15" />
            </div>
            <p className="mt-3 border-l-4 border-accent pl-3 font-mono text-[10px] font-bold uppercase">
              landing, streaming — no refresh
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t-2 border-foreground px-4 py-2.5">
          <Clock weight="light" className="h-3.5 w-3.5 text-ink-faint" />
          <span className="font-mono text-[10px] text-ink-soft">edits and deletions stream too</span>
          <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] text-ink-faint">
            <EyeSlash weight="light" className="h-3.5 w-3.5" /> the 3 a.m. page stays yours
          </span>
        </div>
      </div>
      <figcaption className="mt-3 border-l-4 border-accent pl-3 font-mono text-[10px] font-bold uppercase">
        One notebook, two screens, zero refreshes — and a per-entry opt-out, visibly honored.
      </figcaption>
    </figure>
  )
}

function GroupsDemo() {
  return (
    <figure>
      <div className="overflow-hidden border-2 border-foreground bg-background shadow-brutal">
        <div className="flex items-center justify-between border-b-2 border-foreground px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">Group · Family</span>
          <span className="font-mono text-[10px] text-ink-faint">2 members</span>
        </div>
        <ul className="divide-y-2 divide-foreground">
          <li className="flex items-center gap-3 px-4 py-3">
            <PersonDot name="Maya Lindqvist" />
            <div>
              <p className="text-[13px] text-ink">Maya Lindqvist</p>
              <p className="font-mono text-[10px] text-ink-faint">maya@… · owner</p>
            </div>
          </li>
          <li className="flex items-center gap-3 px-4 py-3">
            <PersonDot name="Jonas Adeyemi" />
            <div>
              <p className="text-[13px] text-ink">Jonas Adeyemi</p>
              <p className="font-mono text-[10px] text-ink-faint">jonas@… · member</p>
            </div>
          </li>
          <li className="flex items-center gap-3 px-4 py-3">
            <span className="flex h-7 w-7 items-center justify-center border-2 border-dashed border-foreground">
              <UserPlus weight="bold" className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13px] text-ink-soft">Share a link</p>
              <p className="font-mono text-[10px] text-ink-faint">revocable any time</p>
            </div>
          </li>
        </ul>
      </div>
      <figcaption className="mt-3 border-l-4 border-accent pl-3 font-mono text-[10px] font-bold uppercase">
        Groups stay small on purpose; invite links are revocable and expirable.
      </figcaption>
    </figure>
  )
}

// ------------------------------------------------------------- page

export default function FeaturesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Features"
        title="A journal that earns its place in your morning."
        lede="Six decisions, made carefully: how you write, how the day is rated, how you find things again, how sharing works, how immediate it feels, and how privacy is actually enforced. Each one is below, with the interface itself as the evidence."
      />

      <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <Row
          eyebrow="Writing"
          title="An editor that stays out of the way, then gets out a good book."
          body="The writing half is mono-spaced and honest; the reading half is a serif set at a reading measure. Your hands stay in the raw text, your eyes get the typeset page, and the two never fight for the same space."
          bullets={[
            {
              label: 'Split-pane editor',
              desc: 'Markdown left, typeset preview right. On phones they become a two-mode toggle.',
            },
            {
              label: 'Command-S saves',
              desc: 'The dirty indicator breathes until you do. No autosave surprises, no lost drafts.',
            },
            {
              label: 'Borderless titles',
              desc: 'The title is the first line of the entry, not a form field asking to be filled.',
            },
          ]}
        >
          <EditorDemo />
        </Row>

        <Row
          eyebrow="Moods"
          title="Five marks for the whole weather of a day."
          body="Not a ten-point scale with decimal anxiety. Five hand-inked glyphs — from a wide sun to a weather front — each with a quiet color. Over a month they assemble into something you can read at a glance."
          bullets={[
            {
              label: 'One tap per entry',
              desc: 'Optional, obviously. The glyph sits where a star rating would, minus the arithmetic.',
            },
            {
              label: 'Filter by mood',
              desc: 'Every notebook has mood chips — see only the good weeks, or only the rough ones.',
            },
            {
              label: 'A month at a glance',
              desc: 'Scrolling your entries becomes a small weather record of your life.',
            },
          ]}
          flip
        >
          <MoodDemo />
        </Row>

        <Row
          eyebrow="Tags & search"
          title="Your own taxonomy, and a search that actually finds it."
          body="Tags are free text — #sourdough, #3am, #letter-to-dad — twenty per entry, no suggestions, no preset categories. Search runs across every entry body you own, full-text, with snippets so you can tell which hit matters."
          bullets={[
            { label: 'Free-text tags', desc: 'Up to 20 per entry. The only structure is the structure you invent.' },
            {
              label: 'Full-text search',
              desc: 'Title and body across all of your notebooks, paginated, private to you.',
            },
            {
              label: 'Snippet results',
              desc: 'Search results quote the matching line, so you recognize the entry before opening it.',
            },
          ]}
        >
          <SearchDemo />
        </Row>

        <Row
          eyebrow="The shared notebook"
          title="Share exactly one notebook. Keep the rest of your head."
          body="You link a single notebook to a small group — the kitchen-table notebook, not the 3 a.m. one. Entries stream to the group as you save them. Every other notebook stays sealed, and even inside the shared one, each entry can opt out."
          bullets={[
            {
              label: 'Live streaming',
              desc: 'Inserts, edits, deletions — the group sees them the moment they are saved.',
            },
            {
              label: 'Per-entry opt-out',
              desc: 'A quiet toggle keeps any single entry private inside an otherwise shared notebook.',
            },
            {
              label: 'Instant revoke',
              desc: 'Unlink the notebook and it turns private again — for everyone, in one move.',
            },
          ]}
          flip
        >
          <SharingDemo />
        </Row>

        <Row
          eyebrow="Groups & invites"
          title="Small circles, one link, doors that lock themselves."
          body="A group is a handful of people you actually know. The owner shares one link that can expire on its own and die on command; new members either walk straight in or wait for approval — the owner's call. Members can leave; owners can remove; nothing is discoverable or public."
          bullets={[
            {
              label: 'Owner & member roles',
              desc: 'The owner links notebooks and manages members. Members read and write into shared notebooks.',
            },
            {
              label: 'One link per group',
              desc: 'Expiring on your terms, revocable any time — rotating it kills the old one instantly.',
            },
            {
              label: 'Ask first, or walk in',
              desc: 'Owners choose per group: instant join, or a request queue they approve one by one.',
            },
          ]}
        >
          <GroupsDemo />
        </Row>

        <Row
          eyebrow="Underneath"
          title="Private where it counts: in the database, not the interface."
          body="Every query in Echoes runs against Postgres row-level security policies bound to your session. If a row should not reach you, the database itself declines it — no route, script, or clever request can ask around the rule. Rate-limited auth, expiring tokens, and an invite model built to be narrow."
          bullets={[
            {
              label: 'RLS on every table',
              desc: 'Visibility is enforced by Postgres policies checked on every single read and write.',
            },
            {
              label: 'Identity from the session',
              desc: 'Your user id is derived from the verified token — never from the request body.',
            },
            {
              label: 'Brute-force resistant',
              desc: 'Login, signup and OAuth endpoints are rate-limited per IP behind one surface.',
            },
          ]}
          flip
        >
          <figure>
            <div className="overflow-hidden border-2 border-foreground bg-background shadow-brutal">
              <div className="flex items-center justify-between border-b-2 border-foreground px-4 py-2.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                  enforcement, not promises
                </span>
                <LockSimple weight="light" className="h-3.5 w-3.5 text-ink-faint" />
              </div>
              <ul className="divide-y-2 divide-foreground">
                {[
                  'Row-level security on profiles, notebooks, entries, groups, join requests',
                  'Google OAuth via PKCE — the anon key never leaves the server',
                  'Sliding-window rate limits on every auth endpoint',
                  'Revocable invite links, expiring on your terms',
                  'No trackers, no analytics beacons, no ad identifiers',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 px-4 py-3">
                    <Check weight="bold" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage" />
                    <span className="text-[12.5px] leading-snug text-ink-soft">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <figcaption className="mt-3 border-l-4 border-accent pl-3 font-mono text-[10px] font-bold uppercase">
              The security posture, itemized. The RLS policies are in the repo, in SQL.
            </figcaption>
          </figure>
        </Row>

        {/* CTA */}
        <section className="mt-8 border-t-[3px] border-foreground py-16 md:py-20">
          <div className="border-2 border-foreground bg-foreground px-6 py-12 text-center text-background shadow-brutal-accent sm:px-12">
            <h2 className="font-display text-3xl uppercase">Start your first notebook.</h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-[14px] font-bold leading-relaxed text-background/80">
              Free forever for the journal itself — three notebooks, one shared, every feature above. Google sign-in
              takes about nine seconds.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button asChild size="lg" variant="destructive">
                <Link href="/register">
                  Start free <ArrowRight weight="bold" className="h-4 w-4" />
                </Link>
              </Button>
              <Link
                href="/pricing"
                className="border-2 border-background px-4 py-2.5 text-[13px] font-bold uppercase tracking-wide hover:bg-accent"
              >
                Or see pricing
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
