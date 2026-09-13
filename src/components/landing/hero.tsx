'use client'

/**
 * Landing hero — asymmetric split: oversized serif statement on the left,
 * a living entry-card artifact on the right. All perpetual motion lives
 * here, isolated from the rest of the page (memoized, transform/opacity
 * only), so the server-rendered text column stays cheap.
 */

import { memo } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, Eye } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { MoodGlyph } from '@/components/mood/glyphs'
import { avatarTone, initials } from '@/lib/format'

// ------------------------------------------------------------- mini cast

const PEOPLE = [
  { id: 'maya', name: 'Maya Lindqvist' },
  { id: 'jonas', name: 'Jonas Adeyemi' },
]

function PersonDot({ id, name, ring = false }: { id: string; name: string; ring?: boolean }) {
  const tone = avatarTone(id)
  return (
    <span
      title={name}
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

/** The "new entry landed" chip — overshoots in, dwells, fades. Loops. */
const LandedChip = memo(function LandedChip() {
  return (
    <motion.div
      aria-hidden="true"
      className="absolute -right-3 -top-4 z-10 rounded-lg border border-line bg-paper-raised px-3 py-2 shadow-diffuse"
      initial={{ opacity: 0, y: -10, scale: 0.94 }}
      animate={{ opacity: [0, 1, 1, 0, 0], y: [-10, 0, 0, -4, -4], scale: [0.94, 1.04, 1, 0.98, 0.98] }}
      transition={{ duration: 7, times: [0, 0.07, 0.62, 0.72, 1], repeat: Infinity, repeatDelay: 1.5, ease: 'easeOut' }}
    >
      <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-clay">just landed</p>
      <p className="font-display text-[13px] text-ink">Kitchen Table · shared</p>
    </motion.div>
  )
})

/** Breathing presence chip docked on the artifact card. */
const PresenceChip = memo(function PresenceChip() {
  return (
    <div className="absolute -bottom-4 right-5 flex items-center gap-2 rounded-full border border-line bg-paper-raised py-1.5 pl-1.5 pr-3.5 shadow-diffuse">
      <span className="relative flex h-6 w-6 items-center justify-center">
        <span className="absolute h-2 w-2 rounded-full bg-sage opacity-60 animate-breathe" />
        <span className="h-2 w-2 rounded-full bg-sage" />
      </span>
      <PersonDot id="jonas" name="Jonas Adeyemi" />
      <span className="font-mono text-[10px] text-ink-soft">Jonas is reading</span>
    </div>
  )
})

/** The full right-column artifact. */
const HeroArtifact = memo(function HeroArtifact() {
  return (
    <motion.div
      className="relative"
      animate={{ y: [0, -7, 0] }}
      transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
    >
      <LandedChip />

      {/* back card — the one beneath */}
      <div
        aria-hidden="true"
        className="absolute inset-x-6 top-8 rotate-[1.8deg] rounded-lg border border-line bg-paper-raised/70 p-5 opacity-80"
      >
        <div className="h-2.5 w-24 rounded-sm bg-paper-deep" />
        <div className="mt-4 space-y-2">
          <div className="h-2 w-full rounded-sm bg-paper-deep" />
          <div className="h-2 w-4/5 rounded-sm bg-paper-deep" />
        </div>
      </div>

      {/* front card — the entry */}
      <motion.article
        className="relative rounded-lg border border-line bg-paper-raised p-6 shadow-lift"
        animate={{ rotate: [-1.1, -0.4, -1.1] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">Sat · Sep 12 · 06:41</p>
          <span className="text-mood-great">
            <MoodGlyph mood="great" className="h-4.5 w-4.5" />
          </span>
        </div>

        <h3 className="font-display mt-3 text-2xl leading-tight text-ink">The market at six a.m.</h3>

        <p className="mt-3 font-serif text-[14.5px] leading-relaxed text-ink-soft">
          Bought the last sourdough before the crowd thickened. Jonas lost the good umbrella — again — so we shared mine
          the whole way back. The bread is still warm on the counter. I keep thinking: write this down before it becomes
          yesterday.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-paper-deep px-2.5 py-1 font-mono text-[10px] text-ink-soft">
            #market-list
          </span>
          <span className="rounded-full bg-paper-deep px-2.5 py-1 font-mono text-[10px] text-ink-soft">#sourdough</span>
          <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] text-ink-faint">
            <Eye weight="light" className="h-3.5 w-3.5" /> shared with Jonas
          </span>
        </div>

        <PresenceChip />
      </motion.article>
    </motion.div>
  )
})

// ------------------------------------------------------------- hero

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* soft clay wash, upper right — one quiet accent, no gradient text */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, rgba(217,163,140,0.28), transparent)' }}
      />

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-12 lg:gap-0">
        {/* statement — left aligned, editorial */}
        <div className="lg:col-span-7 lg:pr-14">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">Echoes · private notebooks</p>
          <h1 className="font-display mt-5 text-[2.7rem] leading-[1.04] tracking-tight text-ink md:text-6xl">
            A quiet place for <em className="font-serif italic text-clay">loud thoughts</em>.
          </h1>
          <p className="mt-6 max-w-[56ch] text-[15.5px] leading-relaxed text-ink-soft">
            Notebooks of markdown entries, each with a mood and a handful of tags. Private by default — except the one
            notebook you open to the two people who should see it, where new entries land the moment you save them.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Button asChild size="lg" className="press h-11 gap-2 px-6 shadow-ink">
              <Link href="/register">
                Start writing free <ArrowRight weight="bold" className="h-4 w-4" />
              </Link>
            </Button>
            <Link
              href="/features"
              className="text-[13.5px] text-ink-soft underline decoration-line-strong underline-offset-[5px] transition-colors hover:text-ink hover:decoration-clay"
            >
              See how it works
            </Link>
          </div>

          {/* proof row — concrete, quiet */}
          <div className="mt-12 flex max-w-md items-stretch divide-x divide-line border-t border-line pt-5">
            {[
              { k: '5', v: 'moods to rate a day' },
              { k: '1', v: 'notebook you can share' },
              { k: '0', v: 'entries public by default' },
            ].map((item) => (
              <div key={item.v} className="flex-1 px-4 first:pl-0 last:pr-0">
                <p className="font-mono text-xl font-semibold text-ink">{item.k}</p>
                <p className="mt-1 text-[11.5px] leading-snug text-ink-faint">{item.v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* artifact — right */}
        <div className="lg:col-span-5 lg:border-l lg:border-line lg:pl-14">
          <div className="px-2 pt-4 pb-10 sm:px-6 lg:px-0">
            <HeroArtifact />
          </div>
        </div>
      </div>
    </section>
  )
}
