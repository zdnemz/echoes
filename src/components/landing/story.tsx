'use client'

import { memo } from 'react'
import { motion } from 'framer-motion'
import { MoodGlyph } from '@/components/mood/glyphs'

const spring = { type: 'spring', stiffness: 100, damping: 20 } as const

const TIMELINE = [
  {
    time: '06:41',
    title: 'The market at six a.m.',
    mood: 'great' as const,
    tags: ['#market-list', '#sourdough'],
    note: "lands on Jonas's screen as it's saved",
  },
  {
    time: '07:02',
    title: 'Bread notes, week 34',
    mood: 'good' as const,
    tags: ['#sourdough'],
    note: 'Jonas opens the notebook — nothing to sync',
  },
  {
    time: '09:15',
    title: 'The argument, resolved by breakfast',
    mood: 'okay' as const,
    tags: [],
    note: 'edited once; saved to the shared notebook',
  },
]

const TypingDots = memo(function TypingDots() {
  return (
    <span className="flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 bg-accent"
          animate={{ y: [0, -3.5, 0], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.16, ease: 'easeInOut' }}
        />
      ))}
    </span>
  )
})

export function KitchenTableStory() {
  return (
    <section id="share" className="scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <div className="grid gap-12 border-t-[3px] border-foreground pt-14 lg:grid-cols-12 lg:gap-16">
          {/* narrative — left */}
          <div className="lg:col-span-5">
            <p className="inline-block border-2 border-foreground bg-foreground px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-background">
              03 — One notebook, shared
            </p>
            <h2 className="font-display mt-4 max-w-[18ch] text-3xl uppercase md:text-4xl">
              The Kitchen Table notebook
            </h2>
            <p className="mt-6 max-w-[52ch] text-[14.5px] font-bold leading-relaxed">
              Maya keeps one notebook for the household — market lists, the sourdough log, small arguments resolved by
              breakfast. She links it to a group with exactly one other member: Jonas.
            </p>
            <p className="mt-4 max-w-[52ch] text-[14.5px] font-bold leading-relaxed">
              When Maya saves an entry, it is in the shared notebook the next time Jonas opens it — no sync buttons, no
              stale copies. Sharing is quiet by design: no bells, no announcements.
            </p>

            <div className="mt-8 max-w-[52ch] border-2 border-foreground bg-muted p-5 shadow-brutal">
              <p className="text-[14.5px] font-bold leading-relaxed">
                "The 3 a.m. page stays mine. Everything else — the bread, the lists, the weather of the week — lands
                with him when I write it."
              </p>
              <p className="mt-3 inline-block bg-foreground px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-background">
                Maya, on sharing one of four notebooks
              </p>
            </div>
          </div>

          {/* living timeline — right */}
          <motion.div
            className="lg:col-span-7"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.28, delayChildren: 0.2 } } }}
          >
            <motion.div
              variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: spring } }}
              className="overflow-hidden border-2 border-foreground bg-background shadow-brutal"
            >
              {/* header */}
              <div className="flex flex-wrap items-center gap-3 border-b-2 border-foreground px-5 py-3.5">
                <span className="font-mono text-[16px] font-black uppercase">Kitchen Table</span>
                <span className="border-2 border-foreground bg-accent px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-background">
                  shared · 2 members
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <span
                    className="flex h-6 w-6 items-center justify-center border-2 border-foreground bg-foreground font-mono text-[9px] font-bold text-background"
                    title="Maya Lindqvist"
                  >
                    ML
                  </span>
                  <span
                    className="flex h-6 w-6 items-center justify-center border-2 border-foreground bg-background font-mono text-[9px] font-bold"
                    title="Jonas Adeyemi"
                  >
                    JA
                  </span>
                  <span className="ml-1 h-2 w-2 bg-accent" aria-hidden="true" />
                </span>
              </div>

              {/* entries cascade */}
              <ul>
                {TIMELINE.map((e, i) => (
                  <motion.li
                    key={e.title}
                    variants={{ hidden: { opacity: 0, x: -14 }, show: { opacity: 1, x: 0, transition: spring } }}
                    className={`flex items-start gap-4 px-5 py-4 ${i > 0 ? 'border-t-2 border-foreground' : ''}`}
                  >
                    <span className="bg-foreground px-1.5 py-0.5 pt-0.5 font-mono text-[10.5px] font-bold text-background">
                      {e.time}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-[14px] font-bold">{e.title}</span>
                        {e.mood && (
                          <span className={e.mood === 'great' ? 'text-accent' : ''}>
                            <MoodGlyph mood={e.mood} className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                      {e.tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {e.tags.map((t) => (
                            <span
                              key={t}
                              className="border border-foreground bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="mt-1.5 font-mono text-[10px] font-bold uppercase">{e.note}</p>
                    </div>
                  </motion.li>
                ))}
              </ul>

              {/* footer — typing */}
              <div className="flex items-center gap-2.5 border-t-2 border-foreground bg-muted px-5 py-3">
                <TypingDots />
                <span className="font-mono text-[10.5px] font-bold uppercase">Maya is writing…</span>
                <span className="ml-auto bg-accent px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-background">
                  shared
                </span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
