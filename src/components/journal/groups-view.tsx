'use client'

/**
 * Groups — the sharing circle manager.
 * Group panes are organized into tabs:
 *  - Journal: shared entries across linked notebooks, with filters by time,
 *    author, mood, tags and text search.
 *  - Members: member list with roles and removal controls.
 *  - Sharing (owner only): invite link rotation, auto-accept switch, request queue.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowClockwise,
  ArrowLeft,
  BookOpen,
  CalendarBlank,
  Check,
  CircleNotch,
  Clock,
  Copy,
  Funnel,
  LinkSimple,
  MagnifyingGlass,
  PencilSimple,
  PenNib,
  Plus,
  SignOut,
  TrashSimple,
  User,
  UsersThree,
  Warning,
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
import { MOODS, MOOD_META, MoodGlyph, type Mood } from '@/components/mood/glyphs'
import { EntryRow, EntryRowSkeleton } from './entry-row'
import { useSession } from '@/lib/auth/session'
import {
  useCreateNotebook,
  useDecideJoinRequest,
  useDeleteGroup,
  useGroup,
  useGroupEntries,
  useGroups,
  useInviteLink,
  useJoinRequests,
  useLeaveGroup,
  useNotebooks,
  useRemoveMember,
  useRevokeInviteLink,
  useRotateInviteLink,
  useUpdateGroup,
  useUpdateNotebook,
} from '@/lib/api/hooks'
import { isUnconfigured } from '@/lib/api/client'
import { useDebouncedValue, useMinuteTick } from '@/hooks/use-debounced-value'
import { avatarTone, formatDay, initials } from '@/lib/format'
import type { Group, GroupDetail } from '@/lib/api/types'
import type { View } from './workspace'

// --------------------------------------------------------------- sharing panel (owner)

const LINK_EXPIRY_OPTIONS = [
  { value: 'never', label: 'Never expires' },
  { value: '24', label: '24 hours' },
  { value: '168', label: '7 days' },
  { value: '720', label: '30 days' },
]

function SharingPanel({ group }: { group: Group }) {
  const link = useInviteLink(group.my_role === 'owner' ? group.id : null)
  const requests = useJoinRequests(group.my_role === 'owner' ? group.id : null)
  const rotate = useRotateInviteLink()
  const revoke = useRevokeInviteLink()
  const update = useUpdateGroup()
  const decide = useDecideJoinRequest()

  const [expiry, setExpiry] = useState('168')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Only a hash is stored server-side, so a freshly minted link is shown
  // exactly once. Hold the one we just created; it disappears on reload.
  const [freshUrl, setFreshUrl] = useState<string | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current)
    },
    [],
  )

  const fail = (err: unknown, fallback: string) => {
    if (isUnconfigured(err)) setError("The data layer isn't connected on this deployment.")
    else setError(err instanceof Error ? err.message : fallback)
  }

  const createLink = async () => {
    setError(null)
    try {
      const created = await rotate.mutateAsync({
        groupId: group.id,
        expires_in_hours: expiry === 'never' ? null : Number(expiry),
      })
      setFreshUrl(created.url)
    } catch (err) {
      fail(err, "Couldn't create the link.")
    }
  }

  const absoluteUrl = (url: string) => (url.startsWith('http') ? url : window.location.origin + url)

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(absoluteUrl(url))
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      setError("Couldn't copy — select the link and copy it manually.")
    }
  }

  const flipAutoAccept = async () => {
    setError(null)
    try {
      await update.mutateAsync({ id: group.id, auto_accept: !group.auto_accept })
      toast.success(group.auto_accept ? 'New members now need approval.' : 'New members join instantly.')
    } catch (err) {
      fail(err, "Couldn't change the setting.")
    }
  }

  const pending = (requests.data ?? []).filter((r) => r.status === 'pending')

  return (
    <div className="space-y-5">
      {/* auto-accept */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13.5px] font-medium text-ink">Let people in instantly</p>
          <p className="mt-0.5 max-w-[52ch] text-[12px] leading-relaxed text-ink-faint">
            {group.auto_accept
              ? 'Anyone with the link joins on the spot.'
              : 'Link visitors ask first — you approve each one below.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={group.auto_accept}
          aria-label="Let people in instantly"
          onClick={flipAutoAccept}
          disabled={update.isPending}
          className={`press relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            group.auto_accept ? 'bg-clay' : 'bg-paper-sink'
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-paper-raised shadow transition-all ${
              group.auto_accept ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {/* link */}
      <div>
        <p className="text-[13.5px] font-medium text-ink">Invite link</p>
        {link.isLoading ? (
          <div className="skeleton-line mt-2 h-9 w-full" />
        ) : freshUrl ? (
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-paper px-2.5 py-2 font-mono text-[11px] text-ink-soft">
                {freshUrl}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="press h-9 w-9 shrink-0 border-line"
                onClick={() => copyLink(freshUrl)}
                aria-label="Copy invite link"
              >
                {copied ? <Check weight="bold" className="h-3.5 w-3.5 text-sage" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="press h-9 w-9 shrink-0 border-line text-ember"
                onClick={() => {
                  setFreshUrl(null)
                  revoke.mutate(group.id, {
                    onSuccess: () => toast.success('Link revoked.'),
                    onError: (err) => fail(err, "Couldn't revoke."),
                  })
                }}
                aria-label="Revoke the link"
                title="Revoke the link"
              >
                <X weight="bold" className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="mt-1.5 flex items-start gap-1.5 font-mono text-[10.5px] leading-relaxed text-clay-ink">
              <Warning className="mt-px h-3 w-3 shrink-0" />
              <span>
                Copy it now — this is the only time it appears.{' '}
                {link.data?.expires_at ? <>Expires {formatDay(link.data.expires_at)}.</> : <>Never expires.</>}
              </span>
            </p>
          </div>
        ) : link.data?.has_link ? (
          <div className="mt-2">
            <div className="rounded-md border border-line bg-paper px-3 py-2.5">
              <p className="text-[12px] text-ink-soft">
                A link is active
                {link.data.expires_at ? ` until ${formatDay(link.data.expires_at)}` : ' and never expires'}.
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">
                For your circle&apos;s safety it can&apos;t be shown again — issue a new one to get a link you can
                share.
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="press h-9 gap-1.5 border-line"
                onClick={createLink}
                disabled={rotate.isPending}
              >
                <ArrowClockwise className="h-3.5 w-3.5" />
                {rotate.isPending ? 'Creating…' : 'New link'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="press h-9 gap-1.5 border-line text-ember"
                onClick={() =>
                  revoke.mutate(group.id, {
                    onSuccess: () => toast.success('Link revoked.'),
                    onError: (err) => fail(err, "Couldn't revoke."),
                  })
                }
              >
                <X weight="bold" className="h-3.5 w-3.5" />
                Revoke
              </Button>
            </div>
            <p className="mt-1.5 font-mono text-[10.5px] text-ink-faint">
              A new link kills this one instantly. Link lasts{' '}
              {LINK_EXPIRY_OPTIONS.find((o) => o.value === expiry)?.label.toLowerCase()}.
            </p>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-end gap-2.5">
            <div className="flex min-w-36 flex-1 flex-col gap-2">
              <Label htmlFor={`link-expiry-${group.id}`} className="text-[12px]">
                Link lasts
              </Label>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger id={`link-expiry-${group.id}`} className="h-10 bg-paper">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-line bg-paper-raised">
                  {LINK_EXPIRY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-[13px]">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={createLink} disabled={rotate.isPending} className="press h-10 gap-1.5 shadow-ink">
              <LinkSimple weight="bold" className="h-3.5 w-3.5" />
              {rotate.isPending ? 'Creating…' : 'Create link'}
            </Button>
          </div>
        )}
        {error && <p className="mt-2 text-[11.5px] text-ember">{error}</p>}
      </div>

      {/* requests */}
      <div>
        <p className="text-[13.5px] font-medium text-ink">
          Requests{' '}
          {pending.length > 0 && (
            <span className="ml-1 rounded-full bg-clay-tint px-1.5 py-0.5 font-mono text-[10px] text-clay-ink">
              {pending.length}
            </span>
          )}
        </p>
        {requests.isLoading ? (
          <div className="skeleton-line mt-2 h-9 w-full" />
        ) : pending.length === 0 ? (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-faint">
            {group.auto_accept
              ? 'Nobody waiting — instant join is on, so the queue stays empty.'
              : 'Nobody waiting. Share the link and requests land here.'}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line border-y border-line">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold"
                  style={{
                    background: avatarTone(r.user_id).bg,
                    color: avatarTone(r.user_id).fg,
                  }}
                  aria-hidden="true"
                >
                  {initials(r.display_name, '·')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink">{r.display_name || r.email || 'Someone'}</p>
                  {r.email && <p className="truncate font-mono text-[10.5px] text-ink-faint">{r.email}</p>}
                </div>
                <Button
                  size="sm"
                  className="press h-8 shadow-ink"
                  disabled={decide.isPending}
                  onClick={() =>
                    decide.mutate(
                      { groupId: group.id, requestId: r.id, decision: 'approved' },
                      {
                        onSuccess: () => toast.success(`${r.display_name ?? r.email ?? 'They'} joined ${group.name}.`),
                        onError: (err) => fail(err, "Couldn't approve."),
                      },
                    )
                  }
                >
                  Approve
                </Button>
                <button
                  type="button"
                  disabled={decide.isPending}
                  onClick={() =>
                    decide.mutate(
                      { groupId: group.id, requestId: r.id, decision: 'denied' },
                      {
                        onSuccess: () => toast.success('Request declined.'),
                        onError: (err) => fail(err, "Couldn't decline."),
                      },
                    )
                  }
                  className="press rounded-md p-1.5 text-ink-faint transition-colors hover:bg-ember-tint hover:text-ember"
                  aria-label="Decline request"
                  title="Decline"
                >
                  <X weight="bold" className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// --------------------------------------------------------------- group journal tab

type TimePreset = 'all' | 'today' | 'week' | 'month' | 'custom'

function getTimeBounds(preset: TimePreset, customSince: string, customUntil: string) {
  if (preset === 'today') {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return { since: start.toISOString(), until: undefined }
  }
  if (preset === 'week') {
    const start = new Date(Date.now() - 7 * 24 * 3600_000)
    return { since: start.toISOString(), until: undefined }
  }
  if (preset === 'month') {
    const start = new Date(Date.now() - 30 * 24 * 3600_000)
    return { since: start.toISOString(), until: undefined }
  }
  if (preset === 'custom') {
    const since = customSince ? new Date(customSince + 'T00:00:00').toISOString() : undefined
    const until = customUntil ? new Date(customUntil + 'T23:59:59').toISOString() : undefined
    return { since, until }
  }
  return { since: undefined, until: undefined }
}

function GroupJournalTab({ group, onNavigate }: { group: GroupDetail; onNavigate: (v: View) => void }) {
  const { user } = useSession()
  const notebooks = useNotebooks()
  const createNotebook = useCreateNotebook()
  const updateNotebook = useUpdateNotebook()

  // Filter state
  const [authorId, setAuthorId] = useState<string>('all')
  const [timePreset, setTimePreset] = useState<TimePreset>('all')
  const [customSince, setCustomSince] = useState('')
  const [customUntil, setCustomUntil] = useState('')
  const [mood, setMood] = useState<Mood | undefined>(undefined)
  const [searchInput, setSearchInput] = useState('')
  // The input stays instant; the query only sees the settled term so typing
  // does not fire one request per keystroke.
  const searchQuery = useDebouncedValue(searchInput, 300)

  // Link/compose dialog state
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [newNotebookTitle, setNewNotebookTitle] = useState(`${group.name} Notes`)
  const [selectedNotebookId, setSelectedNotebookId] = useState('')
  const [modalMode, setModalMode] = useState<'create' | 'link'>('create')
  const [busyModal, setBusyModal] = useState(false)

  // Relative presets ("today", "past 7 days"…) are computed from `Date.now()`,
  // so they must be re-derived as time passes — otherwise a tab left open
  // across midnight keeps filtering on yesterday's window.
  const minuteTick = useMinuteTick(timePreset === 'today' || timePreset === 'week' || timePreset === 'month')

  // Memoized time bounds
  const { since, until } = useMemo(
    () => getTimeBounds(timePreset, customSince, customUntil),
    // `minuteTick` is what makes the relative presets re-derive as time passes.
    [timePreset, customSince, customUntil, minuteTick],
  )

  const filters = useMemo(
    () => ({
      author_id: authorId !== 'all' ? authorId : undefined,
      mood,
      q: searchQuery.trim() || undefined,
      since,
      until,
    }),
    [authorId, mood, searchQuery, since, until],
  )

  const entriesQuery = useGroupEntries(group.id, filters)
  const entries = useMemo(() => entriesQuery.data?.pages.flatMap((p) => p.data) ?? [], [entriesQuery.data])
  const total = entriesQuery.data?.pages[0]?.pagination.total ?? 0

  // `placeholderData: (prev) => prev` keeps the previous filter's rows on
  // screen while a new filter loads, which also flips isPending to false.
  // Treat "stale rows still on screen + fetching" as loading so the skeleton
  // shows instead of a result set that is about to be replaced.
  const showEntriesSkeleton = entriesQuery.isLoading || (entriesQuery.isPlaceholderData && entriesQuery.isFetching)

  // Map notebook IDs to their titles for display in EntryRow
  const notebookTitleMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const nb of notebooks.data?.data ?? []) {
      map.set(nb.id, nb.title)
    }
    return map
  }, [notebooks.data])

  // Resolve author names for display in EntryRow
  const authorName = (aId: string) => {
    if (aId === user?.id) return null
    const m = group.members.find((member) => member.user_id === aId)
    return m?.display_name || m?.email || 'a member'
  }

  // Notebooks linked to this group that the current user owns
  const myLinkedNotebooks = useMemo(
    () => (notebooks.data?.data ?? []).filter((nb) => nb.group_id === group.id && nb.owner_id === user?.id),
    [notebooks.data, group.id, user?.id],
  )

  // Unlinked notebooks the user owns (available for linking)
  const myUnlinkedNotebooks = useMemo(
    () => (notebooks.data?.data ?? []).filter((nb) => !nb.group_id && nb.owner_id === user?.id),
    [notebooks.data, user?.id],
  )

  // Total notebooks linked to this group across all members
  const linkedNotebooksCount = useMemo(
    () => (notebooks.data?.data ?? []).filter((nb) => nb.group_id === group.id).length,
    [notebooks.data, group.id],
  )

  const handleComposeClick = () => {
    if (myLinkedNotebooks.length === 1) {
      onNavigate({ kind: 'compose', notebookId: myLinkedNotebooks[0].id, fromGroup: group.id })
    } else {
      // 0 linked notebooks (or multiple to choose from): open dialog
      setSelectedNotebookId(myUnlinkedNotebooks[0]?.id ?? '')
      setModalMode(myUnlinkedNotebooks.length > 0 ? 'link' : 'create')
      setLinkModalOpen(true)
    }
  }

  const handleLinkOrCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusyModal(true)
    try {
      if (modalMode === 'create') {
        const title = newNotebookTitle.trim() || `${group.name} Notes`
        const created = await createNotebook.mutateAsync({ title })
        await updateNotebook.mutateAsync({ id: created.id, group_id: group.id })
        setLinkModalOpen(false)
        onNavigate({ kind: 'compose', notebookId: created.id, fromGroup: group.id })
      } else {
        if (!selectedNotebookId) return
        await updateNotebook.mutateAsync({ id: selectedNotebookId, group_id: group.id })
        setLinkModalOpen(false)
        onNavigate({ kind: 'compose', notebookId: selectedNotebookId, fromGroup: group.id })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setBusyModal(false)
    }
  }

  const hasActiveFilters =
    authorId !== 'all' ||
    timePreset !== 'all' ||
    Boolean(customSince) ||
    Boolean(customUntil) ||
    mood !== undefined ||
    Boolean(searchInput.trim())

  const clearFilters = () => {
    setAuthorId('all')
    setTimePreset('all')
    setCustomSince('')
    setCustomUntil('')
    setMood(undefined)
    setSearchInput('')
  }

  return (
    <div className="space-y-6">
      {/* Action header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg text-ink">Group Journal</h3>
          <p className="text-[12.5px] text-ink-soft">Entries shared across all notebooks linked to {group.name}.</p>
        </div>
        <Button size="sm" className="press h-9 gap-1.5 shadow-ink" onClick={handleComposeClick}>
          <PenNib weight="bold" className="h-3.5 w-3.5" />
          Write entry
        </Button>
      </div>

      {/* Filter panel */}
      <div className="space-y-3 rounded-lg border border-line bg-paper-raised p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Author filter */}
          <div className="w-full sm:w-44">
            <Select value={authorId} onValueChange={setAuthorId}>
              <SelectTrigger className="h-8.5 gap-1.5 border-line bg-paper text-[12px]">
                <User className="h-3.5 w-3.5 text-ink-faint" />
                <SelectValue placeholder="All authors" />
              </SelectTrigger>
              <SelectContent className="border-line bg-paper-raised">
                <SelectItem value="all" className="text-[12.5px]">
                  All authors
                </SelectItem>
                {group.members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id} className="text-[12.5px]">
                    {m.display_name || m.email || 'Member'} {m.user_id === user?.id ? '(you)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time filter */}
          <div className="w-full sm:w-40">
            <Select value={timePreset} onValueChange={(v) => setTimePreset(v as TimePreset)}>
              <SelectTrigger className="h-8.5 gap-1.5 border-line bg-paper text-[12px]">
                <Clock className="h-3.5 w-3.5 text-ink-faint" />
                <SelectValue placeholder="All time" />
              </SelectTrigger>
              <SelectContent className="border-line bg-paper-raised">
                <SelectItem value="all" className="text-[12.5px]">
                  All time
                </SelectItem>
                <SelectItem value="today" className="text-[12.5px]">
                  Today
                </SelectItem>
                <SelectItem value="week" className="text-[12.5px]">
                  Past 7 days
                </SelectItem>
                <SelectItem value="month" className="text-[12.5px]">
                  Past 30 days
                </SelectItem>
                <SelectItem value="custom" className="text-[12.5px]">
                  Custom date range…
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Search input */}
          <div className="relative min-w-[160px] flex-1">
            <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search in this circle…"
              className="h-8.5 w-full rounded-md border border-line bg-paper pl-8 pr-7 text-[12px] text-ink placeholder:text-ink-ghost focus:border-clay-soft focus:outline-none"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="press absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                aria-label="Clear search query"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Custom date range inputs */}
        {timePreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-2.5 text-[12px]">
            <span className="flex items-center gap-1 font-mono text-[11px] text-ink-faint">
              <CalendarBlank className="h-3.5 w-3.5" /> Range:
            </span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customSince}
                onChange={(e) => setCustomSince(e.target.value)}
                className="h-7 rounded border border-line bg-paper px-2 font-mono text-[11.5px] text-ink"
                aria-label="Start date"
              />
              <span className="text-ink-faint">to</span>
              <input
                type="date"
                value={customUntil}
                onChange={(e) => setCustomUntil(e.target.value)}
                className="h-7 rounded border border-line bg-paper px-2 font-mono text-[11.5px] text-ink"
                aria-label="End date"
              />
            </div>
          </div>
        )}

        {/* Mood pills row */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
          <button
            type="button"
            onClick={() => setMood(undefined)}
            className={`press rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              mood === undefined ? 'bg-ink text-paper' : 'text-ink-faint hover:bg-paper-deep hover:text-ink'
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
                title={meta.label}
                className={`press inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? 'border border-clay-soft bg-clay-tint text-clay-ink'
                    : 'text-ink-soft hover:bg-paper-deep hover:text-ink'
                }`}
              >
                <MoodGlyph mood={m} className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{meta.label}</span>
              </button>
            )
          })}
        </div>

        {/* Active filter summary & clear */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5 text-[11.5px] text-ink-faint">
            <span>
              Showing {total} {total === 1 ? 'entry' : 'entries'} matching filters
            </span>
            <button
              type="button"
              onClick={clearFilters}
              className="press font-mono text-[11px] text-clay-ink underline underline-offset-2 hover:text-clay-deep"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Entries stream */}
      <div>
        {showEntriesSkeleton ? (
          <div className="divide-y divide-line border-y border-line">
            <EntryRowSkeleton />
            <EntryRowSkeleton />
            <EntryRowSkeleton />
          </div>
        ) : entriesQuery.isError ? (
          <div className="rounded-lg border border-line bg-paper-raised p-6 text-center">
            <p className="text-[13px] text-ember">
              {entriesQuery.error instanceof Error ? entriesQuery.error.message : "Couldn't load group entries."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="press mt-3 border-line"
              onClick={() => entriesQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong px-6 py-12 text-center">
            {hasActiveFilters ? (
              <>
                <Funnel weight="light" className="mx-auto h-7 w-7 text-ink-ghost" />
                <p className="font-display mt-3 text-lg text-ink">No entries match your filters</p>
                <p className="mx-auto mt-1.5 max-w-[42ch] text-[12.5px] text-ink-faint">
                  Try clearing or relaxing your author, time, mood, or search filters.
                </p>
                <Button variant="outline" size="sm" className="press mt-4 border-line" onClick={clearFilters}>
                  Clear filters
                </Button>
              </>
            ) : linkedNotebooksCount === 0 ? (
              <>
                <BookOpen weight="light" className="mx-auto h-7 w-7 text-ink-ghost" />
                <p className="font-display mt-3 text-lg text-ink">No notebooks linked yet</p>
                <p className="mx-auto mt-1.5 max-w-[44ch] text-[12.5px] leading-relaxed text-ink-faint">
                  Notebook owners can link notebooks to {group.name} from the notebook menu, or start a new notebook for
                  this circle right now.
                </p>
                <Button size="sm" className="press mt-4 gap-1.5 shadow-ink" onClick={handleComposeClick}>
                  <Plus weight="bold" className="h-3.5 w-3.5" />
                  Link or create notebook
                </Button>
              </>
            ) : (
              <>
                <BookOpen weight="light" className="mx-auto h-7 w-7 text-ink-ghost" />
                <p className="font-display mt-3 text-lg text-ink">The circle is quiet</p>
                <p className="mx-auto mt-1.5 max-w-[42ch] text-[12.5px] text-ink-faint">
                  Be the first to share an entry with {group.name}.
                </p>
                <Button size="sm" className="press mt-4 gap-1.5 shadow-ink" onClick={handleComposeClick}>
                  <PenNib weight="bold" className="h-3.5 w-3.5" />
                  Write the first entry
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            <ul className="divide-y divide-line border-y border-line" aria-busy={entriesQuery.isFetching}>
              {entries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  authorName={authorName(entry.author_id)}
                  notebookTitle={notebookTitleMap.get(entry.notebook_id) ?? null}
                  showPrivate={false}
                  onOpen={(e) =>
                    onNavigate({
                      kind: 'entry',
                      entryId: e.id,
                      notebookId: e.notebook_id,
                      fromGroup: group.id,
                    })
                  }
                />
              ))}
            </ul>

            {entriesQuery.hasNextPage && (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={entriesQuery.isFetchingNextPage}
                  className="press h-9 border-line bg-paper-raised"
                  onClick={() => entriesQuery.fetchNextPage()}
                >
                  {entriesQuery.isFetchingNextPage ? (
                    <>
                      <CircleNotch weight="bold" className="mr-1.5 h-3.5 w-3.5 animate-spin text-clay" />
                      Loading more…
                    </>
                  ) : (
                    'Load more entries'
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Link or Create Notebook Dialog */}
      <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
        <DialogContent className="max-w-md border-line bg-paper-raised">
          <DialogHeader>
            <DialogTitle className="font-display text-lg text-ink">Write in {group.name}</DialogTitle>
            <DialogDescription className="text-[12.5px] leading-relaxed text-ink-soft">
              Entries in Echoes belong to notebooks. Link an existing notebook to this group or start a dedicated one.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleLinkOrCreate} className="flex flex-col gap-4">
            {myUnlinkedNotebooks.length > 0 && (
              <div className="flex gap-2" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={modalMode === 'link'}
                  onClick={() => setModalMode('link')}
                  className={`press rounded-full px-3 py-1 text-[11.5px] font-medium ${
                    modalMode === 'link' ? 'bg-ink text-paper' : 'text-ink-faint hover:bg-paper-deep'
                  }`}
                >
                  Link existing notebook
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={modalMode === 'create'}
                  onClick={() => setModalMode('create')}
                  className={`press rounded-full px-3 py-1 text-[11.5px] font-medium ${
                    modalMode === 'create' ? 'bg-ink text-paper' : 'text-ink-faint hover:bg-paper-deep'
                  }`}
                >
                  Create new notebook
                </button>
              </div>
            )}

            {modalMode === 'create' ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-nb-title" className="text-[12.5px]">
                  Notebook name
                </Label>
                <Input
                  id="create-nb-title"
                  value={newNotebookTitle}
                  onChange={(e) => setNewNotebookTitle(e.target.value)}
                  placeholder={`${group.name} Notes`}
                  autoFocus
                  className="h-10 bg-paper"
                />
                <p className="text-[11.5px] text-ink-faint">
                  This notebook will be linked to {group.name} and shared with its members.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="select-unlinked-nb" className="text-[12.5px]">
                  Select notebook to link
                </Label>
                <Select value={selectedNotebookId} onValueChange={setSelectedNotebookId}>
                  <SelectTrigger id="select-unlinked-nb" className="h-10 bg-paper">
                    <SelectValue placeholder="Choose a notebook…" />
                  </SelectTrigger>
                  <SelectContent className="border-line bg-paper-raised">
                    {myUnlinkedNotebooks.map((nb) => (
                      <SelectItem key={nb.id} value={nb.id} className="text-[13px]">
                        {nb.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11.5px] text-ink-faint">
                  Its shared entries will immediately appear in {group.name}&apos;s journal.
                </p>
              </div>
            )}

            <DialogFooter className="mt-1 gap-2">
              <Button type="button" variant="ghost" onClick={() => setLinkModalOpen(false)} className="press h-9">
                Cancel
              </Button>
              <Button type="submit" disabled={busyModal} className="press h-9 gap-1.5 shadow-ink">
                {busyModal ? (
                  <>
                    <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" /> Saving…
                  </>
                ) : modalMode === 'create' ? (
                  'Create & Write'
                ) : (
                  'Link & Write'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
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
  initialTab = 'journal',
  onNavigate,
}: {
  selectedGroupId: string | null
  initialTab?: 'journal' | 'members' | 'sharing'
  onNavigate: (v: View) => void
}) {
  const { user } = useSession()
  const groups = useGroups()
  const detail = useGroup(selectedGroupId)
  const removeMember = useRemoveMember()
  const leave = useLeaveGroup()
  const removeGroup = useDeleteGroup()

  const [chosenTab, setChosenTab] = useState<'journal' | 'members' | 'sharing' | null>(null)
  const [prevGroupId, setPrevGroupId] = useState(selectedGroupId)
  const [renameOpen, setRenameOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (selectedGroupId !== prevGroupId) {
    setPrevGroupId(selectedGroupId)
    setChosenTab(null)
  }

  const activeTab = chosenTab ?? initialTab
  const setActiveTab = (tab: 'journal' | 'members' | 'sharing') => setChosenTab(tab)

  const group = detail.data ?? null
  const isOwner = group?.my_role === 'owner'
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
                Pick a group on the left to read its shared journal, see members, or manage who&apos;s in — or create
                one from the rail.
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

              {/* Group Tabs Navigation */}
              <div className="flex border-b border-line" role="tablist" aria-label="Group sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'journal'}
                  onClick={() => setActiveTab('journal')}
                  className={`press relative -mb-px flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors ${
                    activeTab === 'journal' ? 'border-b-2 border-clay text-ink' : 'text-ink-faint hover:text-ink'
                  }`}
                >
                  <BookOpen className="h-4 w-4" />
                  <span>Journal</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'members'}
                  onClick={() => setActiveTab('members')}
                  className={`press relative -mb-px flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors ${
                    activeTab === 'members' ? 'border-b-2 border-clay text-ink' : 'text-ink-faint hover:text-ink'
                  }`}
                >
                  <UsersThree className="h-4 w-4" />
                  <span>Members</span>
                  <span className="rounded-full bg-paper-deep px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                    {group.member_count}
                  </span>
                </button>
                {isOwner && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'sharing'}
                    onClick={() => setActiveTab('sharing')}
                    className={`press relative -mb-px flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors ${
                      activeTab === 'sharing' ? 'border-b-2 border-clay text-ink' : 'text-ink-faint hover:text-ink'
                    }`}
                  >
                    <LinkSimple className="h-4 w-4" />
                    <span>Sharing</span>
                  </button>
                )}
              </div>

              {/* Tab Contents */}
              <div className="pt-6">
                {activeTab === 'journal' && <GroupJournalTab group={group} onNavigate={onNavigate} />}

                {activeTab === 'members' && (
                  <section aria-label="Members">
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
                )}

                {activeTab === 'sharing' && isOwner && (
                  <section aria-label="Sharing">
                    <p className="pb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
                      Sharing & invite link
                    </p>
                    <SharingPanel key={group.id} group={group} />
                  </section>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ dialogs */}
      {group && (
        <>
          {renameOpen && <RenameGroupDialog key={group.id} group={group} onClose={() => setRenameOpen(false)} />}

          <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
            <AlertDialogContent className="border-line bg-paper-raised">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display text-lg text-ink">Leave {group.name}?</AlertDialogTitle>
                <AlertDialogDescription className="text-[12.5px] leading-relaxed text-ink-soft">
                  You lose access to notebooks shared with this group the moment you leave. You can only return through
                  a fresh invite link.
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
