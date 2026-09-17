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
          className="whitespace-nowrap border-2 border-background px-3 py-1 font-mono text-[11px] font-bold uppercase text-background"
        >
          {tag}
        </span>
      ))}
    </div>
  )
}

export function MoodStrip() {
  return (
    <section
      id="moods"
      className="scroll-mt-16 border-b-[3px] border-foreground bg-foreground text-background py-14 md:py-18"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="inline-block bg-accent px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.2em] text-background">
              Moods
            </p>
            <h2 className="font-display mt-2 text-3xl uppercase md:text-4xl">One mark per entry</h2>
          </div>
          <p className="font-mono text-xs font-bold uppercase text-background/70">Filter your month at a glance</p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-px border-2 border-background bg-background sm:grid-cols-5">
          {MOODS.map((mood) => {
            const meta = MOOD_META[mood]
            const hot = mood === 'great'
            return (
              <div
                key={mood}
                className={`p-4 text-center ${hot ? 'bg-accent text-background' : 'bg-foreground text-background'}`}
              >
                <div className="flex justify-center">
                  <MoodGlyph mood={mood} className="h-7 w-7" />
                </div>
                <p className="mt-2 font-mono text-xs font-black uppercase tracking-wider">{meta.label}</p>
              </div>
            )
          })}
        </div>

        {/* tag marquee */}
        <div className="group relative mt-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
          <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
            <TagMarqueeRow />
            <TagMarqueeRow ariaHidden />
          </div>
        </div>
      </div>
    </section>
  )
}
