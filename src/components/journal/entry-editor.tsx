'use client'

/**
 * The entry editor.
 *
 *  - Authors get the split view: serif writing pane on the left, typeset
 *    preview on the right (stacked behind a Write/Read switch on mobile).
 *  - Shared-notebook readers get the typeset reading view alone.
 *  - Meta is a quiet rail: title (borderless serif), mood glyphs, tags,
 *    and the per-entry sharing opt-out when the notebook is group-linked.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Check,
  CircleNotch,
  Code,
  CodeBlock,
  DownloadSimple,
  Eye,
  EyeSlash,
  LinkSimple,
  ListBullets,
  ListChecks,
  ListNumbers,
  Minus,
  Quotes,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextItalic,
  TextStrikethrough,
  TrashSimple,
} from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MarkdownView } from '@/components/markdown/markdown-view'
import { downloadTextFile, entryFilename, serializeEntry } from '@/lib/markdown'
import { mdToHtml, htmlToMd } from '@/lib/editor-html'
import { MOODS, MOOD_META, MoodGlyph } from '@/components/mood/glyphs'
import { useSession } from '@/lib/auth/session'
import { useCreateEntry, useDeleteEntry, useEntry, useNotebooks, useUpdateEntry } from '@/lib/api/hooks'
import { isUnconfigured } from '@/lib/api/client'
import { getDefaultMood } from '@/lib/prefs'
import { wordCount } from '@/lib/format'
import type { Mood } from '@/components/mood/glyphs'
import type { View } from './workspace'

type Mode =
  { compose: true; notebookId: string; fromGroup?: string } | { compose: false; entryId: string; fromGroup?: string }

// --------------------------------------------------------------- mood picker

function MoodPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Mood | null
  onChange: (m: Mood | null) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label="Mood" className="flex flex-wrap items-center gap-1.5">
      {MOODS.map((m) => {
        const active = value === m
        const meta = MOOD_META[m]
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            title={meta.note}
            disabled={disabled}
            onClick={() => onChange(active ? null : m)}
            className="press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-colors"
            style={active ? { background: meta.tint, color: meta.color } : { color: 'var(--ink-faint)' }}
          >
            <MoodGlyph mood={m} className="h-3.5 w-3.5" />
            <span className={active ? 'inline' : 'hidden sm:inline'}>{meta.label}</span>
          </button>
        )
      })}
      {value === null && <span className="ml-1 font-mono text-[10px] text-ink-faint">no mood set</span>}
    </div>
  )
}

// --------------------------------------------------------------- tags input

function TagsInput({
  tags,
  onChange,
  disabled = false,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  disabled?: boolean
}) {
  const [draft, setDraft] = useState('')

  const add = (raw: string) => {
    const t = raw.trim().replace(/^#/, '').toLowerCase()
    if (!t) return
    if (t.length > 40) return toast.error('Tags max out at 40 characters.')
    if (tags.length >= 20) return toast.error('Twenty tags is the ceiling.')
    if (!tags.includes(t)) onChange([...tags, t])
    setDraft('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full bg-paper-deep px-2.5 py-1 font-mono text-[10.5px] text-ink-soft"
        >
          #{t}
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(tags.filter((x) => x !== t))}
              aria-label={`Remove tag ${t}`}
              className="press text-ink-faint hover:text-ember"
            >
              ×
            </button>
          )}
        </span>
      ))}
      <input
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(draft)
          } else if (e.key === 'Backspace' && !draft && tags.length > 0) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={tags.length === 0 ? 'add tags — enter after each' : ''}
        aria-label="Add a tag"
        className="h-7 min-w-[10ch] flex-1 border-0 bg-transparent p-0 font-mono text-[11px] text-ink placeholder:text-ink-ghost focus:outline-none"
      />
    </div>
  )
}

// --------------------------------------------------------------- format bar

/**
 * WYSIWYG formatting toolbar — operates on the contenteditable selection
 * using execCommand for inline marks and block-level insertHTML for
 * headings/lists/quotes/code. The editor renders live; no markdown shown.
 */
interface EditorTools {
  exec: (command: string, value?: string) => void
  insertHtml: (html: string) => void
  insertHr: () => void
  insertLink: () => void
}

function editorTools(editorRef: React.RefObject<HTMLDivElement | null>, markDirty: () => void): EditorTools {
  const focus = () => {
    const el = editorRef.current
    if (!el) return
    el.focus()
  }

  const exec = (command: string, value?: string) => {
    focus()
    document.execCommand(command, false, value)
    markDirty()
  }

  const insertHtml = (html: string) => {
    focus()
    document.execCommand('insertHTML', false, html)
    markDirty()
  }

  const insertHr = () => {
    insertHtml('<hr><p><br></p>')
  }

  const insertLink = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) {
      const url = window.prompt('Link URL:', 'https://')
      if (!url) return
      insertHtml(`<a href="${url}">${url}</a>`)
      return
    }
    const url = window.prompt('Link URL:', 'https://')
    if (!url) return
    exec('createLink', url)
  }

  return { exec, insertHtml, insertHr, insertLink }
}

function FormatBar({ tools }: { tools: EditorTools }) {
  const { exec, insertHtml, insertHr, insertLink } = tools
  const buttons: Array<{
    label: string
    hint: string
    icon: React.ReactNode
    run: () => void
  }> = [
    { label: 'Bold', hint: 'Bold (⌘B)', icon: <TextB className="h-4 w-4" />, run: () => exec('bold') },
    { label: 'Italic', hint: 'Italic (⌘I)', icon: <TextItalic className="h-4 w-4" />, run: () => exec('italic') },
    {
      label: 'Strikethrough',
      hint: 'Strikethrough',
      icon: <TextStrikethrough className="h-4 w-4" />,
      run: () => exec('strikeThrough'),
    },
    {
      label: 'Heading 1',
      hint: 'Heading 1',
      icon: <TextHOne className="h-4 w-4" />,
      run: () => exec('formatBlock', 'h1'),
    },
    {
      label: 'Heading 2',
      hint: 'Heading 2',
      icon: <TextHTwo className="h-4 w-4" />,
      run: () => exec('formatBlock', 'h2'),
    },
    {
      label: 'Heading 3',
      hint: 'Heading 3',
      icon: <TextHThree className="h-4 w-4" />,
      run: () => exec('formatBlock', 'h3'),
    },
    {
      label: 'Quote',
      hint: 'Quote',
      icon: <Quotes className="h-4 w-4" />,
      run: () => exec('formatBlock', 'blockquote'),
    },
    {
      label: 'Code',
      hint: 'Inline code (⌘E)',
      icon: <Code className="h-4 w-4" />,
      run: () => insertHtml('<code>code</code>'),
    },
    {
      label: 'Code block',
      hint: 'Code block',
      icon: <CodeBlock className="h-4 w-4" />,
      run: () => insertHtml('<pre><code>code</code></pre><p><br></p>'),
    },
    { label: 'Link', hint: 'Link (⌘K)', icon: <LinkSimple className="h-4 w-4" />, run: insertLink },
    {
      label: 'Bulleted list',
      hint: 'Bulleted list',
      icon: <ListBullets className="h-4 w-4" />,
      run: () => exec('insertUnorderedList'),
    },
    {
      label: 'Numbered list',
      hint: 'Numbered list',
      icon: <ListNumbers className="h-4 w-4" />,
      run: () => exec('insertOrderedList'),
    },
    {
      label: 'Checklist',
      hint: 'Checklist',
      icon: <ListChecks className="h-4 w-4" />,
      run: () => insertHtml('<ul><li data-checked="false"><input type="checkbox" disabled>Task</li></ul><p><br></p>'),
    },
    { label: 'Divider', hint: 'Horizontal divider', icon: <Minus className="h-4 w-4" />, run: insertHr },
  ]

  return (
    <div
      role="toolbar"
      aria-label="Format text"
      className="flex flex-wrap items-center gap-0.5 border-b border-line pb-2.5"
    >
      {buttons.map((b) => (
        <button
          key={b.label}
          type="button"
          title={b.hint}
          aria-label={b.label}
          onClick={b.run}
          className="press rounded-md p-2 text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink"
        >
          {b.icon}
        </button>
      ))}
    </div>
  )
}

// --------------------------------------------------------------- editor

export function EntryEditor({ mode, onNavigate }: { mode: Mode; onNavigate: (v: View) => void }) {
  const { user } = useSession()
  const notebooks = useNotebooks()
  const entryQuery = useEntry(mode.compose ? null : mode.entryId)
  const entry = entryQuery.data ?? null

  const create = useCreateEntry()
  const update = useUpdateEntry()
  const remove = useDeleteEntry()

  // ---- form state
  const [title, setTitle] = useState('')
  const [mood, setMood] = useState<Mood | null>(() => (mode.compose ? getDefaultMood() : null))
  const [tags, setTags] = useState<string[]>([])
  const [isShared, setIsShared] = useState(true)
  const [hydrated, setHydrated] = useState(mode.compose)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const editorRef = useRef<HTMLDivElement | null>(null)

  // Get markdown from the contenteditable editor
  const getBody = useCallback((): string => {
    const el = editorRef.current
    if (!el) return ''
    return htmlToMd(el.innerHTML)
  }, [])

  // Set editor content from markdown (on load / hydrate)
  const setEditorContent = useCallback((md: string) => {
    const el = editorRef.current
    if (!el) return
    el.innerHTML = mdToHtml(md)
  }, [])

  // Hydrate the form once when the entry arrives.
  useEffect(() => {
    if (mode.compose || !entry || hydrated) return
    setTitle(entry.title)
    setMood(entry.mood)
    setTags(entry.tags)
    setIsShared(entry.is_shared)
    setHydrated(true)
    // Set editor content after mount
    requestAnimationFrame(() => setEditorContent(entry.body))
  }, [mode.compose, entry, hydrated, setEditorContent])

  const notebook = useMemo(() => {
    const id = mode.compose ? mode.notebookId : entry?.notebook_id
    return notebooks.data?.data.find((nb) => nb.id === id) ?? null
  }, [mode, entry, notebooks.data])

  const isAuthor = entry ? entry.author_id === user?.id : mode.compose
  const isOwner = notebook ? notebook.owner_id === user?.id : false
  const canEdit = isAuthor
  const groupLinked = Boolean(notebook?.group_id)

  const markDirty = useCallback(() => {
    setDirty(true)
    setSavedAt(null)
  }, [])

  const tools = editorTools(editorRef, markDirty)

  const exportEntry = useCallback(() => {
    if (!entry) return
    downloadTextFile(
      entryFilename(entry.title || 'untitled'),
      serializeEntry({ title: entry.title, body: entry.body, mood: entry.mood, tags: entry.tags }),
    )
    toast.success('Exported as markdown.')
  }, [entry])

  // ---- save
  const save = useCallback(async () => {
    const t = title.trim()
    if (!t) {
      toast.error('Give the entry a title — anything works.')
      editorRef.current?.blur()
      return
    }
    const body = getBody()
    setSaving(true)
    try {
      if (mode.compose) {
        const created = await create.mutateAsync({
          notebookId: mode.notebookId,
          title: t,
          body,
          mood: mood ?? undefined,
          tags,
          is_shared: groupLinked ? isShared : undefined,
        })
        setDirty(false)
        setSavedAt(Date.now())
        onNavigate({
          kind: 'entry',
          entryId: created.id,
          notebookId: created.notebook_id,
          fromGroup: mode.fromGroup,
        })
      } else if (entry) {
        await update.mutateAsync({
          id: entry.id,
          title: t,
          body,
          mood,
          tags,
          ...(groupLinked ? { is_shared: isShared } : {}),
        })
        setDirty(false)
        setSavedAt(Date.now())
      }
    } catch (err) {
      if (isUnconfigured(err)) toast.error("The data layer isn't connected on this deployment.")
      else toast.error(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }, [mode, entry, title, getBody, mood, tags, isShared, groupLinked, create, update, onNavigate])

  // ⌘S / Ctrl+S saves — a writing app should honor the writer's reflex.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (canEdit && !saving) save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canEdit, saving, save])

  const back = () => {
    if (mode.fromGroup) {
      onNavigate({ kind: 'group', groupId: mode.fromGroup, tab: 'journal' })
      return
    }
    const target = notebook ? { kind: 'notebook' as const, notebookId: notebook.id } : { kind: 'groups' as const }
    onNavigate(target)
  }

  const backLabel = mode.fromGroup ? 'group journal' : (notebook?.title ?? 'notebook')

  // --------------------------------------------------------------- loading

  if (!mode.compose && !entry) {
    if (entryQuery?.isError) {
      return (
        <div className="mx-4 lg:mx-0">
          <p className="text-[13.5px] text-ember">
            {entryQuery.error instanceof Error ? entryQuery.error.message : "Couldn't load the entry."}
          </p>
          <Button variant="outline" size="sm" className="press mt-4 h-9 border-line" onClick={back}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
          </Button>
        </div>
      )
    }
    return (
      <div className="mx-4 max-w-3xl space-y-5 lg:mx-0">
        <div className="skeleton-line h-10 w-2/3" />
        <div className="skeleton-line h-4 w-40" />
        <div className="skeleton-line h-4 w-52" />
        <div className="skeleton-line mt-8 h-3 w-full" />
        <div className="skeleton-line h-3 w-full" />
        <div className="skeleton-line h-3 w-11/12" />
        <div className="skeleton-line h-3 w-4/5" />
      </div>
    )
  }

  // --------------------------------------------------------------- reading mode

  if (!canEdit && entry) {
    return (
      <article className="mx-4 max-w-[70ch] lg:mx-0">
        <button
          type="button"
          onClick={back}
          className="press -ml-1 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> back to {backLabel}
        </button>

        <header className="mt-6 border-b border-line pb-6">
          <p className="font-mono text-[10.5px] text-ink-faint">{entry.created_at.slice(0, 10)} · shared entry</p>
          <h1 className="font-display mt-2 text-3xl leading-tight tracking-tight text-ink">{entry.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {entry.mood && (
              <span
                style={{ color: `var(--mood-${entry.mood})` }}
                className="inline-flex items-center gap-1.5 text-[11.5px]"
              >
                <MoodGlyph mood={entry.mood} className="h-4 w-4" /> {MOOD_META[entry.mood].label}
              </span>
            )}
            {entry.tags.map((t) => (
              <span key={t} className="font-mono text-[10.5px] text-ink-faint">
                #{t}
              </span>
            ))}
          </div>
        </header>

        <div className="measure py-8">
          <MarkdownView className="text-[16.5px]">{entry.body}</MarkdownView>
        </div>
      </article>
    )
  }

  // --------------------------------------------------------------- edit / compose

  const savedLabel = savedAt ? 'Saved' : dirty ? 'Unsaved changes' : 'Up to date'

  return (
    <div className="mx-4 lg:mx-0">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={back}
          className="press -ml-1 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> back to {backLabel}
        </button>

        <span className="ml-auto flex items-center gap-2.5">
          <span className="hidden items-center gap-1.5 font-mono text-[10.5px] text-ink-faint sm:flex">
            {saving ? (
              <>
                <CircleNotch weight="bold" className="h-3 w-3 animate-spin text-clay" /> saving…
              </>
            ) : (
              <>
                {dirty ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-clay" />
                ) : (
                  <Check weight="bold" className="h-3 w-3 text-sage" />
                )}
                {savedLabel}
              </>
            )}
            <span aria-hidden>·</span>
            <span className="hidden md:inline">⌘S saves</span>
          </span>

          {!mode.compose && entry && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="press h-9 w-9 border-line bg-paper-raised"
                aria-label="Export entry as markdown"
                title="Export as .md"
                onClick={exportEntry}
              >
                <DownloadSimple weight="regular" className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="press h-9 w-9 border-line bg-paper-raised text-ember"
                aria-label="Delete entry"
                onClick={() => setDeleteOpen(true)}
              >
                <TrashSimple weight="regular" className="h-4 w-4" />
              </Button>
            </>
          )}

          <Button size="sm" className="press h-9 gap-1.5 shadow-ink" onClick={save} disabled={saving}>
            {saving ? (
              <>
                <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Check weight="bold" className="h-3.5 w-3.5" /> {mode.compose ? 'Save entry' : 'Save'}
              </>
            )}
          </Button>
        </span>
      </div>

      {/* meta rail */}
      <div className="mt-5 space-y-3.5 border-b border-line pb-5">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            markDirty()
          }}
          placeholder="Untitled entry"
          aria-label="Entry title"
          maxLength={200}
          className="w-full border-0 bg-transparent p-0 font-display text-3xl leading-tight tracking-tight text-ink placeholder:text-ink-ghost/70 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
          <MoodPicker
            value={mood}
            onChange={(m) => {
              setMood(m)
              markDirty()
            }}
          />
          <div className="min-w-[16ch] flex-1">
            <TagsInput
              tags={tags}
              onChange={(t) => {
                setTags(t)
                markDirty()
              }}
            />
          </div>
        </div>
        {groupLinked && (
          <button
            type="button"
            onClick={() => {
              setIsShared(!isShared)
              markDirty()
            }}
            aria-pressed={isShared}
            className={`press inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[10.5px] transition-colors ${
              isShared ? 'bg-clay-tint text-clay-ink' : 'bg-paper-sink text-ink-soft'
            }`}
            title={
              isShared
                ? 'Members of the linked group see this entry'
                : 'This entry stays private even inside the shared notebook'
            }
          >
            {isShared ? (
              <>
                <Eye weight="light" className="h-3.5 w-3.5" /> shared with the group
              </>
            ) : (
              <>
                <EyeSlash weight="fill" className="h-3.5 w-3.5" /> kept private from the group
              </>
            )}
          </button>
        )}
      </div>

      {/* WYSIWYG editor — live rendered, no markdown visible */}
      <div className="mt-5">
        <FormatBar tools={tools} />
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={markDirty}
          onKeyDown={(e) => {
            if (!(e.metaKey || e.ctrlKey)) return
            const k = e.key.toLowerCase()
            if (k === 'b') {
              e.preventDefault()
              tools.exec('bold')
            } else if (k === 'i') {
              e.preventDefault()
              tools.exec('italic')
            } else if (k === 'k') {
              e.preventDefault()
              tools.insertLink()
            } else if (k === 'e') {
              e.preventDefault()
              tools.exec('formatBlock', 'blockquote')
            }
          }}
          role="textbox"
          aria-multiline="true"
          aria-label="Entry body — rich text"
          data-placeholder="The bread, the weather, the argument, the walk — start anywhere. Formatting renders live."
          className="editor-content min-h-[55dvh] w-full border-0 bg-transparent p-0 font-serif text-[16px] leading-[1.85] text-ink focus:outline-none lg:min-h-[60dvh]"
        />
      </div>

      {/* delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="border-line bg-paper-raised">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-lg text-ink">Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] leading-relaxed text-ink-soft">
              &ldquo;{title.trim() || 'Untitled entry'}&rdquo; goes away for good — from your notebook and from any
              group it&apos;s shared with. No undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="press h-9">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="press h-9 bg-ember text-white hover:bg-ember/90"
              onClick={async () => {
                if (!entry) return
                try {
                  await remove.mutateAsync(entry.id)
                  toast.success('Entry deleted.')
                  back()
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Delete failed.')
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
