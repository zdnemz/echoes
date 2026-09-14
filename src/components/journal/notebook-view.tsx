'use client'

/**
 * The notebook view — header with sharing, mood filter, and the
 * hairline entry list. Owner controls live in a quiet dropdown (rename,
 * sharing, delete).
 */

import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  CaretDown,
  CircleNotch,
  DotsThree,
  DownloadSimple,
  LinkSimple,
  Lock,
  PenNib,
  TrashSimple,
  UploadSimple,
} from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MOODS, MOOD_META, MoodGlyph } from '@/components/mood/glyphs'
import { EntryRow, EntryRowSkeleton } from './entry-row'
import { QueryError } from '@/components/query-error'
import { useSession } from '@/lib/auth/session'
import {
  useCreateEntry,
  useDeleteNotebook,
  useEntries,
  useGroups,
  useNotebooks,
  useUpdateNotebook,
} from '@/lib/api/hooks'
import { listEntries } from '@/lib/api/endpoints'
import { downloadTextFile, entryFilename, parseEntryFile } from '@/lib/markdown'
import { isUnconfigured } from '@/lib/api/client'
import type { Mood } from '@/components/mood/glyphs'
import type { Notebook } from '@/lib/api/types'
import { listMembers } from '@/lib/api/endpoints'
import type { View } from './workspace'

// --------------------------------------------------------------- dialogs

function RenameDialog({ notebook, onClose }: { notebook: Notebook; onClose: () => void }) {
  const update = useUpdateNotebook()
  const [title, setTitle] = useState(notebook.title)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t || t === notebook.title) return onClose()
    try {
      await update.mutateAsync({ id: notebook.id, title: t })
      toast.success('Renamed.')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rename failed.')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm border-line bg-paper-raised">
        <DialogHeader>
          <DialogTitle className="font-display text-lg text-ink">Rename notebook</DialogTitle>
          {/* Radix warns (and screen readers get a dangling reference)
              when a dialog has no description. */}
          <DialogDescription className="sr-only">
            Change this notebook&apos;s title. It is just a label — entries are untouched.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="rename-title" className="text-[12.5px]">
              Name
            </Label>
            <Input
              id="rename-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className="h-10 bg-paper"
            />
          </div>
          <DialogFooter className="mt-1 gap-2">
            <Button type="button" variant="ghost" onClick={onClose} className="press h-9">
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending} className="press h-9 shadow-ink">
              {update.isPending ? 'Saving…' : 'Rename'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ShareDialog({ notebook, onClose }: { notebook: Notebook; onClose: () => void }) {
  const groups = useGroups()
  const update = useUpdateNotebook()
  const [selected, setSelected] = useState<string | null>(notebook.group_id)

  const mine = groups.data ?? []

  const apply = async (groupId: string | null) => {
    try {
      await update.mutateAsync({ id: notebook.id, group_id: groupId })
      setSelected(groupId)
      if (groupId === null) toast.success('Private again — for everyone, immediately.')
      else toast.success('Linked. Members see new entries the moment you save them.')
      onClose()
    } catch (err) {
      if (isUnconfigured(err)) toast.error("The data layer isn't connected on this deployment.")
      else toast.error(err instanceof Error ? err.message : "Couldn't change sharing.")
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md border-line bg-paper-raised">
        <DialogHeader>
          <DialogTitle className="font-display text-lg text-ink">Share “{notebook.title}”</DialogTitle>
          <DialogDescription className="text-[12.5px] leading-relaxed text-ink-soft">
            One notebook, one group. Entries stay shared until you opt individual ones out — or unlink the notebook
            entirely.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
          <button
            type="button"
            onClick={() => apply(null)}
            className={`press flex w-full items-center gap-3 px-4 py-3 text-left text-[13.5px] transition-colors ${
              selected === null ? 'bg-paper-deep' : 'hover:bg-paper-deep/50'
            }`}
          >
            <Lock weight="regular" className="h-4 w-4 shrink-0 text-ink-faint" />
            <span className="flex-1 text-ink">Keep it private</span>
            {selected === null && <span className="font-mono text-[10px] text-clay">current</span>}
          </button>
          {mine.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => apply(g.id)}
              className={`press flex w-full items-center gap-3 px-4 py-3 text-left text-[13.5px] transition-colors ${
                selected === g.id ? 'bg-paper-deep' : 'hover:bg-paper-deep/50'
              }`}
            >
              <LinkSimple weight="regular" className="h-4 w-4 shrink-0 text-clay" />
              <span className="flex-1 text-ink">{g.name}</span>
              <span className="font-mono text-[10px] text-ink-faint">×{g.member_count}</span>
              {selected === g.id && <span className="font-mono text-[10px] text-clay">current</span>}
            </button>
          ))}
          {mine.length === 0 && (
            <p className="px-4 py-3 text-[12.5px] leading-relaxed text-ink-faint">
              You don&apos;t belong to any groups yet — create one in the rail&apos;s Groups section first.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// --------------------------------------------------------------- main view

export function NotebookView({ notebookId, onNavigate }: { notebookId: string; onNavigate: (v: View) => void }) {
  const { user } = useSession()
  const notebooks = useNotebooks()
  const groups = useGroups()
  const [mood, setMood] = useState<Mood | undefined>(undefined)
  const [renameOpen, setRenameOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // ---- markdown interchange: whole-notebook export, single-file import
  const remove = useDeleteNotebook()
  const update = useUpdateNotebook()
  const createEntry = useCreateEntry()
  const qc = useQueryClient()
  const [busyIo, setBusyIo] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const exportNotebook = async () => {
    if (!notebook || busyIo) return
    setBusyIo(true)
    try {
      const all: Array<{
        title: string
        body: string
        mood: Mood | null
        tags: string[]
        created_at: string
      }> = []
      let page = 1
      for (;;) {
        const res = await listEntries(notebook.id, { page, limit: 100 })
        all.push(...res.data)
        if (all.length >= res.pagination.total || res.data.length === 0) break
        page += 1
      }
      const doc = [
        `# ${notebook.title}`,
        '',
        `Exported ${new Date().toISOString().slice(0, 10)} · ${all.length} ${all.length === 1 ? 'entry' : 'entries'}`,
        '',
        ...all.flatMap((e) => [
          `## ${e.title || 'Untitled entry'}`,
          `*${e.created_at.slice(0, 10)}${e.mood ? ` · ${e.mood}` : ''}${e.tags.length > 0 ? ` · ${e.tags.map((t) => `#${t}`).join(' ')}` : ''}*`,
          '',
          e.body.trim(),
          '',
        ]),
      ].join('\n')
      downloadTextFile(entryFilename(notebook.title), doc)
      toast.success(`Exported ${all.length} ${all.length === 1 ? 'entry' : 'entries'}.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setBusyIo(false)
    }
  }

  const importFile = async (file: File) => {
    if (!notebook || busyIo) return
    setBusyIo(true)
    try {
      const parsed = parseEntryFile(file.name, await file.text())
      if (!parsed.body.trim()) {
        toast.error('Nothing to import — the file has no body text.')
        return
      }
      await createEntry.mutateAsync({
        notebookId: notebook.id,
        title: parsed.title,
        body: parsed.body,
        mood: parsed.mood ?? undefined,
        tags: parsed.tags,
      })
      await qc.invalidateQueries({ queryKey: ['entries', notebook.id] })
      toast.success(`Imported “${parsed.title}”.`)
    } catch (err) {
      if (isUnconfigured(err)) toast.error("The data layer isn't connected on this deployment.")
      else toast.error(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setBusyIo(false)
    }
  }

  const notebook = useMemo(
    () => notebooks.data?.data.find((nb) => nb.id === notebookId) ?? null,
    [notebooks.data, notebookId],
  )

  const entries = useEntries(notebookId, mood)
  const list = useMemo(() => entries.data?.pages.flatMap((p) => p.data) ?? [], [entries.data])

  const isOwner = notebook ? notebook.owner_id === user?.id : false
  const groupName = notebook?.group_id ? (groups.data?.find((g) => g.id === notebook.group_id)?.name ?? null) : null

  // Resolve author names for shared notebooks via group members.
  const groupDetail = useGroupMembers(notebook?.group_id ?? null)
  const authorName = (authorId: string) => {
    if (authorId === user?.id) return null
    const m = groupDetail?.find((mm) => mm.user_id === authorId)
    return m?.display_name ?? 'a member'
  }

  if (!notebook) {
    return (
      <div className="mx-4 lg:mx-0">
        <div className="skeleton-line h-8 w-52" />
        <div className="skeleton-line mt-4 h-4 w-32" />
        <div className="mt-6 divide-y divide-line border-y border-line">
          <EntryRowSkeleton />
          <EntryRowSkeleton />
          <EntryRowSkeleton />
        </div>
      </div>
    )
  }

  const total = entries.data?.pages[0]?.pagination.total ?? 0
  const hasMore = entries.hasNextPage

  return (
    <div className="mx-4 lg:mx-0">
      {/* ------------------------------------------------ header */}
      <header>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl leading-tight tracking-tight text-ink">{notebook.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {groupName ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-clay-tint px-2.5 py-0.5 font-mono text-[10px] text-clay-ink">
                  <LinkSimple weight="bold" className="h-2.5 w-2.5" />
                  shared with {groupName}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                  <Lock weight="fill" className="h-3 w-3" /> private
                </span>
              )}
              <span className="font-mono text-[10.5px] text-ink-faint">
                {total} {total === 1 ? 'entry' : 'entries'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="icon"
              className="press h-9 w-9 border-line bg-paper-raised"
              aria-label="Export notebook as markdown"
              title="Export as .md"
              onClick={exportNotebook}
              disabled={busyIo}
            >
              {busyIo ? (
                <CircleNotch weight="bold" className="h-4 w-4 animate-spin" />
              ) : (
                <DownloadSimple weight="regular" className="h-4 w-4" />
              )}
            </Button>
            {isOwner && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  className="press h-9 w-9 border-line bg-paper-raised"
                  aria-label="Import a markdown file"
                  title="Import .md"
                  onClick={() => fileRef.current?.click()}
                  disabled={busyIo}
                >
                  <UploadSimple weight="regular" className="h-4 w-4" />
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".md,.markdown,text/markdown"
                  className="hidden"
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) void importFile(f)
                  }}
                />
              </>
            )}

            {isOwner && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="press h-9 w-9 border-line bg-paper-raised"
                    aria-label="Notebook actions"
                  >
                    <DotsThree weight="bold" className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="border-line bg-paper-raised">
                  <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                    Notebook
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => setRenameOpen(true)} className="gap-2 text-[13px]">
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShareOpen(true)} className="gap-2 text-[13px]">
                    Sharing… {groupName ? `· ${groupName}` : '· private'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-line" />
                  <DropdownMenuItem
                    onClick={() => setDeleteOpen(true)}
                    className="gap-2 text-[13px] text-ember focus:text-ember"
                  >
                    <TrashSimple weight="regular" className="h-3.5 w-3.5" /> Delete notebook
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {isOwner && (
              <Button
                size="sm"
                className="press h-9 gap-1.5 shadow-ink"
                onClick={() => onNavigate({ kind: 'compose', notebookId: notebook.id })}
              >
                <PenNib weight="bold" className="h-3.5 w-3.5" /> New entry
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ------------------------------------------------ mood filter */}
      <div className="mt-6 flex flex-wrap items-center gap-1.5 border-b border-line pb-3">
        <button
          type="button"
          onClick={() => setMood(undefined)}
          className={`press rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
            mood === undefined ? 'bg-ink text-paper' : 'text-ink-faint hover:bg-paper-deep'
          }`}
        >
          All moods
        </button>
        {MOODS.map((m) => {
          const active = mood === m
          const meta = MOOD_META[m]
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMood(active ? undefined : m)}
              aria-pressed={active}
              title={meta.note}
              className={`press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors`}
              style={active ? { background: meta.tint, color: meta.color } : { color: 'var(--ink-faint)' }}
            >
              <MoodGlyph mood={m} className="h-3.5 w-3.5" />
              {meta.label}
            </button>
          )
        })}
        <CaretDown weight="bold" className="ml-auto hidden h-3 w-3 text-ink-ghost" aria-hidden />
      </div>

      {/* ------------------------------------------------ entries */}
      {entries.isLoading ? (
        <ul className="divide-y divide-line border-b border-line">
          <EntryRowSkeleton />
          <EntryRowSkeleton />
          <EntryRowSkeleton />
          <EntryRowSkeleton />
        </ul>
      ) : entries.isError ? (
        <QueryError
          error={entries.error}
          fallback="Couldn't load entries."
          onRetry={() => entries.refetch()}
          className="mt-6"
        />
      ) : list.length === 0 ? (
        <EmptyState
          isOwner={isOwner}
          hasFilter={mood !== undefined}
          onWrite={() => onNavigate({ kind: 'compose', notebookId: notebook.id })}
          onClearFilter={() => setMood(undefined)}
        />
      ) : (
        <>
          <ul className="divide-y divide-line border-b border-line">
            {list.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                authorName={!isOwner ? authorName(entry.author_id) : null}
                showPrivate={Boolean(notebook.group_id)}
                onOpen={(e) => onNavigate({ kind: 'entry', entryId: e.id, notebookId: notebook.id })}
              />
            ))}
          </ul>
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                className="press h-9 border-line bg-paper-raised"
                onClick={() => entries.fetchNextPage()}
                disabled={entries.isFetchingNextPage}
              >
                {entries.isFetchingNextPage ? 'Turning the page…' : 'Older entries'}
              </Button>
            </div>
          )}
        </>
      )}

      {/* ------------------------------------------------ owner dialogs */}
      {renameOpen && <RenameDialog key={notebook.id} notebook={notebook} onClose={() => setRenameOpen(false)} />}
      {shareOpen && <ShareDialog key={notebook.id} notebook={notebook} onClose={() => setShareOpen(false)} />}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="border-line bg-paper-raised">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-lg text-ink">Delete “{notebook.title}”?</AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] leading-relaxed text-ink-soft">
              The notebook and every entry in it — {total} in all — are removed permanently. If it&apos;s shared,
              members lose access the moment it&apos;s gone. There is no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="press h-9">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="press h-9 bg-ember text-white hover:bg-ember/90"
              onClick={async () => {
                try {
                  await remove.mutateAsync(notebook.id)
                  toast.success('Notebook deleted.')
                  onNavigate({ kind: 'groups' })
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Delete failed.')
                }
              }}
            >
              Delete for good
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// --------------------------------------------------------------- empty state

function EmptyState({
  isOwner,
  hasFilter,
  onWrite,
  onClearFilter,
}: {
  isOwner: boolean
  hasFilter: boolean
  onWrite: () => void
  onClearFilter: () => void
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      {hasFilter ? (
        <>
          <p className="font-display text-2xl text-ink">Nothing in this weather.</p>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">No entries carry that mood here — yet.</p>
          <button
            type="button"
            onClick={onClearFilter}
            className="mt-5 font-mono text-[11px] uppercase tracking-[0.16em] text-clay-ink underline underline-offset-4"
          >
            clear the filter
          </button>
        </>
      ) : isOwner ? (
        <>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-line bg-paper-raised">
            <PenNib weight="light" className="h-6 w-6 text-clay" />
          </div>
          <p className="font-display mt-6 text-2xl text-ink">This notebook is still blank.</p>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
            The first entry doesn&apos;t need to be important. The bread, the weather, the argument, the walk — start
            anywhere.
          </p>
          <Button onClick={onWrite} className="press mt-6 h-10 gap-2 shadow-ink">
            <PenNib weight="bold" className="h-4 w-4" /> Write the first entry
          </Button>
        </>
      ) : (
        <>
          <p className="font-display text-2xl text-ink">Nothing shared yet.</p>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
            Entries appear here once the notebook&apos;s owner saves them — the ones they chose to share.
          </p>
        </>
      )}
    </div>
  )
}

// --------------------------------------------------------------- helpers

function useGroupMembers(groupId: string | null) {
  const { status } = useSession()
  const { data } = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: () => listMembers(groupId as string),
    enabled: status === 'authenticated' && groupId !== null,
    staleTime: 60_000,
  })
  return data
}
