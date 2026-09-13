/**
 * Feature stories — three asymmetric two-column rows (zig-zag), each with a
 * hand-composed artifact instead of a generic screenshot. Server component:
 * pure markup, reveal via CSS cascade (animation-delay), zero client JS.
 */

import { MOOD_META, MOODS, MoodGlyph } from '@/components/mood/glyphs'
import { MarkdownView } from '@/components/markdown/markdown-view'
import { Eye, EyeSlash, LinkSimple } from '@phosphor-icons/react/dist/ssr'

function SectionHead({
  index,
  eyebrow,
  title,
  aside,
}: {
  index: string
  eyebrow: string
  title: string
  aside: string
}) {
  return (
    <div className="grid gap-8 border-t border-line pt-14 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-clay">
          {index} — {eyebrow}
        </p>
        <h2 className="font-display mt-4 max-w-[20ch] text-3xl leading-tight tracking-tight text-ink md:text-4xl">
          {title}
        </h2>
      </div>
      <p className="self-end text-[13.5px] leading-relaxed text-ink-soft lg:col-span-5">{aside}</p>
    </div>
  )
}

function FeatureList({ items }: { items: Array<{ label: string; desc: string }> }) {
  return (
    <ul className="mt-8 divide-y divide-line border-y border-line">
      {items.map((item) => (
        <li key={item.label} className="flex gap-5 py-4">
          <span className="w-28 shrink-0 pt-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
            {item.label}
          </span>
          <span className="text-[13.5px] leading-relaxed text-ink-soft">{item.desc}</span>
        </li>
      ))}
    </ul>
  )
}

// ------------------------------------------------------------- artifacts

function EditorArtifact() {
  return (
    <figure>
      <div className="overflow-hidden rounded-lg border border-line bg-paper-raised shadow-diffuse">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">Entry · draft</span>
          <div className="flex items-center gap-3" aria-hidden="true">
            {MOODS.map((m, i) => (
              <span
                key={m}
                className={i === 2 ? 'opacity-100' : 'opacity-30'}
                style={i === 2 ? { color: MOOD_META[m].color } : undefined}
              >
                <MoodGlyph mood={m} className="h-4 w-4" />
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="border-line p-4 font-mono text-[12px] leading-6 text-ink-soft sm:border-r">
            <p># A slow morning</p>
            <p>&nbsp;</p>
            <p>Woke before the alarm. The</p>
            <p>
              coffee was **excellent** —
              <span className="ml-0.5 inline-block h-3.5 w-[7px] animate-pulse bg-clay/70 align-middle" />
            </p>
            <p>&nbsp;</p>
            <p>&gt; write it down before</p>
            <p>&gt; it becomes yesterday</p>
          </div>
          <div className="bg-paper/60 p-4">
            <MarkdownView className="text-[13px]">
              {`# A slow morning

Woke before the alarm. The coffee was **excellent** — first try, no bitter edge, the way it only happens when nobody is waiting for it.

> write it down before it becomes yesterday`}
            </MarkdownView>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 font-mono text-[10px] text-ink-faint">
        The editor, mid-sentence — raw on the left, typeset as you go.
      </figcaption>
    </figure>
  )
}

function SharingArtifact() {
  return (
    <figure>
      <div className="overflow-hidden rounded-lg border border-line bg-paper-raised shadow-diffuse">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="font-display text-[15px] text-ink">Kitchen Table</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-clay-tint px-2.5 py-0.5 font-mono text-[10px] text-clay-ink">
            <LinkSimple weight="bold" className="h-3 w-3" /> shared · 2 members
          </span>
          <span className="ml-auto flex -space-x-1.5" aria-hidden="true">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-clay/15 font-mono text-[9px] font-semibold text-clay-ink ring-2 ring-paper-raised">
              ML
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-mood-good/20 font-mono text-[9px] font-semibold text-[#5c6a3f] ring-2 ring-paper-raised">
              JA
            </span>
          </span>
        </div>
        <ul className="divide-y divide-line">
          <li className="flex items-center gap-3 px-4 py-3">
            <span className="font-mono text-[10px] text-ink-faint">06:41</span>
            <span className="text-[13px] text-ink">The market at six a.m.</span>
            <span className="ml-auto text-mood-great">
              <MoodGlyph mood="great" className="h-4 w-4" />
            </span>
          </li>
          <li className="flex items-center gap-3 px-4 py-3">
            <span className="font-mono text-[10px] text-ink-faint">Mar 3</span>
            <span className="text-[13px] text-ink">Overnight notes</span>
            <span className="ml-auto text-mood-low">
              <MoodGlyph mood="low" className="h-4 w-4" />
            </span>
          </li>
          <li className="flex items-center gap-3 bg-paper/60 px-4 py-3 opacity-60">
            <span className="font-mono text-[10px] text-ink-faint">03:12</span>
            <span className="text-[13px] text-ink-soft line-through decoration-ink-ghost/60">The 3 a.m. page</span>
            <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] text-ink-faint">
              <EyeSlash weight="light" className="h-3.5 w-3.5" /> kept private
            </span>
          </li>
        </ul>
        <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
          <span className="relative flex h-3.5 w-3.5 items-center justify-center">
            <span className="absolute h-1.5 w-1.5 rounded-full bg-sage opacity-60 animate-breathe" />
            <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          </span>
          <span className="font-mono text-[10px] text-ink-soft">Shared with Jonas</span>
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] text-clay">
            <Eye weight="light" className="h-3.5 w-3.5" /> shared
          </span>
        </div>
      </div>
      <figcaption className="mt-3 font-mono text-[10px] text-ink-faint">
        Shared notebook — and the 3 a.m. page, opted out per-entry.
      </figcaption>
    </figure>
  )
}

function PolicyArtifact() {
  return (
    <figure>
      <div className="overflow-hidden rounded-lg border border-line bg-paper-raised shadow-diffuse">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            supabase/migrations/0001_init.sql
          </span>
          <span className="font-mono text-[10px] text-ink-faint">postgres</span>
        </div>
        <pre className="overflow-x-auto bg-paper-deep p-4 font-mono text-[11px] leading-[1.7] text-ink-soft">
          <code>
            <span className="text-clay-ink">create policy</span>{' '}
            <span className="text-[#5c6a3f]">"entries: group members read shared"</span>
            {'\n'} <span className="text-clay-ink">on</span> entries{' '}
            <span className="text-clay-ink">for select using</span> ({'\n'}
            {'    '}author_id = auth.uid(){'\n'}
            {'    '}
            <span className="text-clay-ink">or exists</span> ({'\n'}
            {'      '}
            <span className="text-clay-ink">select</span> 1 <span className="text-clay-ink">from</span> notebooks nb
            {'\n'}
            {'      '}
            <span className="text-clay-ink">join</span> group_members gm{'\n'}
            {'        '}
            <span className="text-clay-ink">on</span> gm.group_id = nb.group_id{'\n'}
            {'      '}
            <span className="text-clay-ink">where</span> nb.id = entries.notebook_id{'\n'}
            {'        '}
            <span className="text-clay-ink">and</span> gm.user_id = auth.uid(){'\n'}
            {'        '}
            <span className="text-clay-ink">and</span> entries.is_shared{'\n'}
            {'    '}){'\n'}
            {');'}
          </code>
        </pre>
      </div>
      <figcaption className="mt-3 font-mono text-[10px] text-ink-faint">
        An actual policy from this deployment — visibility enforced in the database, not in the interface.
      </figcaption>
    </figure>
  )
}

// ------------------------------------------------------------- section

export function FeatureStories() {
  return (
    <section id="story" className="scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <SectionHead
          index="01"
          eyebrow="The writing"
          title="The page feels like paper, because a journal should."
          aside="Everything about the editor is tuned for daily handwriting rhythm: a serif you write in, a serif you read in, and metadata small enough to stay out of the way."
        />

        <div className="mt-14 grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div className="animate-rise" style={{ animationDelay: '0ms' }}>
            <h3 className="font-display text-2xl tracking-tight text-ink">Write in markdown, read in newsprint</h3>
            <p className="mt-4 max-w-[52ch] text-[14.5px] leading-relaxed text-ink-soft">
              The split view typesets your entry while you type — headings, quotes and lists rendered the moment you
              make them. No mode switch, no refresh.
            </p>
            <FeatureList
              items={[
                {
                  label: 'Split view',
                  desc: 'Raw markdown on the left, typeset preview on the right — one glance each.',
                },
                {
                  label: 'A mood per entry',
                  desc: 'Five ink-drawn marks, from radiant to weathered. Filter a whole notebook by them.',
                },
                {
                  label: 'Tags, your way',
                  desc: '#sourdough, #3am, #letter-to-dad. There is no taxonomy but the one you invent.',
                },
              ]}
            />
          </div>
          <div className="animate-rise" style={{ animationDelay: '120ms' }}>
            <EditorArtifact />
          </div>
        </div>

        <div className="mt-20 grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div className="animate-rise order-last lg:order-first" style={{ animationDelay: '0ms' }}>
            <h3 className="font-display text-2xl tracking-tight text-ink">Share one notebook, not your whole life</h3>
            <p className="mt-4 max-w-[52ch] text-[14.5px] leading-relaxed text-ink-soft">
              Link a notebook to a small group — family, a partner, two friends. Entries stream to their screens the
              moment you save. The rest of your notebooks never leave your account.
            </p>
            <FeatureList
              items={[
                {
                  label: 'Live entries',
                  desc: 'Inserts, edits and deletions appear for the group in real time — no refresh.',
                },
                {
                  label: 'Per-entry opt-out',
                  desc: 'Keep the 3 a.m. page to yourself, even inside a shared notebook.',
                },
                {
                  label: 'Revoke in one move',
                  desc: 'Unlink the notebook and it is private again, for everyone, instantly.',
                },
              ]}
            />
          </div>
          <div className="animate-rise order-first lg:order-last" style={{ animationDelay: '120ms' }}>
            <SharingArtifact />
          </div>
        </div>

        <div className="mt-20 grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div className="animate-rise" style={{ animationDelay: '0ms' }}>
            <h3 className="font-display text-2xl tracking-tight text-ink">Private where it counts — in the database</h3>
            <p className="mt-4 max-w-[52ch] text-[14.5px] leading-relaxed text-ink-soft">
              Privacy here is not a promise the interface makes and forgets. Every query runs through Postgres row-level
              security against your own session — if a row should not reach you, the database itself declines to return
              it.
            </p>
            <FeatureList
              items={[
                {
                  label: 'RLS enforced',
                  desc: 'Visibility rules live in Postgres policies, checked on every single read.',
                },
                {
                  label: 'No client IDs',
                  desc: 'Your identity is derived from the session token, never from the request body.',
                },
                {
                  label: 'Tokens expire',
                  desc: 'Invite links are revocable and time-boxed. Membership revoked, access gone.',
                },
              ]}
            />
          </div>
          <div className="animate-rise" style={{ animationDelay: '120ms' }}>
            <PolicyArtifact />
          </div>
        </div>
      </div>
    </section>
  )
}
