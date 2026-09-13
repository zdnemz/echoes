import type { Mood } from '@/components/mood/glyphs'

/**
 * Local-only preferences (localStorage, no backend).
 * Read lazily and only on the client, so first paint never depends on them.
 */

const DEFAULT_MOOD_KEY = 'echoes.prefs.default-mood'

const MOODS: ReadonlyArray<Mood> = ['great', 'good', 'okay', 'low', 'rough']

/** The mood pre-selected when composing a new entry (null = none). */
export function getDefaultMood(): Mood | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(DEFAULT_MOOD_KEY)
  return (MOODS as ReadonlyArray<string>).includes(raw ?? '') ? (raw as Mood) : null
}

export function setDefaultMood(mood: Mood | null): void {
  if (typeof window === 'undefined') return
  if (mood === null) window.localStorage.removeItem(DEFAULT_MOOD_KEY)
  else window.localStorage.setItem(DEFAULT_MOOD_KEY, mood)
}
