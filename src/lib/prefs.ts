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

const GROUP_LAYOUT_KEY = 'echoes.prefs.group-layout'

export type GroupLayout = 'list' | 'chat'

/** How the group journal tab renders entries. Defaults to the editorial list. */
export function getGroupLayout(): GroupLayout {
  if (typeof window === 'undefined') return 'list'
  const raw = window.localStorage.getItem(GROUP_LAYOUT_KEY)
  return raw === 'chat' ? 'chat' : 'list'
}

export function setGroupLayout(layout: GroupLayout): void {
  if (typeof window === 'undefined') return
  if (layout === 'list') window.localStorage.removeItem(GROUP_LAYOUT_KEY)
  else window.localStorage.setItem(GROUP_LAYOUT_KEY, layout)
}

const AUTOLOCK_KEY = 'echoes.prefs.autolock'

/** Re-lock the journal whenever this tab is hidden (app-lock must be set up). */
export function getAutoLock(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(AUTOLOCK_KEY) === '1'
}

export function setAutoLock(on: boolean): void {
  if (typeof window === 'undefined') return
  if (on) window.localStorage.setItem(AUTOLOCK_KEY, '1')
  else window.localStorage.removeItem(AUTOLOCK_KEY)
}
