/**
 * Mood glyphs — five hand-drawn 1.5-stroke icons, one per mood.
 * No emoji (banned by the design skill); each glyph is a small weather
 * mark you could find inked in a paper notebook margin.
 */

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const MOODS = ['great', 'good', 'okay', 'low', 'rough'] as const
export type Mood = (typeof MOODS)[number]

export const MOOD_META: Record<Mood, { label: string; color: string; tint: string; note: string }> = {
  great: {
    label: 'Radiant',
    color: 'var(--mood-great)',
    tint: 'rgba(189,143,52,0.12)',
    note: 'the kind of day you want to keep',
  },
  good: { label: 'Steady', color: 'var(--mood-good)', tint: 'rgba(124,142,90,0.13)', note: 'quiet, solid, fine' },
  okay: { label: 'Even', color: 'var(--mood-okay)', tint: 'rgba(162,154,137,0.16)', note: 'nothing to report' },
  low: {
    label: 'Heavy',
    color: 'var(--mood-low)',
    tint: 'rgba(176,134,118,0.13)',
    note: 'weather dragging at the edges',
  },
  rough: { label: 'Weathered', color: 'var(--mood-rough)', tint: 'rgba(111,82,70,0.12)', note: 'write it down anyway' },
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function GreatGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full">
      <circle cx="12" cy="12" r="3.6" {...stroke} />
      <path d="M12 3.4v2.2M12 18.4v2.2M3.4 12h2.2M18.4 12h2.2" {...stroke} />
      <path d="M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" {...stroke} />
    </svg>
  )
}

function GoodGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full">
      <path d="M7.4 15.5a4.6 4.6 0 0 1 9.2 0" {...stroke} />
      <path d="M12 7.2v2.1M8 9l1.4 1.5M16 9l-1.4 1.5" {...stroke} />
      <path d="M3.8 15.5h16.4" {...stroke} />
    </svg>
  )
}

function OkayGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full">
      <path d="M3.8 15.2h16.4" {...stroke} />
      <circle cx="12" cy="12" r="3.2" {...stroke} />
    </svg>
  )
}

function LowGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full">
      <path d="M7 12.8a4.4 4.4 0 0 1 8.6-1.4 3.4 3.4 0 0 1 1.4 6.6H7a2.9 2.9 0 0 1 0-5.2" {...stroke} />
      <path d="M9.2 20l-.9 2M12.6 20l-.9 2M16 20l-.9 2" {...stroke} />
    </svg>
  )
}

function RoughGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full">
      <path d="M7 11.6a4.4 4.4 0 0 1 8.6-1.4 3.4 3.4 0 0 1 1.4 6.6H7a2.9 2.9 0 0 1 0-5.2" {...stroke} />
      <path d="M12.6 14.2l-2.6 3.4h3l-2.2 4" {...stroke} />
    </svg>
  )
}

const GLYPHS: Record<Mood, () => React.JSX.Element> = {
  great: GreatGlyph,
  good: GoodGlyph,
  okay: OkayGlyph,
  low: LowGlyph,
  rough: RoughGlyph,
}

export function MoodGlyph({ mood, className }: { mood: Mood; className?: ClassValue }) {
  const Glyph = GLYPHS[mood]
  return (
    <span className={twMerge(clsx('inline-block h-4 w-4', className))}>
      <Glyph />
    </span>
  )
}

/** A mood as an inline chip: glyph + label, tinted with the mood color. */
export function MoodChip({ mood, className }: { mood: Mood; className?: ClassValue }) {
  const meta = MOOD_META[mood]
  return (
    <span
      className={twMerge(
        clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium', className),
      )}
      style={{ background: meta.tint, color: meta.color }}
    >
      <MoodGlyph mood={mood} className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  )
}
