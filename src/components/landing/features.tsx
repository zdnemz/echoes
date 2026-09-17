import { MOODS, MoodGlyph } from '@/components/mood/glyphs'
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
    <div className="grid gap-8 border-t-[3px] border-foreground pt-14 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <p className="inline-block border-2 border-foreground bg-foreground px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-background">
          {index} — {eyebrow}
        </p>
        <h2 className="font-display mt-4 max-w-[20ch] text-3xl uppercase md:text-4xl">{title}</h2>
      </div>
      <p className="self-end border-2 border-foreground bg-muted p-4 text-[13.5px] font-bold leading-relaxed lg:col-span-5">
        {aside}
      </p>
    </div>
  )
}

function FeatureList({ items }: { items: Array<{ label: string; desc: string }> }) {
  return (
    <ul className="mt-8 border-2 border-foreground shadow-brutal">
      {items.map((item, i) => (
        <li key={item.label} className={`flex gap-5 p-4 ${i > 0 ? 'border-t-2 border-foreground' : ''}`}>
          <span className="h-fit shrink-0 bg-foreground px-2 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.12em] text-background">
            {item.label}
          </span>
          <span className="text-[13.5px] font-bold leading-relaxed">{item.desc}</span>
        </li>
      ))}
    </ul>
  )
}

// ------------------------------------------------------------- artifacts

function EditorArtifact() {
  return (
    <figure>
      <div className="overflow-hidden border-2 border-foreground bg-background shadow-brutal">
        <div className="flex items-center justify-between border-b-2 border-foreground px-4 py-2.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">Entry · draft</span>
          <div className="flex items-center gap-3" aria-hidden="true">
            {MOODS.map((m, i) => (
              <span key={m} className={i === 2 ? 'text-accent opacity-100' : 'opacity-30'}>
                <MoodGlyph mood={m} className="h-4 w-4" />
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="border-foreground p-4 font-mono text-[12px] leading-6 sm:border-r-2">
            <p># A slow morning</p>
            <p>&nbsp;</p>
            <p>Woke before the alarm. The</p>
            <p>
              coffee was **excellent** —
              <span className="ml-0.5 inline-block h-3.5 w-[7px] animate-pulse bg-accent align-middle" />
            </p>
            <p>&nbsp;</p>
            <p>&gt; write it down before</p>
            <p>&gt; it becomes yesterday</p>
          </div>
          <div className="bg-muted p-4">
            <MarkdownView className="text-[13px]">
              {`# A slow morning

Woke before the alarm. The coffee was **excellent** — first try, no bitter edge, the way it only happens when nobody is waiting for it.

> write it down before it becomes yesterday`}
            </MarkdownView>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 border-l-4 border-accent pl-3 font-mono text-[11px] font-bold uppercase">
        The editor, mid-sentence — raw on the left, typeset as you go.
      </figcaption>
    </figure>
  )
}

function SharingArtifact() {
  return (
    <figure>
      <div className="overflow-hidden border-2 border-foreground bg-background shadow-brutal">
        <div className="flex items-center gap-3 border-b-2 border-foreground px-4 py-3">
          <span className="font-mono text-[15px] font-black uppercase">Kitchen Table</span>
          <span className="inline-flex items-center gap-1.5 border-2 border-foreground bg-accent px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-background">
            <LinkSimple weight="bold" className="h-3 w-3" /> shared · 2 members
          </span>
          <span className="ml-auto flex" aria-hidden="true">
            <span className="flex h-6 w-6 items-center justify-center border-2 border-foreground bg-foreground font-mono text-[9px] font-bold text-background">
              ML
            </span>
            <span className="-ml-0.5 flex h-6 w-6 items-center justify-center border-2 border-foreground bg-background font-mono text-[9px] font-bold">
              JA
            </span>
          </span>
        </div>
        <ul>
          <li className="flex items-center gap-3 border-b-2 border-foreground px-4 py-3">
            <span className="font-mono text-[10px] font-bold">06:41</span>
            <span className="text-[13px] font-bold">The market at six a.m.</span>
            <span className="ml-auto text-accent">
              <MoodGlyph mood="great" className="h-4 w-4" />
            </span>
          </li>
          <li className="flex items-center gap-3 border-b-2 border-foreground px-4 py-3">
            <span className="font-mono text-[10px] font-bold">Mar 3</span>
            <span className="text-[13px] font-bold">Overnight notes</span>
            <span className="ml-auto">
              <MoodGlyph mood="low" className="h-4 w-4" />
            </span>
          </li>
          <li className="flex items-center gap-3 bg-muted px-4 py-3 opacity-70">
            <span className="font-mono text-[10px] font-bold">03:12</span>
            <span className="text-[13px] font-bold line-through">The 3 a.m. page</span>
            <span className="ml-auto inline-flex items-center gap-1 border-2 border-foreground bg-background px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase">
              <EyeSlash weight="bold" className="h-3.5 w-3.5" /> kept private
            </span>
          </li>
        </ul>
        <div className="flex items-center gap-2 border-t-2 border-foreground px-4 py-2.5">
          <span className="h-2 w-2 bg-foreground" aria-hidden="true" />
          <span className="font-mono text-[10px] font-bold uppercase">Shared with Jonas</span>
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase text-accent">
            <Eye weight="bold" className="h-3.5 w-3.5" /> shared
          </span>
        </div>
      </div>
      <figcaption className="mt-3 border-l-4 border-accent pl-3 font-mono text-[11px] font-bold uppercase">
        Shared notebook — and the 3 a.m. page, opted out per-entry.
      </figcaption>
    </figure>
  )
}

function PolicyArtifact() {
  return (
    <figure>
      <div className="overflow-hidden border-2 border-foreground bg-foreground text-background shadow-brutal-accent">
        <div className="flex items-center justify-between border-b-2 border-background px-4 py-2.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
            supabase/migrations/0001_init.sql
          </span>
          <span className="border-2 border-background bg-accent px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase">
            postgres
          </span>
        </div>
        <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-[1.7]">
          <code>
            <span className="text-accent">create policy</span>{' '}
            <span className="font-bold underline decoration-accent underline-offset-2">
              "entries: group members read shared"
            </span>
            {'\n'} <span className="text-accent">on</span> entries <span className="text-accent">for select using</span>{' '}
            ({'\n'}
            {'    '}author_id = auth.uid(){'\n'}
            {'    '}
            <span className="text-accent">or exists</span> ({'\n'}
            {'      '}
            <span className="text-accent">select</span> 1 <span className="text-accent">from</span> notebooks nb
            {'\n'}
            {'      '}
            <span className="text-accent">join</span> group_members gm{'\n'}
            {'        '}
            <span className="text-accent">on</span> gm.group_id = nb.group_id{'\n'}
            {'      '}
            <span className="text-accent">where</span> nb.id = entries.notebook_id{'\n'}
            {'        '}
            <span className="text-accent">and</span> gm.user_id = auth.uid(){'\n'}
            {'        '}
            <span className="text-accent">and</span> entries.is_shared{'\n'}
            {'    '}){'\n'}
            {');'}
          </code>
        </pre>
      </div>
      <figcaption className="mt-3 border-l-4 border-accent pl-3 font-mono text-[11px] font-bold uppercase">
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
          <div>
            <h3 className="font-display text-2xl uppercase">Write in markdown, read in newsprint</h3>
            <p className="mt-4 max-w-[52ch] text-[14.5px] font-bold leading-relaxed">
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
          <EditorArtifact />
        </div>

        <div className="mt-20 grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div className="order-last lg:order-first">
            <h3 className="font-display text-2xl uppercase">Share one notebook, not your whole life</h3>
            <p className="mt-4 max-w-[52ch] text-[14.5px] font-bold leading-relaxed">
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
          <div className="order-first lg:order-last">
            <SharingArtifact />
          </div>
        </div>

        <div className="mt-20 grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <h3 className="font-display text-2xl uppercase">Private where it counts — in the database</h3>
            <p className="mt-4 max-w-[52ch] text-[14.5px] font-bold leading-relaxed">
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
          <PolicyArtifact />
        </div>
      </div>
    </section>
  )
}
