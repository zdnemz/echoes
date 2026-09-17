'use client'

/**
 * The rail — notebooks you own, notebooks shared with you, and groups.
 * Editorial rows on plain paper: active state is a clay rule + deep fill,
 * not a card. "New" actions are quiet inline dialogs.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import {
  BookOpen,
  GearSix,
  LinkSimple,
  MagnifyingGlass,
  Plus,
  Sparkle,
  UsersThree,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateGroup, useCreateNotebook, useGroups } from '@/lib/api/hooks'
import { useSession } from '@/lib/auth/session'
import { isUnconfigured } from '@/lib/api/client'
import { initials } from '@/lib/format'
import type { Notebook } from '@/lib/api/types'
import type { View } from './workspace'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-2 pt-5 first:pt-0">
      <p className="inline-block bg-foreground px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-background">
        {children}
      </p>
    </div>
  )
}

// --------------------------------------------------------------- new notebook

function NewNotebookDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateNotebook()
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return setError('Give the notebook a name.')
    if (t.length > 120) return setError('120 characters at most.')
    setError(null)
    try {
      await create.mutateAsync({ title: t })
      toast.success(`“${t}” is ready — blank and patient.`)
      setTitle('')
      onOpenChange(false)
    } catch (err) {
      if (isUnconfigured(err)) toast.error("The data layer isn't connected on this deployment.")
      else setError(err instanceof Error ? err.message : "Couldn't create the notebook.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg">A new notebook</DialogTitle>
          <DialogDescription className="text-[12.5px] font-bold">Private until you decide otherwise.</DialogDescription>
        </DialogHeader>
        <form id="new-notebook-form" onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nb-title">Name</Label>
            <Input
              id="nb-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Morning pages"
              autoFocus
              className="h-10"
            />
            {error && (
              <p className="border-2 border-destructive px-2.5 py-1.5 text-[11.5px] font-bold text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="mt-1 gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-9">
              Not now
            </Button>
            <Button type="submit" disabled={create.isPending} className="h-9">
              {create.isPending ? 'Creating…' : 'Create notebook'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --------------------------------------------------------------- new group

function NewGroupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateGroup()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return setError('Groups need a name too.')
    setError(null)
    try {
      await create.mutateAsync(n)
      toast.success(`Group “${n}” created — you're the owner.`)
      setName('')
      onOpenChange(false)
    } catch (err) {
      if (isUnconfigured(err)) toast.error("The data layer isn't connected on this deployment.")
      else setError(err instanceof Error ? err.message : "Couldn't create the group.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg">A small group</DialogTitle>
          <DialogDescription className="text-[12.5px] font-bold">
            Family, a partner, two friends. You can invite them by email next.
          </DialogDescription>
        </DialogHeader>
        <form id="new-group-form" onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="grp-name">Name</Label>
            <Input
              id="grp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kitchen Table"
              autoFocus
              className="h-10"
            />
            {error && (
              <p className="border-2 border-destructive px-2.5 py-1.5 text-[11.5px] font-bold text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="mt-1 gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-9">
              Not now
            </Button>
            <Button type="submit" disabled={create.isPending} className="h-9">
              {create.isPending ? 'Creating…' : 'Create group'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --------------------------------------------------------------- rail

export function Rail({
  notebooks,
  view,
  onNavigate,
  embedded = false,
}: {
  notebooks: Notebook[]
  view: View | null
  onNavigate: (v: View) => void
  embedded?: boolean
}) {
  const { user } = useSession()
  const groups = useGroups()
  const [nbDialog, setNbDialog] = useState(false)
  const [grpDialog, setGrpDialog] = useState(false)
  const [filter, setFilter] = useState('')
  const q = filter.trim().toLowerCase()

  const mine = notebooks.filter((nb) => nb.owner_id === user?.id)
  const shared = notebooks.filter((nb) => nb.owner_id !== user?.id)
  const matchQ = (s: string | null | undefined) => !q || (s ?? '').toLowerCase().includes(q)
  const mineShown = mine.filter((nb) => matchQ(nb.title))
  const sharedShown = shared.filter((nb) => matchQ(nb.title))
  const groupsShown = (groups.data ?? []).filter((g) => matchQ(g.name))
  const groupName = (id: string | null) => (id ? (groups.data?.find((g) => g.id === id)?.name ?? 'a group') : null)

  const activeNotebookId =
    view?.kind === 'notebook' || view?.kind === 'compose'
      ? view.notebookId
      : view?.kind === 'entry'
        ? view.notebookId
        : null

  const row = (nb: Notebook) => {
    const active = activeNotebookId === nb.id
    const gname = groupName(nb.group_id)
    const isShared = nb.owner_id !== user?.id
    return (
      <li key={nb.id}>
        <button
          type="button"
          onClick={() => onNavigate({ kind: 'notebook', notebookId: nb.id })}
          aria-current={active ? 'page' : undefined}
          className={`press group flex w-full items-center gap-2.5 border-2 px-2.5 py-2 text-left text-[13.5px] font-bold transition-colors ${
            active ? 'border-foreground bg-muted shadow-brutal-sm' : 'border-transparent hover:border-foreground'
          }`}
        >
          <BookOpen weight={active ? 'fill' : 'regular'} className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{nb.title}</span>
          {gname && !isShared && (
            <span
              title={`Shared with ${gname}`}
              className="inline-flex shrink-0 items-center gap-1 border border-foreground bg-accent px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-background"
            >
              <LinkSimple weight="bold" className="h-2.5 w-2.5" />
              {gname.length > 10 ? `${gname.slice(0, 9)}…` : gname}
            </span>
          )}
          {isShared && (
            <span
              title={`Shared with you by ${gname ?? 'the group'}`}
              className="shrink-0 bg-foreground px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-background"
            >
              with you
            </span>
          )}
        </button>
      </li>
    )
  }

  return (
    <nav aria-label="Journal navigation" className={`text-[13.5px] ${embedded ? '' : ''}`}>
      {/* filter — satu kolom cari untuk notebook + group */}
      <div className="relative mb-1">
        <MagnifyingGlass
          weight="bold"
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
        />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="FILTER NOTEBOOKS & GROUPS…"
          aria-label="Filter notebooks and groups"
          className="h-9 w-full border-2 border-foreground bg-background pl-8 pr-3 text-[12.5px] font-bold placeholder:text-muted-foreground focus:border-accent focus:outline-none"
        />
      </div>
      {/* ------------------------------------------------ notebooks */}
      <div className="flex items-center justify-between">
        <SectionLabel>
          Notebooks · {mineShown.length}/{mine.length}
        </SectionLabel>
        <button
          type="button"
          onClick={() => setNbDialog(true)}
          className="press border-2 border-transparent p-1 transition-colors hover:border-foreground hover:bg-muted"
          aria-label="New notebook"
          title="New notebook"
        >
          <Plus weight="bold" className="h-3.5 w-3.5" />
        </button>
      </div>
      {mineShown.length > 0 ? (
        <ul className="space-y-0.5">{mineShown.map(row)}</ul>
      ) : (
        <p className="px-2.5 py-2 text-[12px] leading-relaxed text-ink-faint">
          {mine.length === 0 ? 'No notebooks yet — the first one is one click away.' : 'No notebooks match.'}
        </p>
      )}

      {/* ------------------------------------------------ shared with you */}
      {sharedShown.length > 0 && (
        <>
          <SectionLabel>Shared with you · {sharedShown.length}</SectionLabel>
          <ul className="space-y-0.5">{sharedShown.map(row)}</ul>
        </>
      )}

      {/* ------------------------------------------------ groups */}
      <div className="flex items-center justify-between">
        <SectionLabel>
          Groups · {groupsShown.length}/{groups.data?.length ?? 0}
        </SectionLabel>
        <button
          type="button"
          onClick={() => setGrpDialog(true)}
          className="press border-2 border-transparent p-1 transition-colors hover:border-foreground hover:bg-muted"
          aria-label="New group"
          title="New group"
        >
          <Plus weight="bold" className="h-3.5 w-3.5" />
        </button>
      </div>
      {groupsShown.length > 0 ? (
        <ul className="space-y-0.5">
          {groupsShown.map((g) => {
            const active = view?.kind === 'groups' || (view?.kind === 'group' && view.groupId === g.id)
            const selected = view?.kind === 'group' && view.groupId === g.id
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(selected ? { kind: 'groups' } : { kind: 'group', groupId: g.id })}
                  aria-current={selected ? 'page' : undefined}
                  className={`press flex w-full items-center gap-2.5 border-2 px-2.5 py-2 text-left text-[13.5px] font-bold transition-colors ${
                    selected
                      ? 'border-foreground bg-muted shadow-brutal-sm'
                      : 'border-transparent hover:border-foreground'
                  }`}
                >
                  <UsersThree weight={g.my_role === 'owner' ? 'fill' : 'regular'} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  <span className="shrink-0 bg-foreground px-1.5 py-0.5 font-mono text-[10px] font-bold text-background">
                    ×{g.member_count}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-2.5 py-2 text-[12px] leading-relaxed text-ink-faint">
          {q ? 'No groups match.' : "No groups. Create one when you're ready to share a notebook."}
        </p>
      )}

      {/* ------------------------------------------------ reflect + settings */}
      <div className="mt-6 space-y-1 border-t-[3px] border-foreground pt-3">
        <button
          type="button"
          onClick={() => onNavigate({ kind: 'reflect' })}
          aria-current={view?.kind === 'reflect' ? 'page' : undefined}
          className={`press flex w-full items-center gap-2.5 border-2 px-2.5 py-2 text-left text-[13.5px] font-bold transition-colors ${
            view?.kind === 'reflect'
              ? 'border-foreground bg-muted shadow-brutal-sm'
              : 'border-transparent hover:border-foreground'
          }`}
        >
          <Sparkle weight="regular" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Reflect</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate({ kind: 'settings' })}
          aria-current={view?.kind === 'settings' ? 'page' : undefined}
          className={`press flex w-full items-center gap-2.5 border-2 px-2.5 py-2 text-left text-[13.5px] font-bold transition-colors ${
            view?.kind === 'settings'
              ? 'border-foreground bg-muted shadow-brutal-sm'
              : 'border-transparent hover:border-foreground'
          }`}
        >
          <GearSix weight="regular" className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Settings</span>
        </button>
      </div>

      {/* ------------------------------------------------ who */}
      <div className="mt-8 border-2 border-foreground bg-muted p-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">Signed in as</p>
        <p className="mt-1.5 truncate text-[13px] font-black uppercase">
          {user?.display_name || initials(user?.email ?? '', '·')}
        </p>
        {user?.display_name && <p className="truncate text-[11.5px] font-bold">{user.email}</p>}
      </div>

      <NewNotebookDialog open={nbDialog} onOpenChange={setNbDialog} />
      <NewGroupDialog open={grpDialog} onOpenChange={setGrpDialog} />
    </nav>
  )
}
