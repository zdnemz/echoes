import { memo } from 'react'
import Link from 'next/link'
import { ArrowRight, Eye } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { MoodGlyph } from '@/components/mood/glyphs'
import { initials } from '@/lib/format'

function PersonDot({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="flex h-7 w-7 items-center justify-center border-2 border-foreground bg-foreground font-mono text-[10px] font-bold text-background"
      aria-label={name}
    >
      {initials(name)}
    </span>
  )
}

/** The "new entry landed" chip — static, loud, offset over the card. */
const LandedChip = memo(function LandedChip() {
  return (
    <div
      aria-hidden="true"
      className="absolute -right-3 -top-4 z-10 border-2 border-foreground bg-accent px-3 py-2 text-background shadow-brutal-sm"
    >
      <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.14em]">just landed</p>
      <p className="font-mono text-[13px] font-bold">Kitchen Table · shared</p>
    </div>
  )
})

/** Presence chip docked on the artifact card. */
const PresenceChip = memo(function PresenceChip() {
  return (
    <div className="absolute -bottom-4 right-5 flex items-center gap-2 border-2 border-foreground bg-background py-1.5 pl-1.5 pr-3.5 shadow-brutal-sm">
      <span className="h-2 w-2 bg-foreground" aria-hidden="true" />
      <PersonDot name="Jonas Adeyemi" />
      <span className="font-mono text-[10px] font-bold uppercase">Jonas is reading</span>
    </div>
  )
})

/** The full right-column artifact. */
const HeroArtifact = memo(function HeroArtifact() {
  return (
    <div className="relative">
      <LandedChip />

      {/* back card — the one beneath */}
      <div
        aria-hidden="true"
        className="absolute inset-x-6 top-8 rotate-[1.8deg] border-2 border-foreground bg-muted p-5"
      >
        <div className="h-2.5 w-24 bg-foreground/20" />
        <div className="mt-4 space-y-2">
          <div className="h-2 w-full bg-foreground/20" />
          <div className="h-2 w-4/5 bg-foreground/20" />
        </div>
      </div>

      {/* front card — the entry */}
      <article className="relative border-2 border-foreground bg-background p-6 shadow-brutal">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]">Sat · Sep 12 · 06:41</p>
          <span className="text-accent">
            <MoodGlyph mood="great" className="h-4.5 w-4.5" />
          </span>
        </div>

        <h3 className="font-display mt-3 text-2xl">The market at six a.m.</h3>

        <p className="mt-3 text-[14.5px] leading-relaxed">
          Bought the last sourdough before the crowd thickened. Jonas lost the good umbrella — again — so we shared mine
          the whole way back. The bread is still warm on the counter. I keep thinking: write this down before it becomes
          yesterday.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="border-2 border-foreground bg-muted px-2 py-1 font-mono text-[10px] font-bold">
            #market-list
          </span>
          <span className="border-2 border-foreground bg-muted px-2 py-1 font-mono text-[10px] font-bold">
            #sourdough
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase text-accent">
            <Eye weight="bold" className="h-3.5 w-3.5" /> shared with Jonas
          </span>
        </div>

        <PresenceChip />
      </article>
    </div>
  )
})

export function Hero() {
  return (
    <section className="relative">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-12 lg:gap-0">
        {/* statement — left aligned */}
        <div className="lg:col-span-7 lg:pr-14">
          <p className="inline-block border-2 border-foreground bg-foreground px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-background">
            Echoes · private notebooks
          </p>
          <h1 className="font-display mt-5 text-4xl leading-[1.02] md:text-6xl">
            A quiet place for <span className="bg-accent px-2 text-background">loud thoughts</span>.
          </h1>
          <p className="mt-6 max-w-[56ch] border-l-4 border-accent pl-4 text-[15.5px] font-bold leading-relaxed">
            Private markdown notebooks with moods and tags — except the one notebook you share, where entries land live.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Button asChild size="lg">
              <Link href="/register">
                Start writing free <ArrowRight weight="bold" className="h-4 w-4" />
              </Link>
            </Button>
            <Link
              href="/features"
              className="border-2 border-foreground px-4 py-2.5 text-[13px] font-bold uppercase tracking-wide hover:bg-muted"
            >
              See how it works
            </Link>
          </div>

          {/* proof row — three hard boxes */}
          <div className="mt-12 grid max-w-md grid-cols-3 gap-4">
            {[
              { k: '5', v: 'moods to rate a day' },
              { k: '1', v: 'notebook you can share' },
              { k: '0', v: 'entries public by default' },
            ].map((item) => (
              <div key={item.v} className="border-2 border-foreground bg-background p-3 shadow-brutal-sm">
                <p className="font-mono text-2xl font-black">{item.k}</p>
                <p className="mt-1 text-[11.5px] font-bold uppercase leading-snug">{item.v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* artifact — right */}
        <div className="lg:col-span-5 lg:border-l-[3px] lg:border-foreground lg:pl-14">
          <div className="px-2 pt-4 pb-10 sm:px-6 lg:px-0">
            <HeroArtifact />
          </div>
        </div>
      </div>
    </section>
  )
}
