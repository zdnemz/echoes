'use client'

/**
 * The entry editor.
 *
 *  - Authors get a WYSIWYG page: headings render big, bold renders bold —
 *    what you type is what the page looks like. No raw markdown, no preview
 *    pane; the document stays markdown underneath.
 *  - Shared-notebook readers get the typeset reading view alone.
 *  - Meta is a quiet rail: title (borderless serif), mood glyphs, tags,
 *    and the per-entry sharing opt-out when the notebook is group-linked.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import {
  ArrowLeft,
  Check,
  CircleNotch,
  DownloadSimple,
  Eye,
  EyeSlash,
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
import { MOODS, MOOD_META, MoodGlyph } from '@/components/mood/glyphs'
import { useSession } from '@/lib/auth/session'
import { useCreateEntry, useDeleteEntry, useEntry, useNotebooks, useUpdateEntry } from '@/lib/api/hooks'
import { isUnconfigured } from '@/lib/api/client'
import { sealForStorage, openFromStorage, rewrapForSharing, type KeyWrapInput } from '@/lib/crypto/entry-codec'
import { whenReady } from '@/lib/crypto/vault'
import { useRovingSelection } from '@/hooks/use-roving-selection'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { getDefaultMood } from '@/lib/prefs'
import { wordCount } from '@/lib/format'
import type { Mood } from '@/components/mood/glyphs'
import type { View } from './workspace'

// Client-only: MDXEditor touches `document` at import time, so it must
// never evaluate during SSR.
const RichEditor = dynamic(() => import('./md-editor-inner').then((m) => m.RichEditor), {
  ssr: false,
  loading: () => (
    <div className="space-y-2.5 pt-8" aria-label="Loading editor">
      <div className="skeleton-line h-3 w-full" />
      <div className="skeleton-line h-3 w-full" />
      <div className="skeleton-line h-3 w-11/12" />
    </div>
  ),
})

type Mode =
  { compose: true; notebookId: string; fromGroup?: string } | { compose: false; entryId: string; fromGroup?: string }

// --------------------------------------------------------------- mood picker

// Index 0 is the explicit "no mood" choice: a radiogroup must always have a
// checked member, and it keeps this picker consistent with the one in settings.
const MOOD_OPTIONS: Array<Mood | null> = [null, ...MOODS]

function MoodPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Mood | null
  onChange: (m: Mood | null) => void
  disabled?: boolean
}) {
  const group = useRovingSelection({ values: MOOD_OPTIONS, selected: value, onSelect: onChange, disabled })

  return (
    <div
      role="radiogroup"
      aria-label="Mood"
      onKeyDown={group.onKeyDown}
      className="flex flex-wrap items-center gap-1.5"
    >
      {MOOD_OPTIONS.map((m, i) => {
        const active = value === m
        const meta = m ? MOOD_META[m] : null
        return (
          <button
            key={m ?? 'none'}
            ref={group.registerItem(m)}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={m ? meta!.label : 'No mood'}
            title={m ? meta!.note : 'No mood'}
            tabIndex={group.tabIndexFor(m)}
            disabled={disabled}
            onClick={() => onChange(m)}
            className={`press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              active && !m ? 'text-ink-soft' : ''
            }`}
            style={active && meta ? { background: meta.tint, color: meta.color } : { color: 'var(--ink-faint)' }}
          >
            {m ? <MoodGlyph mood={m} className="h-3.5 w-3.5" /> : null}
            {/* Always reserve an accessible name; the label may be visually hidden. */}
            <span className={active || !m ? 'inline' : 'hidden sm:inline'}>{m ? meta!.label : 'none'}</span>
          </button>
        )
      })}
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
  const [body, setBody] = useState('')
  const [mood, setMood] = useState<Mood | null>(() => (mode.compose ? getDefaultMood() : null))
  const [tags, setTags] = useState<string[]>([])
  const [isShared, setIsShared] = useState(true)
  const [hydrated, setHydrated] = useState(mode.compose)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [sealedError, setSealedError] = useState(false)

  // The entry's notebook group — used for both hydration and save-time
  // sealing; derived from the notebooks cache so it exists before `notebook`.
  const entryGroupId = useMemo(() => {
    const id = mode.compose ? mode.notebookId : entry?.notebook_id
    return notebooks.data?.data.find((nb) => nb.id === id)?.group_id ?? null
  }, [mode, entry, notebooks.data])

  // Ownership consts must precede the reading effect (it reads canEdit).
  const isAuthor = entry ? entry.author_id === user?.id : mode.compose
  const canEdit = isAuthor

  // Sealed shared-entry reading state — resolved at the top level so hooks
  // stay unconditional (the reading branch below just consumes it).
  const [reading, setReading] = useState<{ title: string; body: string } | null>(null)
  useEffect(() => {
    if (!entry || canEdit || !entry.encrypted) return
    let alive = true
    // Keys are generated on first load, so decryption must WAIT for them —
    // reading before they exist would permanently show "written elsewhere"
    // for an entry this device can in fact open.
    void whenReady()
      .then(() => (alive ? openFromStorage(entry, user?.id ?? '', entryGroupId) : null))
      .then((r) => alive && setReading(r))
      .catch(() => alive && setReading(null))
    return () => {
      alive = false
    }
  }, [entry, canEdit, entryGroupId, user])

  // Hydrate the form once when the entry arrives.
  useEffect(() => {
    if (mode.compose || !entry || hydrated) return
    // Encrypted entries open with the vault before the form fills — this is
    // the one async hop in hydration; failures keep the entry readable-only.
    if (entry.encrypted) {
      void whenReady()
        .then(() => openFromStorage(entry, user?.id ?? '', entryGroupId))
        .then(({ title: t, body: b }) => {
          setTitle(t)
          setBody(b)
          setMood(entry.mood)
          setTags(entry.tags)
          setIsShared(entry.is_shared)
          setHydrated(true)
        })
        .catch(() => {
          // Genuinely unopenable here: written on another device, or the
          // group key hasn't reached this device yet. Never save over it.
          setTitle('')
          setBody('')
          setSealedError(true)
        })
      return
    }
    setTitle(entry.title)
    setBody(entry.body)
    setMood(entry.mood)
    setTags(entry.tags)
    setIsShared(entry.is_shared)
    setHydrated(true)
  }, [mode.compose, entry, hydrated, entryGroupId, user])

  const notebook = useMemo(() => {
    const id = mode.compose ? mode.notebookId : entry?.notebook_id
    return notebooks.data?.data.find((nb) => nb.id === id) ?? null
  }, [mode, entry, notebooks.data])

  const isOwner = notebook ? notebook.owner_id === user?.id : false
  const groupLinked = Boolean(notebook?.group_id)

  const markDirty = useCallback(() => {
    setDirty(true)
    setSavedAt(null)
  }, [])

  const exportEntry = useCallback(() => {
    if (!entry) return
    // Sealed entries export the opened plaintext form (hydrated above);
    // a locked vault falls back to a filename-only export.
    const t = entry.encrypted ? title || 'untitled' : entry.title || 'untitled'
    const b = entry.encrypted ? body : entry.body
    downloadTextFile(entryFilename(t), serializeEntry({ title: t, body: b, mood: entry.mood, tags: entry.tags }))
    toast.success('Exported as markdown.')
  }, [entry, title, body])

  // ---- save
  const save = useCallback(async () => {
    const t = title.trim()
    if (!t) {
      toast.error('Give the entry a title — anything works.')
      return
    }
    setSaving(true)
    try {
      // Every save is sealed on this device before it leaves the browser.
      // Keys are generated on first load, so wait for them rather than
      // falling through to a plaintext write.
      await whenReady()
      // Shared save with no group key yet: distribute it now (covers a
      // link-time distribution that ran before this device registered).
      // Still nothing afterwards → save for me alone; the group catches up
      // on its own the next time any key-holding device is around.
      const wantsGroupShare = groupLinked ? isShared : false
      if (entryGroupId && wantsGroupShare && !sealedError) {
        const { ensureShareableCek } = await import('@/lib/crypto/vault')
        await ensureShareableCek(entryGroupId, user?.id ?? '').catch(() => null)
      }
      const sealed = sealedError ? null : await sealForStorage(t, body, entryGroupId, wantsGroupShare)
      const authorOnly = sealed?.shareState === 'author-only'
      if (authorOnly) {
        toast("Saved — it'll appear for the group as soon as everyone's connected.")
      }
      if (mode.compose) {
        const created = await create.mutateAsync({
          notebookId: mode.notebookId,
          title: sealed ? sealed.title : t,
          body: sealed ? sealed.body : body,
          mood: mood ?? undefined,
          tags,
          is_shared: groupLinked ? isShared : undefined,
          ...(sealed ? { encrypted: true, key_wraps: sealed.key_wraps } : {}),
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
        // Toggling sharing re-wraps the content key when encrypted.
        let keyWraps: KeyWrapInput[] | undefined
        if (sealed) {
          keyWraps = sealed.key_wraps
        } else if (entry.encrypted) {
          // Same missing-CEK case, reached when the vault is locked: keep the
          // author wrap rather than losing the edit to a throw.
          keyWraps = await rewrapForSharing(entry, user?.id ?? '', entryGroupId, groupLinked ? isShared : false).catch(
            () => undefined,
          )
        }
        await update.mutateAsync({
          id: entry.id,
          title: sealed ? sealed.title : t,
          body: sealed ? sealed.body : body,
          mood,
          tags,
          ...(groupLinked ? { is_shared: isShared } : {}),
          ...(sealed ? { encrypted: true, key_wraps: keyWraps } : {}),
          ...(keyWraps && !sealed ? { key_wraps: keyWraps } : {}),
        })
        setDirty(false)
        setSavedAt(Date.now())
      }
    } catch (err) {
      if (isUnconfigured(err)) {
        toast.error("The data layer isn't connected on this deployment.")
      } else if (err instanceof Error && /prepare this device|connection/i.test(err.message)) {
        // Key setup needs the network once per device — say that plainly.
        toast.error("Couldn't reach the server — your words are still here, try saving again.")
      } else {
        toast.error('Save failed — your words are still here, try again.')
      }
    } finally {
      setSaving(false)
    }
  }, [
    mode,
    entry,
    title,
    body,
    mood,
    tags,
    isShared,
    groupLinked,
    entryGroupId,
    create,
    update,
    onNavigate,
    sealedError,
    user,
  ])

  // Autosave with the shared bouncer: the form stays instant, the save only
  // sees settled values. Edit mode only — in compose a pause would create
  // the entry and navigate away mid-thought. `draft !== settled` (by
  // reference) means the writer is still typing; the hook hands back the
  // same reference once it settles, which is the save signal.
  const draft = useMemo(() => ({ title, body, mood, tags, isShared }), [title, body, mood, tags, isShared])
  const settled = useDebouncedValue(draft, 1500)

  useEffect(() => {
    if (mode.compose || !entry || !hydrated || !dirty || !canEdit || saving) return
    if (draft !== settled) return
    // A blank title is a manual-save conversation (it toasts), not a
    // silent-save one — skip without noise.
    if (!settled.title.trim()) return
    save()
  }, [mode.compose, entry, hydrated, dirty, canEdit, saving, draft, settled, save])

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

  // Closing the tab / reloading with unsaved edits: let the browser ask first.
  useEffect(() => {
    if (!dirty || saving) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Legacy signal — some browsers still require a non-empty returnValue.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty, saving])

  const back = () => {
    // Leaving with unsaved edits used to discard them silently while the
    // footer still read "Unsaved changes" until the component unmounted.
    if (dirty && !saving) {
      const ok = window.confirm('This entry has unsaved changes. Leave without saving?')
      if (!ok) return
    }
    if (mode.fromGroup) {
      onNavigate({ kind: 'group', groupId: mode.fromGroup })
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
    if (entry.encrypted && !reading) {
      return (
        <div className="mx-4 max-w-[70ch] lg:mx-0">
          <button
            type="button"
            onClick={back}
            className="press -ml-1 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> back to {backLabel}
          </button>
          <p className="mt-16 text-center text-[13px] text-ink-faint">
            {reading === null && entry.encrypted
              ? 'This entry was written on another device — open it there to read it.'
              : 'Opening…'}
          </p>
        </div>
      )
    }
    const displayTitle = entry.encrypted ? (reading?.title ?? 'Entry from another device') : entry.title
    const displayBody = entry.encrypted ? (reading?.body ?? '') : entry.body
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
          <h1 className="font-display mt-2 text-3xl leading-tight tracking-tight text-ink">{displayTitle}</h1>
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
            {entry.readers && entry.readers.length > 0 && (
              <span
                className="ml-auto font-mono text-[10.5px] text-ink-faint"
                title={`Dilihat oleh: ${entry.readers.map((r) => r.display_name || 'Someone').join(', ')}`}
              >
                <Eye weight="light" className="mr-1 inline h-3.5 w-3.5" />
                dilihat oleh {entry.readers.map((r) => r.display_name || 'Someone').join(', ')}
              </span>
            )}
          </div>
        </header>

        <div className="measure py-8">
          <MarkdownView className="text-[16.5px]">{displayBody}</MarkdownView>
        </div>
      </article>
    )
  }

  // --------------------------------------------------------------- edit / compose

  const words = wordCount(body)
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
            {words} {words === 1 ? 'word' : 'words'}
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

          <Button
            size="sm"
            className="press h-9 gap-1.5 shadow-ink"
            onClick={save}
            // Not before the entry has hydrated: the form fields still hold
            // their empty defaults, and saving would blank the entry's mood.
            disabled={saving || (!mode.compose && !hydrated)}
          >
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
        {entry?.readers && entry.readers.length > 0 && (
          <p
            className="font-mono text-[10.5px] text-ink-faint"
            title={`Dilihat oleh: ${entry.readers.map((r) => r.display_name || 'Someone').join(', ')}`}
          >
            <Eye weight="light" className="mr-1 inline h-3.5 w-3.5" />
            dilihat oleh {entry.readers.map((r) => r.display_name || 'Someone').join(', ')}
          </p>
        )}
      </div>

      {/* rich body — headings render big, bold renders bold; the document
          stays markdown underneath, so save/autosave/export are untouched */}
      <div className="mt-2 lg:mt-5">
        <RichEditor
          markdown={body}
          onChange={(md, initialNormalize) => {
            setBody(md)
            // Import-time normalization (bullet flavor, stray whitespace)
            // changes bytes, not words — sync it silently so merely
            // opening an entry never flags "Unsaved changes" by itself.
            if (!initialNormalize) markDirty()
          }}
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
