import { MOODS, MoodGlyph } from '@/components/mood/glyphs'
import { MarkdownView } from '@/components/markdown/markdown-view'
import { Eye, EyeSlash, LinkSimple } from '@phosphor-icons/react/dist/ssr'

function EditorArtifact() {
  return (
    <div className="overflow-hidden border-2 border-foreground bg-background shadow-brutal-sm">
      <div className="flex items-center justify-between border-b-2 border-foreground px-4 py-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider">Editor Preview</span>
        <div className="flex items-center gap-2" aria-hidden="true">
          {MOODS.map((m, i) => (
            <span key={m} className={i === 2 ? 'text-accent opacity-100' : 'opacity-30'}>
              <MoodGlyph mood={m} className="h-3.5 w-3.5" />
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div className="p-3 font-mono text-[11.5px] leading-5 sm:border-r-2">
          <p># A slow morning</p>
          <p className="mt-1">Coffee was **hot**.</p>
          <p className="mt-1 text-accent">&gt; write it down</p>
        </div>
        <div className="border-t-2 border-foreground bg-muted p-3 sm:border-t-0">
          <MarkdownView className="text-[12px]">
            {`# A slow morning\n\nCoffee was **hot**.\n\n> write it down`}
          </MarkdownView>
        </div>
      </div>
    </div>
  )
}

function SharingArtifact() {
  return (
    <div className="overflow-hidden border-2 border-foreground bg-background shadow-brutal-sm">
      <div className="flex items-center gap-3 border-b-2 border-foreground px-4 py-2.5">
        <span className="font-mono text-[13px] font-black uppercase">Kitchen Table</span>
        <span className="inline-flex items-center gap-1 border border-foreground bg-accent px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-background">
          <LinkSimple weight="bold" className="h-2.5 w-2.5" /> shared
        </span>
        <span className="ml-auto flex" aria-hidden="true">
          <span className="flex h-5 w-5 items-center justify-center border border-foreground bg-foreground font-mono text-[8px] font-bold text-background">
            ML
          </span>
          <span className="-ml-1 flex h-5 w-5 items-center justify-center border border-foreground bg-background font-mono text-[8px] font-bold">
            JA
          </span>
        </span>
      </div>
      <ul className="text-xs font-bold">
        <li className="flex items-center gap-2 border-b border-foreground px-4 py-2">
          <span className="font-mono text-[10px]">06:41</span>
          <span>The market at six a.m.</span>
          <span className="ml-auto text-accent">
            <MoodGlyph mood="great" className="h-3.5 w-3.5" />
          </span>
        </li>
        <li className="flex items-center gap-2 bg-muted px-4 py-2 opacity-60">
          <span className="font-mono text-[10px]">03:12</span>
          <span className="line-through">The 3 a.m. page</span>
          <span className="ml-auto inline-flex items-center gap-1 border border-foreground bg-background px-1 py-0.5 font-mono text-[9px] font-bold uppercase">
            <EyeSlash weight="bold" className="h-2.5 w-2.5" /> private
          </span>
        </li>
      </ul>
      <div className="flex items-center gap-2 border-t-2 border-foreground px-4 py-1.5 font-mono text-[10px] font-bold uppercase">
        <span className="h-1.5 w-1.5 bg-accent" />
        <span>Live sync</span>
        <span className="ml-auto inline-flex items-center gap-1 text-accent">
          <Eye weight="bold" className="h-3 w-3" /> synced
        </span>
      </div>
    </div>
  )
}

function PolicyArtifact() {
  return (
    <div className="overflow-hidden border-2 border-foreground bg-foreground text-background shadow-brutal-accent">
      <div className="flex items-center justify-between border-b border-background px-4 py-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider">Postgres RLS policy</span>
        <span className="border border-background bg-accent px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase">
          SQL
        </span>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-[1.6]">
        <code>
          <span className="text-accent">CREATE POLICY</span> "entries_shared"
          <br />
          <span className="text-accent">ON</span> entries <span className="text-accent">FOR SELECT USING</span> (<br />
          {'  '}author_id = auth.uid()
          <br />
          {'  '}
          <span className="text-accent">OR</span> (is_shared <span className="text-accent">AND</span>{' '}
          member_of(group_id))
          <br />
          );
        </code>
      </pre>
    </div>
  )
}

export function FeatureStories() {
  return (
    <section id="features" className="scroll-mt-16 border-b-[3px] border-foreground py-14 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-10">
          <p className="inline-block border-2 border-foreground bg-foreground px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.2em] text-background">
            Architecture
          </p>
          <h2 className="font-display mt-3 text-3xl uppercase md:text-4xl">Built for privacy and speed</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Card 1 */}
          <div className="flex flex-col justify-between border-2 border-foreground bg-background p-5 shadow-brutal">
            <div>
              <p className="font-mono text-xs font-black text-accent">01</p>
              <h3 className="font-display mt-2 text-xl uppercase">Split Editor</h3>
              <p className="mt-2 text-[13px] font-bold leading-snug">
                Raw markdown on the left, rendered typeset preview on the right.
              </p>
            </div>
            <div className="mt-6">
              <EditorArtifact />
            </div>
          </div>

          {/* Card 2 */}
          <div className="flex flex-col justify-between border-2 border-foreground bg-background p-5 shadow-brutal">
            <div>
              <p className="font-mono text-xs font-black text-accent">02</p>
              <h3 className="font-display mt-2 text-xl uppercase">Shared Notebook</h3>
              <p className="mt-2 text-[13px] font-bold leading-snug">
                Stream live entries to your circle with per-entry opt-out.
              </p>
            </div>
            <div className="mt-6">
              <SharingArtifact />
            </div>
          </div>

          {/* Card 3 */}
          <div className="flex flex-col justify-between border-2 border-foreground bg-background p-5 shadow-brutal">
            <div>
              <p className="font-mono text-xs font-black text-accent">03</p>
              <h3 className="font-display mt-2 text-xl uppercase">Database RLS</h3>
              <p className="mt-2 text-[13px] font-bold leading-snug">
                Postgres row-level policies reject unpermitted queries at the root.
              </p>
            </div>
            <div className="mt-6">
              <PolicyArtifact />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
