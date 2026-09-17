import { MOOD_META, MOODS, MoodGlyph } from '@/components/mood/glyphs'

const TAGS = [
  '#sourdough',
  '#3am',
  '#market-list',
  '#letter-to-dad',
  '#first-frost',
  '#slow-sunday',
  '#night-train',
  '#deadline-eve',
  '#phone-call-with-mom',
  '#quarantine-garden',
  '#rain-day',
  '#small-win',
]

function TagMarqueeRow({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <div aria-hidden={ariaHidden} className="flex w-max shrink-0 items-center gap-3 pr-3">
      {TAGS.map((tag) => (
        <span
          key={tag}
          className="whitespace-nowrap border-2 border-background px-3 py-1.5 font-mono text-[11px] font-bold text-background"
        >
          {tag}
        </span>
      ))}
    </div>
  )
}

export function MoodStrip() {
  return (
    <section id="moods" className="scroll-mt-16 border-y-[3px] border-foreground bg-foreground text-background">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-16">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="inline-block bg-accent px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-background">
              02 — The five moods
            </p>
            <h2 className="font-display mt-4 max-w-[16ch] text-3xl uppercase md:text-4xl">
              Every entry lands with a mood.
            </h2>
            <p className="mt-5 max-w-[46ch] border-l-4 border-accent pl-4 text-[13.5px] font-bold leading-relaxed text-background/80">
              One mark per entry — a small weather report of the day. Filter a whole notebook down to its rough patches,
              or trace a run of radiant weeks.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-px border-2 border-background bg-background sm:grid-cols-5 lg:col-span-7 lg:self-end">
            {MOODS.map((mood) => {
              const meta = MOOD_META[mood]
              const hot = mood === 'great'
              return (
                <div
                  key={mood}
                  className={`p-4 ${hot ? 'bg-accent text-background' : 'bg-foreground text-background'}`}
                >
                  <MoodGlyph mood={mood} className="h-7 w-7" />
                  <p className="mt-3 font-mono text-[13px] font-black uppercase">{meta.label}</p>
                  <p className="mt-1 text-[11px] font-bold leading-snug text-background/60">{meta.note}</p>
                </div>
              )
            })}
          </div>
        </div>

        {/* tag marquee — slow, quiet, pauses when you reach for it */}
        <div className="group relative mt-14 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
          <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
            <TagMarqueeRow />
            <TagMarqueeRow ariaHidden />
          </div>
        </div>
      </div>
    </section>
  )
}
