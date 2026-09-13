'use client'

/**
 * Groups — the sharing circle manager. Two zones: the group list (left,
 * narrow) and the open group's members + invites (right, wide). Owners get
 * invite/rename/delete controls; members get a quiet Leave.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Check,
  Copy,
  PaperPlaneTilt,
  PencilSimple,
  SignOut,
  TrashSimple,
  UsersThree,
  X,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSession } from '@/lib/auth/session'
import {
  useCreateInvite,
  useDeleteGroup,
  useGroup,
  useGroups,
  useLeaveGroup,
  useRemoveMember,
  useUpdateGroup,
  useRevokeInvite,
  useInvites,
} from '@/lib/api/hooks'
import { isUnconfigured } from '@/lib/api/client'
import { avatarTone, formatDay, initials } from '@/lib/format'
import type { Group, Invite } from '@/lib/api/types'
import type { View } from './workspace'

// --------------------------------------------------------------- invite dialog

const EXPIRY_OPTIONS = [
  { value: '24', label: '24 hours' },
  { value: '48', label: '2 days' },
  { value: '72', label: '3 days' },
  { value: '168', label: '7 days' },
]

function InviteDialog({ group, onClose }: { group: Group; onClose: () => void }) {
  const create = useCreateInvite()
  const [email, setEmail] = useState('')
  const [expiry, setExpiry] = useState('48')
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Invite | null>(null)
  const [copied, setCopied] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = email.trim()
    if (!t.includes('@')) return setError("That doesn't look like an email address.")
    setError(null)
    try {
      const invite = await create.mutateAsync({
        groupId: group.id,
        email: t,
        expires_in_hours: Number(expiry),
      })
      setCreated(invite)
    } catch (err) {
      if (isUnconfigured(err)) setError("The data layer isn't connected on this deployment.")
      else setError(err instanceof Error ? err.message : "Couldn't create the invite.")
    }
  }

  const copyLink = async () => {
    if (!created?.accept_url) return
    try {
      await navigator.clipboard.writeText(created.accept_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md border-line bg-paper-raised">
        <DialogHeader>
          <DialogTitle className="font-display text-lg text-ink">Invite someone to {group.name}</DialogTitle>
          <DialogDescription className="text-[12.5px] leading-relaxed text-ink-soft">
            The link is the invite — single-use, expiring, and addressed to one email.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-sage/40 bg-sage-tint/60 px-4 py-3">
              <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
                <Check weight="bold" className="h-4 w-4 text-sage" />
                Invite created for {created.email}
              </p>
              {created.accept_url && (
                <div className="mt-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                    dev mode — the accept link (no email is sent yet)
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-paper px-2.5 py-1.5 font-mono text-[10.5px] text-ink-soft">
                      {created.accept_url}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="press h-8 w-8 shrink-0 border-line"
                      onClick={copyLink}
                      aria-label="Copy invite link"
                    >
                      {copied ? (
                        <Check weight="bold" className="h-3.5 w-3.5 text-sage" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" onClick={onClose} className="press h-9 shadow-ink">
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-email" className="text-[12.5px]">
                Their email
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jonas@wherever.com"
                autoFocus
                className="h-10 bg-paper"
              />
              {error && <p className="text-[11.5px] text-ember">{error}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-expiry" className="text-[12.5px]">
                Expires after
              </Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger id="invite-expiry" className="h-10 bg-paper">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-line bg-paper-raised">
                  {EXPIRY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-[13px]">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11.5px] text-ink-faint">After that, the link stops working on its own.</p>
            </div>
            <DialogFooter className="mt-1 gap-2">
              <Button type="button" variant="ghost" onClick={onClose} className="press h-9">
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending} className="press h-9 gap-1.5 shadow-ink">
                <PaperPlaneTilt weight="bold" className="h-3.5 w-3.5" />
                {create.isPending ? 'Creating…' : 'Create invite'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// --------------------------------------------------------------- rename dialog

function RenameGroupDialog({ group, onClose }: { group: Group; onClose: () => void }) {
  const rename = useUpdateGroup()
  const [name, setName] = useState(group.name)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n || n === group.name) return onClose()
    try {
      await rename.mutateAsync({ id: group.id, name: n })
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
          <DialogTitle className="font-display text-lg text-ink">Rename group</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="group-name" className="text-[12.5px]">
              Name
            </Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="h-10 bg-paper"
            />
          </div>
          <DialogFooter className="mt-1 gap-2">
            <Button type="button" variant="ghost" onClick={onClose} className="press h-9">
              Cancel
            </Button>
            <Button type="submit" disabled={rename.isPending} className="press h-9 shadow-ink">
              {rename.isPending ? 'Saving…' : 'Rename'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --------------------------------------------------------------- main view

export function GroupsView({
  selectedGroupId,
  onNavigate,
}: {
  selectedGroupId: string | null
  onNavigate: (v: View) => void
}) {
  const { user } = useSession()
  const groups = useGroups()
  const detail = useGroup(selectedGroupId)
  const invites = useInvites(selectedGroupId, detail.data?.my_role === 'owner')
  const removeMember = useRemoveMember()
  const leave = useLeaveGroup()
  const removeGroup = useDeleteGroup()
  const revoke = useRevokeInvite()

  const [inviteOpen, setInviteOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const group = detail.data ?? null
  const isOwner = group?.my_role === 'owner'

  const copyInvite = async (invite: Invite) => {
    if (!invite.accept_url) return
    try {
      await navigator.clipboard.writeText(invite.accept_url)
      setCopiedToken(invite.id)
      setTimeout(() => setCopiedToken(null), 1600)
    } catch {
      /* ignore */
    }
  }

  const list = groups.data ?? []

  return (
    <div className="mx-4 lg:mx-0">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-clay">groups</p>
          <h1 className="font-display mt-2 text-3xl leading-tight tracking-tight text-ink">Sharing circles</h1>
          <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-ink-soft">
            A group is a few people you trust with one notebook. Owners invite and remove; anyone can link their own
            notebook to it.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="press h-9 gap-1.5 border-line bg-paper-raised lg:hidden"
          onClick={() => onNavigate({ kind: 'groups' })}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All groups
        </Button>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[13rem_1fr] lg:gap-12">
        {/* ------------------------------------------------ group list */}
        <aside className={selectedGroupId ? 'hidden lg:block' : ''}>
          <p className="pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Your groups</p>
          {groups.isLoading ? (
            <div className="space-y-2">
              <div className="skeleton-line h-9 w-full" />
              <div className="skeleton-line h-9 w-4/5" />
            </div>
          ) : list.length === 0 ? (
            <p className="py-2 text-[12.5px] leading-relaxed text-ink-faint">
              None yet. Create one from the rail — the &ldquo;+&rdquo; next to Groups.
            </p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {list.map((g) => {
                const active = g.id === selectedGroupId
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(active ? { kind: 'groups' } : { kind: 'group', groupId: g.id })}
                      aria-current={active ? 'page' : undefined}
                      className={`press flex w-full items-center gap-2.5 py-3 pl-3 pr-2 text-left text-[13.5px] transition-colors ${
                        active ? 'bg-paper-deep text-ink' : 'text-ink-soft hover:bg-paper-deep/50 hover:text-ink'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{g.name}</span>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ${
                          g.my_role === 'owner' ? 'bg-clay-tint text-clay-ink' : 'bg-paper-sink text-ink-faint'
                        }`}
                      >
                        {g.my_role}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-ink-faint">×{g.member_count}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        {/* ------------------------------------------------ open group */}
        <div className="min-w-0">
          {!selectedGroupId ? (
            <div className="rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
              <UsersThree weight="light" className="mx-auto h-7 w-7 text-ink-ghost" />
              <p className="font-display mt-4 text-xl text-ink">Open a group</p>
              <p className="mx-auto mt-2 max-w-[42ch] text-[12.5px] leading-relaxed text-ink-faint">
                Pick a group on the left to see its members, send invites, or manage who&apos;s in — or create one from
                the rail.
              </p>
            </div>
          ) : !group ? (
            detail.isLoading ? (
              <div className="space-y-3">
                <div className="skeleton-line h-8 w-44" />
                <div className="skeleton-line h-9 w-full" />
                <div className="skeleton-line h-9 w-full" />
              </div>
            ) : (
              <p className="text-[13px] text-ember">
                {detail.error instanceof Error ? detail.error.message : "Couldn't load this group."}
              </p>
            )
          ) : (
            <div>
              {/* header */}
              <div className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-line pb-4">
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-2xl leading-tight text-ink">{group.name}</h2>
                  <p className="mt-1.5 font-mono text-[10.5px] text-ink-faint">
                    since {formatDay(group.created_at)} · {group.member_count}{' '}
                    {group.member_count === 1 ? 'member' : 'members'} · you are the {group.my_role}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isOwner ? (
                    <>
                      <Button size="sm" className="press h-9 gap-1.5 shadow-ink" onClick={() => setInviteOpen(true)}>
                        <PaperPlaneTilt weight="bold" className="h-3.5 w-3.5" /> Invite
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="press h-9 w-9 border-line bg-paper-raised"
                        aria-label="Rename group"
                        onClick={() => setRenameOpen(true)}
                      >
                        <PencilSimple className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="press h-9 w-9 border-line bg-paper-raised text-ember"
                        aria-label="Delete group"
                        onClick={() => setDeleteOpen(true)}
                      >
                        <TrashSimple className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="press h-9 gap-1.5 border-line bg-paper-raised text-ember"
                      onClick={() => setLeaveOpen(true)}
                    >
                      <SignOut weight="regular" className="h-3.5 w-3.5" /> Leave group
                    </Button>
                  )}
                </div>
              </div>

              {/* members */}
              <section aria-label="Members" className="mt-6">
                <p className="pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Members</p>
                <ul className="divide-y divide-line border-y border-line">
                  {group.members.map((m) => {
                    const tone = avatarTone(m.user_id)
                    const isSelf = m.user_id === user?.id
                    const canRemove = isOwner && !isSelf
                    return (
                      <li key={m.user_id} className="flex items-center gap-3.5 py-3">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold"
                          style={{ background: tone.bg, color: tone.fg }}
                          aria-hidden="true"
                        >
                          {initials(m.display_name, '·')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] text-ink">
                            {m.display_name || 'Unnamed member'}
                            {isSelf && <span className="ml-1.5 font-mono text-[10px] text-clay">you</span>}
                          </p>
                          <p className="truncate font-mono text-[10.5px] text-ink-faint">
                            {m.role} · joined {formatDay(m.joined_at)}
                          </p>
                        </div>
                        {canRemove && (
                          <button
                            type="button"
                            onClick={() =>
                              removeMember.mutate(
                                { groupId: group.id, userId: m.user_id },
                                {
                                  onSuccess: () =>
                                    toast.success(
                                      `${m.display_name ?? 'Member'} removed — their access is gone immediately.`,
                                    ),
                                  onError: (err) =>
                                    toast.error(err instanceof Error ? err.message : "Couldn't remove."),
                                },
                              )
                            }
                            className="press rounded-md p-1.5 text-ink-faint transition-colors hover:bg-ember-tint hover:text-ember"
                            aria-label={`Remove ${m.display_name ?? 'member'}`}
                            title="Remove member"
                          >
                            <X weight="bold" className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>

              {/* invites — owner only */}
              {isOwner && (
                <section aria-label="Invites" className="mt-8">
                  <div className="flex items-center justify-between">
                    <p className="pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">Invites</p>
                    <button
                      type="button"
                      onClick={() => setInviteOpen(true)}
                      className="press font-mono text-[10.5px] text-clay-ink underline underline-offset-4"
                    >
                      new invite
                    </button>
                  </div>
                  {invites.isLoading ? (
                    <div className="skeleton-line h-9 w-full" />
                  ) : (invites.data ?? []).filter((i) => i.status === 'pending').length === 0 ? (
                    <p className="py-3 text-[12.5px] leading-relaxed text-ink-faint">
                      No open invites. Send one — the link is the invite.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line border-y border-line">
                      {(invites.data ?? [])
                        .filter((i) => i.status === 'pending')
                        .map((invite) => (
                          <li key={invite.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-soft">
                              {invite.email}
                            </span>
                            <span className="font-mono text-[10px] text-ink-faint">
                              expires {formatDay(invite.expires_at)}
                            </span>
                            {invite.accept_url && (
                              <button
                                type="button"
                                onClick={() => copyInvite(invite)}
                                className="press inline-flex items-center gap-1.5 rounded-md border border-line bg-paper-raised px-2.5 py-1 font-mono text-[10.5px] text-ink-soft hover:border-clay-soft hover:text-clay-ink"
                                title="Copy the accept link"
                              >
                                {copiedToken === invite.id ? (
                                  <>
                                    <Check weight="bold" className="h-3 w-3 text-sage" /> copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3" /> copy link
                                  </>
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                invite.token &&
                                revoke.mutate(invite.token, {
                                  onSuccess: () => toast.success('Invite revoked.'),
                                  onError: (err) =>
                                    toast.error(err instanceof Error ? err.message : "Couldn't revoke."),
                                })
                              }
                              className="press rounded-md p-1.5 text-ink-faint transition-colors hover:bg-ember-tint hover:text-ember"
                              aria-label="Revoke invite"
                              title="Revoke invite"
                            >
                              <X weight="bold" className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ dialogs */}
      {group && (
        <>
          {inviteOpen && <InviteDialog key={group.id} group={group} onClose={() => setInviteOpen(false)} />}
          {renameOpen && <RenameGroupDialog key={group.id} group={group} onClose={() => setRenameOpen(false)} />}

          <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
            <AlertDialogContent className="border-line bg-paper-raised">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display text-lg text-ink">Leave {group.name}?</AlertDialogTitle>
                <AlertDialogDescription className="text-[12.5px] leading-relaxed text-ink-soft">
                  You lose access to notebooks shared with this group the moment you leave. You can only return by a
                  fresh invite.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel className="press h-9">Stay</AlertDialogCancel>
                <AlertDialogAction
                  className="press h-9 bg-ember text-white hover:bg-ember/90"
                  onClick={async () => {
                    try {
                      await leave.mutateAsync(group.id)
                      toast.success(`You left ${group.name}.`)
                      onNavigate({ kind: 'groups' })
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Couldn't leave.")
                    }
                  }}
                >
                  Leave
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent className="border-line bg-paper-raised">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display text-lg text-ink">Delete {group.name}?</AlertDialogTitle>
                <AlertDialogDescription className="text-[12.5px] leading-relaxed text-ink-soft">
                  Memberships and invites vanish, and every notebook linked to this group becomes private again —
                  instantly, for everyone. No undo.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel className="press h-9">Keep it</AlertDialogCancel>
                <AlertDialogAction
                  className="press h-9 bg-ember text-white hover:bg-ember/90"
                  onClick={async () => {
                    try {
                      await removeGroup.mutateAsync(group.id)
                      toast.success('Group deleted — linked notebooks are private again.')
                      onNavigate({ kind: 'groups' })
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Couldn't delete.")
                    }
                  }}
                >
                  Delete for good
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  )
}
