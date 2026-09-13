/**
 * Pure formatting helpers — deterministic, no randomness, safe for both
 * server and client rendering (same input → same output, always).
 */

import { format, isValid } from 'date-fns'

function toDate(value: string): Date | null {
  const d = new Date(value)
  return isValid(d) ? d : null
}

/** "Sep 12" — notebook margin style. */
export function formatDay(value: string): string {
  const d = toDate(value)
  return d ? format(d, 'MMM d') : '—'
}

/** "Sep 12 · 06:41" — entry timestamp. */
export function formatStamp(value: string): string {
  const d = toDate(value)
  return d ? `${format(d, 'MMM d')} · ${format(d, 'HH:mm')}` : '—'
}

/** First letters of a display name or email — "Maya Lindqvist" → "ML". */
export function initials(name: string | null | undefined, fallback = '…'): string {
  if (!name) return fallback
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const letters = parts.map((p) => p[0]).join('')
  return letters.length > 0 ? letters.toUpperCase() : fallback
}

/**
 * Deterministic warm-hue pick for member avatars. Hashing the id means the
 * same person always gets the same color — on server AND client.
 */
const WARM_AVATAR_HUES = [
  { bg: 'rgba(184,92,62,0.16)', fg: '#9d4a2e' }, // clay
  { bg: 'rgba(124,142,90,0.18)', fg: '#5c6a3f' }, // sage
  { bg: 'rgba(189,143,52,0.18)', fg: '#8a6620' }, // ochre
  { bg: 'rgba(176,134,118,0.20)', fg: '#84594b' }, // dusty rose
  { bg: 'rgba(111,82,70,0.16)', fg: '#553d33' }, // umber
]

export function avatarTone(id: string): { bg: string; fg: string } {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  const idx = Math.abs(hash) % WARM_AVATAR_HUES.length
  return WARM_AVATAR_HUES[idx]
}

/** One plain-text line from a markdown body, trimmed to `max` chars. */
export function excerpt(body: string, max = 140): string {
  const plain = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~`|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= max) return plain
  return `${plain.slice(0, max - 1).trimEnd()}…`
}

/** Deterministic slug for list keys that must match server render. */
export function wordCount(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean)
  return words.length
}
