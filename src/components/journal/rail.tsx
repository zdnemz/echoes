'use client'

/**
 * The rail — notebooks you own, notebooks shared with you, and groups.
 * Editorial rows on plain paper: active state is a clay rule + deep fill,
 * not a card. "New" actions are quiet inline dialogs.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { GearSix, LinkSimple, Plus, UsersThree } from '@phosphor-icons/react/dist/ssr'
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
    <p className="px-2 pb-2 pt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint first:pt-0">
      {children}
    </p>
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
      <DialogContent className="max-w-sm border-line bg-paper-raised">
        <DialogHeader>
          <DialogTitle className="font-display text-lg text-ink">A new notebook</DialogTitle>
          <DialogDescription className="text-[12.5px] text-ink-soft">
            Private until you decide otherwise.
          </DialogDescription>
        </DialogHeader>
        <form id="new-notebook-form" onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="nb-title" className="text-[12.5px]">
              Name
            </Label>
            <Input
              id="nb-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Morning pages"
              autoFocus
              className="h-10 bg-paper"
            />
            {error && <p className="text-[11.5px] text-ember">{error}</p>}
          </div>
          <DialogFooter className="mt-1 gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="press h-9">
              Not now
            </Button>
            <Button type="submit" disabled={create.isPending} className="press h-9 shadow-ink">
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
      <DialogContent className="max-w-sm border-line bg-paper-raised">
        <DialogHeader>
          <DialogTitle className="font-display text-lg text-ink">A small group</DialogTitle>
          <DialogDescription className="text-[12.5px] text-ink-soft">
            Family, a partner, two friends. You can invite them by email next.
          </DialogDescription>
        </DialogHeader>
        <form id="new-group-form" onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="grp-name" className="text-[12.5px]">
              Name
            </Label>
            <Input
              id="grp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kitchen Table"
              autoFocus
              className="h-10 bg-paper"
            />
            {error && <p className="text-[11.5px] text-ember">{error}</p>}
          </div>
          <DialogFooter className="mt-1 gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="press h-9">
              Not now
            </Button>
            <Button type="submit" disabled={create.isPending} className="press h-9 shadow-ink">
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

  const mine = notebooks.filter((nb) => nb.owner_id === user?.id)
  const shared = notebooks.filter((nb) => nb.owner_id !== user?.id)
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
      <li key={nb.id} className="relative">
        <button
          type="button"
          onClick={() => onNavigate({ kind: 'notebook', notebookId: nb.id })}
          aria-current={active ? 'page' : undefined}
          className={`press group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] transition-colors ${
            active ? 'bg-paper-deep text-ink' : 'text-ink-soft hover:bg-paper-deep/60 hover:text-ink'
          }`}
        >
          {active && (
            <span
              aria-hidden="true"
              className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-clay"
            />
          )}
          <span className="min-w-0 flex-1 truncate">{nb.title}</span>
          {gname && !isShared && (
            <span
              title={`Shared with ${gname}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-clay-tint px-1.5 py-0.5 font-mono text-[9px] text-clay-ink"
            >
              <LinkSimple weight="bold" className="h-2.5 w-2.5" />
              {gname.length > 10 ? `${gname.slice(0, 9)}…` : gname}
            </span>
          )}
          {isShared && (
            <span
              title={`Shared with you by ${gname ?? 'the group'}`}
              className="shrink-0 font-mono text-[9px] uppercase tracking-wide text-ink-faint"
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
      {/* ------------------------------------------------ notebooks */}
      <div className="flex items-center justify-between">
        <SectionLabel>Notebooks</SectionLabel>
        <button
          type="button"
          onClick={() => setNbDialog(true)}
          className="press -mr-1 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink"
          aria-label="New notebook"
          title="New notebook"
        >
          <Plus weight="bold" className="h-3.5 w-3.5" />
        </button>
      </div>
      {mine.length > 0 ? (
        <ul className="space-y-0.5">{mine.map(row)}</ul>
      ) : (
        <p className="px-2.5 py-2 text-[12px] leading-relaxed text-ink-faint">
          No notebooks yet — the first one is one click away.
        </p>
      )}

      {/* ------------------------------------------------ shared with you */}
      {shared.length > 0 && (
        <>
          <SectionLabel>Shared with you</SectionLabel>
          <ul className="space-y-0.5">{shared.map(row)}</ul>
        </>
      )}

      {/* ------------------------------------------------ groups */}
      <div className="flex items-center justify-between">
        <SectionLabel>Groups</SectionLabel>
        <button
          type="button"
          onClick={() => setGrpDialog(true)}
          className="press -mr-1 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-paper-deep hover:text-ink"
          aria-label="New group"
          title="New group"
        >
          <Plus weight="bold" className="h-3.5 w-3.5" />
        </button>
      </div>
      {groups.data && groups.data.length > 0 ? (
        <ul className="space-y-0.5">
          {groups.data.map((g) => {
            const active = view?.kind === 'groups' || (view?.kind === 'group' && view.groupId === g.id)
            const selected = view?.kind === 'group' && view.groupId === g.id
            return (
              <li key={g.id} className="relative">
                <button
                  type="button"
                  onClick={() => onNavigate(selected ? { kind: 'groups' } : { kind: 'group', groupId: g.id })}
                  aria-current={selected ? 'page' : undefined}
                  className={`press flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] transition-colors ${
                    selected ? 'bg-paper-deep text-ink' : 'text-ink-soft hover:bg-paper-deep/60 hover:text-ink'
                  }`}
                >
                  {selected && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-clay"
                    />
                  )}
                  <UsersThree
                    weight={g.my_role === 'owner' ? 'fill' : 'regular'}
                    className={`h-4 w-4 shrink-0 ${g.my_role === 'owner' ? 'text-clay' : 'text-ink-faint'}`}
                  />
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-faint">×{g.member_count}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-2.5 py-2 text-[12px] leading-relaxed text-ink-faint">
          No groups. Create one when you&apos;re ready to share a notebook.
        </p>
      )}

      {/* ------------------------------------------------ settings */}
      <div className="mt-6 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => onNavigate({ kind: 'settings' })}
          aria-current={view?.kind === 'settings' ? 'page' : undefined}
          className={`press relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] transition-colors ${
            view?.kind === 'settings' ? 'bg-paper-deep text-ink' : 'text-ink-soft hover:bg-paper-deep/60 hover:text-ink'
          }`}
        >
          {view?.kind === 'settings' && (
            <span
              aria-hidden="true"
              className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-clay"
            />
          )}
          <GearSix weight="regular" className="h-4 w-4 shrink-0 text-ink-faint" />
          <span className="min-w-0 flex-1 truncate">Settings</span>
        </button>
      </div>

      {/* ------------------------------------------------ who */}
      <div className="mt-8 border-t border-line pt-4">
        <p className="px-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Signed in as</p>
        <p className="mt-1.5 truncate px-2.5 text-[13px] text-ink">
          {user?.display_name || initials(user?.email ?? '', '·')}
        </p>
        {user?.display_name && <p className="truncate px-2.5 text-[11.5px] text-ink-faint">{user.email}</p>}
      </div>

      <NewNotebookDialog open={nbDialog} onOpenChange={setNbDialog} />
      <NewGroupDialog open={grpDialog} onOpenChange={setGrpDialog} />
    </nav>
  )
}
