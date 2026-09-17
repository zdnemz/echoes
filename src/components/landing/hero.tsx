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

const LandedChip = memo(function LandedChip() {
  return (
    <div
      aria-hidden="true"
      className="absolute -right-3 -top-4 z-10 border-2 border-foreground bg-accent px-3 py-1.5 text-background shadow-brutal-sm"
    >
      <p className="font-mono text-[9px] font-bold uppercase tracking-wider">LIVE</p>
      <p className="font-mono text-[12px] font-bold">Kitchen Table</p>
    </div>
  )
})

const PresenceChip = memo(function PresenceChip() {
  return (
    <div className="absolute -bottom-4 right-5 flex items-center gap-2 border-2 border-foreground bg-background py-1 pl-1.5 pr-3 shadow-brutal-sm">
      <span className="h-2 w-2 bg-accent" aria-hidden="true" />
      <PersonDot name="Jonas Adeyemi" />
      <span className="font-mono text-[10px] font-bold uppercase">Jonas reading</span>
    </div>
  )
})

const HeroArtifact = memo(function HeroArtifact() {
  return (
    <div className="relative">
      <LandedChip />

      <div
        aria-hidden="true"
        className="absolute inset-x-4 top-6 rotate-[2deg] border-2 border-foreground bg-muted p-5"
      >
        <div className="h-2 w-24 bg-foreground/20" />
        <div className="mt-3 space-y-2">
          <div className="h-2 w-full bg-foreground/20" />
          <div className="h-2 w-3/4 bg-foreground/20" />
        </div>
      </div>

      <article className="relative border-2 border-foreground bg-background p-6 shadow-brutal">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wider">06:41 AM</p>
          <span className="text-accent">
            <MoodGlyph mood="great" className="h-4.5 w-4.5" />
          </span>
        </div>

        <h3 className="font-display mt-3 text-xl">The market at six a.m.</h3>

        <p className="mt-2 text-[13.5px] font-bold leading-relaxed">
          Bread is still warm on the counter. Write this down before it becomes yesterday.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <span className="border border-foreground bg-muted px-2 py-0.5 font-mono text-[10px] font-bold">
            #morning
          </span>
          <span className="border border-foreground bg-muted px-2 py-0.5 font-mono text-[10px] font-bold">#bread</span>
          <span className="ml-auto inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase text-accent">
            <Eye weight="bold" className="h-3 w-3" /> shared
          </span>
        </div>

        <PresenceChip />
      </article>
    </div>
  )
})

export function Hero() {
  return (
    <section className="relative border-b-[3px] border-foreground">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-12 sm:px-6 md:py-20 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-7">
          <p className="inline-block border-2 border-foreground bg-foreground px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.2em] text-background">
            Private Journal
          </p>
          <h1 className="font-display mt-4 text-4xl leading-none md:text-6xl">
            A quiet place for <span className="bg-accent px-2 text-background">loud thoughts</span>.
          </h1>
          <p className="mt-5 max-w-[48ch] border-l-4 border-accent pl-4 text-base font-bold leading-relaxed">
            Markdown, moods, and one notebook shared with the people who matter.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/register">
                Start writing <ArrowRight weight="bold" className="h-4 w-4" />
              </Link>
            </Button>
            <Link
              href="/features"
              className="border-2 border-foreground px-5 py-3 font-mono text-[13px] font-bold uppercase tracking-wide hover:bg-muted"
            >
              Features
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            {[
              { k: '5', v: 'moods' },
              { k: '1', v: 'shared notebook' },
              { k: '0', v: 'trackers or ads' },
            ].map((item) => (
              <div
                key={item.v}
                className="flex items-center gap-2 border-2 border-foreground bg-background px-3 py-2 shadow-brutal-sm"
              >
                <span className="font-mono text-lg font-black">{item.k}</span>
                <span className="font-mono text-[11px] font-bold uppercase">{item.v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 lg:pl-6">
          <HeroArtifact />
        </div>
      </div>
    </section>
  )
}
