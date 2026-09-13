import { MOODS, type Mood } from '@/components/mood/glyphs'

/**
 * Markdown file interchange — entries serialize to `.md` with a small
 * frontmatter block and parse back from it. The same shape drives both
 * single-entry export and whole-notebook export/import.
 *
 *   ---
 *   title: A slow morning
 *   date: 2026-09-12T08:30:00.000Z
 *   mood: good
 *   tags: [morning, gratitude]
 *   ---
 *
 *   body…
 */

export interface EntryFile {
  title: string
  body: string
  mood: Mood | null
  tags: string[]
  date: string | null
}

const MOOD_SET = new Set<string>(MOODS)

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || 'untitled'
}

export function entryFilename(title: string): string {
  return `${slugify(title)}.md`
}

export function serializeEntry(e: { title: string; body: string; mood: Mood | null; tags: string[] }): string {
  const lines = ['---', `title: ${e.title.replace(/\n/g, ' ')}`]
  if (e.mood) lines.push(`mood: ${e.mood}`)
  if (e.tags.length > 0) lines.push(`tags: [${e.tags.join(', ')}]`)
  lines.push('---', '', e.body.replace(/\s+$/, ''), '')
  return lines.join('\n')
}

/** Parse one file. Never throws — unparseable input becomes a titled body. */
export function parseEntryFile(filename: string, text: string): EntryFile {
  const fallbackTitle = filename.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim() || 'Untitled entry'
  const match = text.replace(/^\uFEFF/, '').match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)

  let title = fallbackTitle
  let mood: Mood | null = null
  let tags: string[] = []
  let date: string | null = null
  let body = text.trim()

  if (match) {
    for (const line of match[1].split('\n')) {
      const sep = line.indexOf(':')
      if (sep < 0) continue
      const key = line.slice(0, sep).trim().toLowerCase()
      const value = line.slice(sep + 1).trim()
      if (key === 'title' && value) title = value.slice(0, 200)
      else if (key === 'mood' && MOOD_SET.has(value)) mood = value as Mood
      else if (key === 'tags') {
        tags = value
          .replace(/^\[|\]$/g, '')
          .split(',')
          .map((t) => t.trim().replace(/^#/, '').toLowerCase())
          .filter((t) => t.length > 0 && t.length <= 40)
          .slice(0, 20)
      } else if (key === 'date' && value && !Number.isNaN(Date.parse(value))) {
        date = value
      }
    }
    body = match[2].trim()
  }

  // No frontmatter title? Promote the first heading.
  if (title === fallbackTitle) {
    const heading = body.match(/^#{1,3}\s+(.+)$/m)
    if (heading) {
      title = heading[1].trim().slice(0, 200)
      body = body.replace(/^#{1,3}\s+.+$/m, '').trim()
    }
  }

  return { title, body, mood, tags, date }
}

export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
