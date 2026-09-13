import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/marketing/page-header'
import { Button } from '@/components/ui/button'
import { MarkdownView } from '@/components/markdown/markdown-view'
import { MOOD_META, MOODS, MoodGlyph } from '@/components/mood/glyphs'
import { avatarTone, initials } from '@/lib/format'
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

function PersonDot({ name, ring = false }: { name: string; ring?: boolean }) {
  const tone = avatarTone(name)
  return (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-[10px] font-semibold ${
        ring ? 'ring-2 ring-paper-raised' : ''
      }`}
      style={{ background: tone.bg, color: tone.fg }}
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
    <div className="grid items-center gap-12 border-t border-line py-16 first:border-t-0 lg:grid-cols-2 lg:gap-20 lg:py-20">
      <div className={flip ? 'order-last lg:order-first' : ''}>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-clay">{eyebrow}</p>
        <h2 className="font-display mt-4 max-w-[22ch] text-3xl leading-tight tracking-tight text-ink">{title}</h2>
        <p className="mt-5 max-w-[52ch] text-[14.5px] leading-relaxed text-ink-soft">{body}</p>
        <ul className="mt-7 divide-y divide-line border-y border-line">
          {bullets.map((b) => (
            <li key={b.label} className="py-3.5">
              <p className="text-[13.5px] font-medium text-ink">{b.label}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-faint">{b.desc}</p>
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
      <div className="overflow-hidden rounded-lg border border-line bg-paper-raised shadow-diffuse">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            Kitchen Table · entry
          </span>
          <span className="font-mono text-[10px] text-ink-faint">⌘S to save</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="border-line p-4 font-mono text-[12px] leading-6 text-ink-soft sm:border-r">
            <p>## Sunday, the long walk</p>
            <p>&nbsp;</p>
            <p>We took the river path past the mill</p>
            <p>and turned back only when the</p>
            <p>
              light went **amber**.
              <span className="ml-0.5 inline-block h-3.5 w-[7px] animate-pulse bg-clay/70 align-middle" />
            </p>
            <p>&nbsp;</p>
            <p>- herons, two</p>
            <p>- the rowing crew, loud</p>
            <p>- silence, finally</p>
          </div>
          <div className="bg-paper/60 p-4">
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
      <figcaption className="mt-3 font-mono text-[10px] text-ink-faint">
        Raw markdown on the left, typeset on the right — the split keeps both honest.
      </figcaption>
    </figure>
  )
}

function MoodDemo() {
  return (
    <figure>
      <div className="overflow-hidden rounded-lg border border-line bg-paper-raised shadow-diffuse p-5">
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
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4">
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
      <figcaption className="mt-3 font-mono text-[10px] text-ink-faint">
        Five hand-drawn marks — a month at a glance, no charts required.
      </figcaption>
    </figure>
  )
}

function SearchDemo() {
  return (
    <figure>
      <div className="overflow-hidden rounded-lg border border-line bg-paper-raised shadow-diffuse">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <MagnifyingGlass weight="bold" className="h-4 w-4 text-ink-faint" />
          <span className="font-mono text-[12.5px] text-ink">sourdough</span>
          <span className="ml-auto font-mono text-[10px] text-ink-faint">4 entries · full text</span>
        </div>
        <ul className="divide-y divide-line">
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
              <p className="mt-1 pl-[52px] font-serif text-[12px] italic text-ink-faint">{r.hint}</p>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="mt-3 font-mono text-[10px] text-ink-faint">
        Search reaches into every entry body — your words, findable years later.
      </figcaption>
    </figure>
  )
}

function SharingDemo() {
  return (
    <figure>
      <div className="overflow-hidden rounded-lg border border-line bg-paper-raised shadow-diffuse">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="font-display text-[15px] text-ink">Kitchen Table</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-clay-tint px-2.5 py-0.5 font-mono text-[10px] text-clay-ink">
            <LinkSimple weight="bold" className="h-3 w-3" /> shared · Family
          </span>
          <span className="ml-auto flex -space-x-1.5">
            <PersonDot name="Maya Lindqvist" ring />
            <PersonDot name="Jonas Adeyemi" ring />
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="border-line p-4 sm:border-r">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-ink-faint">Maya's screen · 06:41</span>
              <Eye weight="light" className="h-3.5 w-3.5 text-clay" />
            </div>
            <p className="mt-3 text-[13px] text-ink">The market at six a.m.</p>
            <p className="mt-1.5 font-serif text-[12px] leading-relaxed text-ink-soft">
              Bought the last sourdough before the crowd thickened…
            </p>
          </div>
          <div className="bg-paper/60 p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-ink-faint">Jonas's screen · 06:41</span>
              <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                <span className="absolute h-1.5 w-1.5 rounded-full bg-sage opacity-60 animate-breathe" />
                <span className="h-1.5 w-1.5 rounded-full bg-sage" />
              </span>
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-2.5 w-3/5 rounded-sm bg-clay/25 animate-shimmer" />
              <div className="h-2 w-full rounded-sm bg-paper-sink" />
              <div className="h-2 w-4/5 rounded-sm bg-paper-sink" />
            </div>
            <p className="mt-3 font-mono text-[10px] text-ink-faint">landing, streaming — no refresh</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-line px-4 py-2.5">
          <Clock weight="light" className="h-3.5 w-3.5 text-ink-faint" />
          <span className="font-mono text-[10px] text-ink-soft">edits and deletions stream too</span>
          <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] text-ink-faint">
            <EyeSlash weight="light" className="h-3.5 w-3.5" /> the 3 a.m. page stays yours
          </span>
        </div>
      </div>
      <figcaption className="mt-3 font-mono text-[10px] text-ink-faint">
        One notebook, two screens, zero refreshes — and a per-entry opt-out, visibly honored.
      </figcaption>
    </figure>
  )
}

function GroupsDemo() {
  return (
    <figure>
      <div className="overflow-hidden rounded-lg border border-line bg-paper-raised shadow-diffuse">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">Group · Family</span>
          <span className="font-mono text-[10px] text-ink-faint">2 members</span>
        </div>
        <ul className="divide-y divide-line">
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
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-line-strong text-ink-faint">
              <UserPlus weight="light" className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13px] text-ink-soft">Invite by email</p>
              <p className="font-mono text-[10px] text-ink-faint">single-use · expires in 48h</p>
            </div>
          </li>
        </ul>
      </div>
      <figcaption className="mt-3 font-mono text-[10px] text-ink-faint">
        Groups stay small on purpose; invites are single-use and expiring.
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
          title="Small circles, by email, with doors that lock themselves."
          body="A group is a handful of people you actually know. Invites go out by email, work exactly once, and expire on their own within a week at most. Members can leave; owners can remove; nothing is discoverable or public."
          bullets={[
            {
              label: 'Owner & member roles',
              desc: 'The owner links notebooks and manages members. Members read and write into shared notebooks.',
            },
            {
              label: 'Single-use invites',
              desc: 'Addressed to one email, expiring after 48 hours by default, revocable any time.',
            },
            {
              label: 'Presence, not pings',
              desc: 'See who has the shared notebook open — no notifications demanding replies.',
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
            <div className="overflow-hidden rounded-lg border border-line bg-paper-raised shadow-diffuse">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                  enforcement, not promises
                </span>
                <LockSimple weight="light" className="h-3.5 w-3.5 text-ink-faint" />
              </div>
              <ul className="divide-y divide-line">
                {[
                  'Row-level security on profiles, notebooks, entries, groups, invites',
                  'Google OAuth via PKCE — the anon key never leaves the server',
                  'Sliding-window rate limits on every auth endpoint',
                  'Single-use, expiring invite tokens',
                  'No trackers, no analytics beacons, no ad identifiers',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 px-4 py-3">
                    <Check weight="bold" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage" />
                    <span className="text-[12.5px] leading-snug text-ink-soft">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <figcaption className="mt-3 font-mono text-[10px] text-ink-faint">
              The security posture, itemized. The RLS policies are in the repo, in SQL.
            </figcaption>
          </figure>
        </Row>

        {/* CTA */}
        <section className="mt-8 border-t border-line py-16 md:py-20">
          <div className="rounded-xl border border-line bg-paper-deep px-6 py-12 text-center sm:px-12">
            <h2 className="font-display text-3xl leading-tight tracking-tight text-ink">Start your first notebook.</h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-[14px] leading-relaxed text-ink-soft">
              Free forever for the journal itself — three notebooks, one shared, every feature above. Google sign-in
              takes about nine seconds.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button asChild size="lg" className="press h-11 gap-2 px-6 shadow-ink">
                <Link href="/register">
                  Start free <ArrowRight weight="bold" className="h-4 w-4" />
                </Link>
              </Button>
              <Link
                href="/pricing"
                className="text-[13.5px] text-ink-soft underline decoration-line-strong underline-offset-[5px] transition-colors hover:text-ink hover:decoration-clay"
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
