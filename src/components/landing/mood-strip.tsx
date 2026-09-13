/**
 * The five moods + a slow kinetic tag marquee. Server component — the
 * marquee is a pure CSS transform loop (no JS), paused on hover.
 */

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
          className="whitespace-nowrap rounded-full border border-line bg-paper-raised px-3.5 py-1.5 font-mono text-[11px] text-ink-soft"
        >
          {tag}
        </span>
      ))}
    </div>
  )
}

export function MoodStrip() {
  return (
    <section id="moods" className="scroll-mt-16 border-y border-line bg-paper-deep">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-16">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-clay">02 — The five moods</p>
            <h2 className="font-display mt-4 max-w-[16ch] text-3xl leading-tight tracking-tight text-ink md:text-4xl">
              Every entry lands with a mood.
            </h2>
            <p className="mt-5 max-w-[46ch] text-[13.5px] leading-relaxed text-ink-soft">
              One ink-drawn mark per entry — a small weather report of the day. Filter a whole notebook down to its
              rough patches, or trace a run of radiant weeks.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-5 lg:col-span-7 lg:self-end">
            {MOODS.map((mood, i) => {
              const meta = MOOD_META[mood]
              return (
                <div key={mood} className="animate-rise" style={{ animationDelay: `${i * 90}ms` }}>
                  <span style={{ color: meta.color }}>
                    <MoodGlyph mood={mood} className="h-7 w-7" />
                  </span>
                  <p className="mt-3 text-[13px] font-medium text-ink">{meta.label}</p>
                  <p className="mt-1 text-[11px] leading-snug text-ink-faint">{meta.note}</p>
                  <span
                    className="mt-3 block h-[2px] w-8 rounded-full"
                    style={{ background: meta.color, opacity: 0.55 }}
                  />
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
