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
  Checks,
  CircleNotch,
  Clock,
  Copy,
  Funnel,
  LinkSimple,
  MagnifyingGlass,
  PaperPlaneTilt,
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
import { useDecryptedPreviews } from '@/lib/crypto/use-previews'
import { QueryError } from '@/components/query-error'
import { useSession } from '@/lib/auth/session'
import {
  useCreateNotebook,
  useCreateEntry,
  useDecideJoinRequest,
  useDeleteGroup,
  useGroup,
  useGroupEntries,
  useGroups,
  useGroupViews,
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
import { useCopy } from '@/hooks/use-copy'
import { getGroupLayout, type GroupLayout } from '@/lib/prefs'
import { useGroupRealtime } from '@/hooks/use-group-realtime'
import { useDebouncedValue, useMinuteTick } from '@/hooks/use-debounced-value'
import { useRovingSelection } from '@/hooks/use-roving-selection'
import { avatarTone, excerpt, formatDay, formatStamp, initials } from '@/lib/format'
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
  const [error, setError] = useState<string | null>(null)
  const [webhookDraft, setWebhookDraft] = useState<string | null>(null)
  const webhookUrl = webhookDraft ?? (group.webhook_url || '')

  const saveWebhook = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmed = webhookUrl.trim()
    try {
      await update.mutateAsync({
        id: group.id,
        webhook_url: trimmed || null,
      })
      setWebhookDraft(null)
      toast.success(trimmed ? 'Webhook URL saved.' : 'Webhook removed.')
    } catch (err) {
      fail(err, "Couldn't save webhook URL.")
    }
  }

  // Only a hash is stored server-side, so a freshly minted link is shown
  // exactly once. Hold the one we just created; it disappears on reload.
  const [freshUrl, setFreshUrl] = useState<string | null>(null)

  const fail = (err: unknown, fallback: string) => {
    if (isUnconfigured(err)) setError("The data layer isn't connected on this deployment.")
    else setError(err instanceof Error ? err.message : fallback)
  }

  const { copied, copy } = useCopy({
    onError: () => setError("Couldn't copy — select the link and copy it manually."),
  })

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

  // The server returns a site-relative URL; make it pasteable.
  const absoluteUrl = (url: string) => (url.startsWith('http') ? url : window.location.origin + url)

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
                onClick={() => void copy(absoluteUrl(freshUrl))}
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

      {/* notification webhook */}
      <div className="border-t border-line pt-6">
        <div>
          <p className="text-[13.5px] font-medium text-ink">Notification webhook</p>
          <p className="mt-0.5 text-[12.5px] text-ink-faint">
            Receive event notifications in Discord, Slack, or any webhook URL when users ask to join, join, leave, or
            read messages.
          </p>
        </div>
        <form onSubmit={saveWebhook} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookDraft(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="h-10 flex-1 bg-paper font-mono text-[12px]"
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={update.isPending || webhookUrl === (group.webhook_url || '')}
              className="press h-10 shadow-ink"
            >
              {update.isPending ? 'Saving…' : 'Save webhook'}
            </Button>
            {group.webhook_url && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={update.isPending}
                onClick={async () => {
                  setWebhookDraft(null)
                  try {
                    await update.mutateAsync({ id: group.id, webhook_url: null })
                    toast.success('Webhook removed.')
                  } catch (err) {
                    fail(err, "Couldn't remove webhook.")
                  }
                }}
                className="press h-10 text-ember hover:bg-ember-tint hover:text-ember"
              >
                Remove
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

// --------------------------------------------------------------- group journal tab

type TimePreset = 'all' | 'today' | 'week' | 'month' | 'custom'

function getTimeBounds(preset: TimePreset, customSince: string, customUntil: string, nowMs: number) {
  if (preset === 'today') {
    const start = new Date(nowMs)
    start.setHours(0, 0, 0, 0)
    return { since: start.toISOString(), until: undefined }
  }
  if (preset === 'week') {
    const start = new Date(nowMs - 7 * 24 * 3600_000)
    return { since: start.toISOString(), until: undefined }
  }
  if (preset === 'month') {
    const start = new Date(nowMs - 30 * 24 * 3600_000)
    return { since: start.toISOString(), until: undefined }
  }
  if (preset === 'custom') {
    const since = customSince ? new Date(customSince + 'T00:00:00').toISOString() : undefined
    const until = customUntil ? new Date(customUntil + 'T23:59:59').toISOString() : undefined
    return { since, until }
  }
  return { since: undefined, until: undefined }
}

function GroupJournalTab({
  group,
  onNavigate,
  realtime,
}: {
  group: GroupDetail
  onNavigate: (v: View) => void
  realtime: ReturnType<typeof useGroupRealtime>
}) {
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
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false)
  // The input stays instant; the query only sees the settled term so typing
  // does not fire one request per keystroke.
  const searchQuery = useDebouncedValue(searchInput, 300)

  // Link/compose dialog state
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [newNotebookTitle, setNewNotebookTitle] = useState(`${group.name} Notes`)
  const [selectedNotebookId, setSelectedNotebookId] = useState('')
  const [modalMode, setModalMode] = useState<'create' | 'link'>('create')
  const [busyModal, setBusyModal] = useState(false)
  const modalTabs = useRovingSelection({
    values: ['link', 'create'] as const,
    selected: modalMode,
    onSelect: setModalMode,
  })

  // Relative presets ("today", "past 7 days"…) are computed from `Date.now()`,
  // so they must be re-derived as time passes — otherwise a tab left open
  // across midnight keeps filtering on yesterday's window.
  const nowMs = useMinuteTick(timePreset === 'today' || timePreset === 'week' || timePreset === 'month')

  // Memoized time bounds
  const { since, until } = useMemo(
    () => getTimeBounds(timePreset, customSince, customUntil, nowMs),
    [timePreset, customSince, customUntil, nowMs],
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

  const entriesQuery = useGroupEntries(group.id, filters, realtime.status)
  const entries = useMemo(() => entriesQuery.data?.pages.flatMap((p) => p.data) ?? [], [entriesQuery.data])
  const total = entriesQuery.data?.pages[0]?.pagination.total ?? 0

  // E2EE: open sealed rows for display (group wrap via the group CEK).
  const previews = useDecryptedPreviews(entries, user?.id, () => group.id)
  // The layout preference is local-only; mirror it so changing it in Settings
  // (same tab session) is picked up on the next mount of this tab.
  const [layout] = useState<GroupLayout>(() => getGroupLayout())
  // Chat shows oldest at top — the API returns newest first, so reverse once.
  const chatEntries = useMemo(() => (layout === 'chat' ? [...entries].reverse() : []), [layout, entries])

  // Quick composer — only when exactly one linked notebook exists, so the
  // target is unambiguous. Otherwise fall back to the link/create dialog.
  const createEntry = useCreateEntry()
  const [quickText, setQuickText] = useState('')
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' })
  }, [group.id, chatEntries.length])

  // `placeholderData: (prev) => prev` keeps the previous filter's rows on
  // screen while a new filter loads, which also flips isPending to false.
  // Treat "stale rows still on screen + fetching" as loading so the skeleton
  // shows instead of a result set that is about to be replaced.
  const showEntriesSkeleton = entriesQuery.isLoading || (entriesQuery.isPlaceholderData && entriesQuery.isFetching)

  // Resolve author names for chat bubbles
  const authorName = (aId: string) => {
    if (aId === user?.id) return null
    const m = group.members.find((member) => member.user_id === aId)
    return m?.display_name || m?.email || 'a member'
  }

  // Durable read receipts (entry_views): blue ticks mean someone OPENED the
  // entry's detail view, not merely had the chat on screen.
  const viewsQuery = useGroupViews(group.id)
  const viewsByEntry = useMemo(() => {
    const map = new Map<string, Array<{ user_id: string; display_name: string | null }>>()
    for (const v of viewsQuery.data ?? []) {
      const list = map.get(v.entry_id) ?? []
      list.push({ user_id: v.user_id, display_name: v.display_name })
      map.set(v.entry_id, list)
    }
    return map
  }, [viewsQuery.data])
  const entryReaders = (entryId: string) => (viewsByEntry.get(entryId) ?? []).filter((r) => r.user_id !== user?.id)

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
  const quickTarget = myLinkedNotebooks.length === 1 ? myLinkedNotebooks[0] : null

  // Live stream: push on new messages + typing/seen presence (provided by GroupsView).
  const selfName = user?.display_name || user?.email || 'Someone'
  const latestId = chatEntries.length > 0 ? chatEntries[chatEntries.length - 1].id : null
  useEffect(() => {
    if (layout === 'chat' && latestId && document.visibilityState === 'visible') realtime.sendSeen(latestId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestId, group.id, layout])
  const myLast = [...chatEntries].reverse().find((e) => e.author_id === user?.id) ?? null
  const seenBy =
    myLast === null
      ? []
      : realtime.seen
          .filter((s) => s.entry_id === myLast.id)
          .map((s) => group.members.find((m) => m.user_id === s.user_id)?.display_name || 'Someone')

  const sendQuick = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = quickText.trim()
    if (!body || !quickTarget || createEntry.isPending) return
    try {
      await createEntry.mutateAsync({
        notebookId: quickTarget.id,
        title: body.split('\n')[0].slice(0, 80) || 'Quick note',
        body,
        is_shared: true,
      })
      setQuickText('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send.")
    }
  }

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

  /**
   * Linking a notebook is only half the job: shared entries are sealed under
   * the group CEK, which does not exist until someone distributes it. The
   * notebook's own Share dialog does this; skipping it here left
   * getGroupCek() returning null and every shared save throwing
   * "no group key available".
   */
  const distributeGroupKey = async (groupId: string) => {
    try {
      const { distributeOrRotate } = await import('@/lib/crypto/group-keys')
      await distributeOrRotate(groupId, user?.id ?? '')
    } catch {
      // Members without published keys can't be sealed for yet. Best-effort:
      // the save path degrades to author-only and says so.
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
        await distributeGroupKey(group.id)
        setLinkModalOpen(false)
        onNavigate({ kind: 'compose', notebookId: created.id, fromGroup: group.id })
      } else {
        if (!selectedNotebookId) return
        await updateNotebook.mutateAsync({ id: selectedNotebookId, group_id: group.id })
        await distributeGroupKey(group.id)
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
    <div className="flex-1 flex flex-col min-h-0 h-full overflow-hidden lg:h-auto lg:overflow-visible lg:space-y-6">
      {/* Action header bar — desktop only */}
      <div className="hidden lg:flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display flex items-center gap-2 text-lg text-ink">
            Group Journal
            <span
              title={realtime.status === 'live' ? 'Live — new messages arrive automatically' : 'Connecting…'}
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wide ${
                realtime.status === 'live' ? 'bg-sage-tint text-sage' : 'bg-paper-deep text-ink-faint'
              }`}
            >
              <span className="relative flex h-1.5 w-1.5">
                {realtime.status === 'live' && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                    realtime.status === 'live' ? 'bg-sage' : 'bg-ink-ghost'
                  }`}
                />
              </span>
              {realtime.status === 'live' ? 'live' : '…'}
            </span>
          </h3>
          <p className="text-[12.5px] text-ink-soft">Entries shared across all notebooks linked to {group.name}.</p>
        </div>
        <Button size="sm" className="press h-9 gap-1.5 shadow-ink" onClick={handleComposeClick}>
          <PenNib weight="bold" className="h-3.5 w-3.5" />
          Write entry
        </Button>
      </div>

      {/* Mobile quick control bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-line bg-paper-raised/80 px-3 py-2 text-[12px] lg:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileFilterOpen((o) => !o)}
            aria-label="Filter messages"
            className={`press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors ${
              hasActiveFilters
                ? 'bg-clay-tint text-clay-ink font-semibold'
                : mobileFilterOpen
                  ? 'bg-ink text-paper'
                  : 'bg-paper-deep text-ink-soft hover:text-ink'
            }`}
          >
            <Funnel className="h-3.5 w-3.5" />
            <span>{hasActiveFilters ? `${total} filtered` : 'Filter'}</span>
          </button>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="press font-mono text-[10.5px] text-clay underline underline-offset-2"
            >
              Clear
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleComposeClick}
          className="press inline-flex items-center gap-1 rounded-full bg-paper-deep px-2.5 py-1 font-mono text-[11px] text-ink-soft hover:text-ink"
        >
          <PenNib weight="bold" className="h-3 w-3" />
          <span>Write</span>
        </button>
      </div>

      {/* Filter panel */}
      <div
        className={`${
          mobileFilterOpen ? 'block' : 'hidden'
        } lg:block shrink-0 space-y-3 rounded-none lg:rounded-lg border-b lg:border border-line bg-paper-raised p-3.5 sm:p-4`}
      >
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

      {/* Roomchat stream */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden lg:overflow-visible">
        {showEntriesSkeleton ? (
          <div className="flex-1 p-4 divide-y divide-line border-y border-line">
            <EntryRowSkeleton />
            <EntryRowSkeleton />
            <EntryRowSkeleton />
          </div>
        ) : entriesQuery.isError ? (
          <div className="flex-1 p-4">
            <QueryError
              error={entriesQuery.error}
              fallback="Couldn't load group entries."
              onRetry={() => entriesQuery.refetch()}
            />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center rounded-none lg:rounded-lg border-0 lg:border border-dashed border-line-strong px-6 py-12 text-center my-auto">
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
        ) : layout === 'list' ? (
          <div className="flex-1">
            {entriesQuery.hasNextPage && (
              <div className="flex justify-center border-b border-line bg-paper-raised/60 px-4 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={entriesQuery.isFetchingNextPage}
                  className="press h-7 text-[11.5px] text-ink-soft"
                  onClick={() => entriesQuery.fetchNextPage()}
                >
                  {entriesQuery.isFetchingNextPage ? 'Loading more…' : 'Older entries'}
                </Button>
              </div>
            )}
            <ul className="divide-y divide-line border-b border-line" aria-busy={entriesQuery.isFetching}>
              {entries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  authorName={authorName(entry.author_id)}
                  preview={previews[entry.id]}
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
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-none lg:rounded-xl border-0 lg:border border-line bg-paper">
            {entriesQuery.hasNextPage && (
              <div className="shrink-0 flex justify-center border-b border-line bg-paper-raised/60 px-4 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={entriesQuery.isFetchingNextPage}
                  className="press h-7 text-[11.5px] text-ink-soft"
                  onClick={() => entriesQuery.fetchNextPage()}
                >
                  {entriesQuery.isFetchingNextPage ? (
                    <>
                      <CircleNotch weight="bold" className="mr-1.5 h-3.5 w-3.5 animate-spin text-clay" />
                      Loading older…
                    </>
                  ) : (
                    'Load older messages'
                  )}
                </Button>
              </div>
            )}

            <ul
              className="flex-1 overflow-y-auto px-3 py-4 space-y-3.5 sm:px-5 overscroll-contain min-h-0"
              aria-busy={entriesQuery.isFetching}
              aria-label="Group messages"
            >
              {chatEntries.map((entry, i) => {
                const mine = entry.author_id === user?.id
                const prev = chatEntries[i - 1]
                const showDay = !prev || formatDay(prev.created_at) !== formatDay(entry.created_at)
                const tone = avatarTone(entry.author_id)
                const name = mine ? 'You' : (authorName(entry.author_id) ?? 'a member')
                return (
                  <li key={entry.id}>
                    {showDay && (
                      <p className="mb-3 mt-1 text-center font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint first:mt-0">
                        {formatDay(entry.created_at)}
                      </p>
                    )}
                    <div className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                      {!mine && (
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-semibold"
                          style={{ background: tone.bg, color: tone.fg }}
                          aria-hidden="true"
                        >
                          {initials(authorName(entry.author_id), '·')}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          onNavigate({
                            kind: 'entry',
                            entryId: entry.id,
                            notebookId: entry.notebook_id,
                            fromGroup: group.id,
                          })
                        }
                        title="Open full entry"
                        className={`press block max-w-[85%] px-3.5 py-2.5 text-left shadow-sm transition-colors sm:max-w-[75%] ${
                          mine
                            ? 'rounded-2xl rounded-br-md bg-ink text-paper hover:bg-ink/90'
                            : 'rounded-2xl rounded-bl-md border border-line bg-paper-raised text-ink hover:border-line-strong'
                        }`}
                      >
                        {!mine && (
                          <p className="truncate text-[11px] font-semibold" style={{ color: tone.fg }}>
                            {name}
                          </p>
                        )}
                        {entry.title && (
                          <p className={`mt-0.5 text-[13.5px] font-semibold leading-snug ${mine ? '' : ''}`}>
                            {entry.title}
                          </p>
                        )}
                        {entry.body.trim().length > 0 && (
                          <p
                            className={`mt-0.5 line-clamp-4 whitespace-pre-wrap text-[13.5px] leading-relaxed ${
                              mine ? 'text-paper/90' : 'text-ink-soft'
                            }`}
                          >
                            {excerpt(entry.body, 280)}
                          </p>
                        )}
                        <span
                          className={`mt-1.5 flex items-center gap-2 text-[10.5px] ${
                            mine ? 'justify-end text-paper/70' : 'text-ink-faint'
                          }`}
                        >
                          {entry.mood && (
                            <span className="inline-flex items-center gap-1">
                              <MoodGlyph mood={entry.mood} className="h-3 w-3" />
                            </span>
                          )}
                          {entry.tags.slice(0, 3).map((t) => (
                            <span key={t} className="font-mono">
                              #{t}
                            </span>
                          ))}
                          <span className="ml-auto inline-flex items-center gap-1 font-mono">
                            <span>{formatStamp(entry.created_at)}</span>
                            {mine &&
                              (() => {
                                const readers = entryReaders(entry.id)
                                const names = readers.map((r) => r.display_name || 'Someone').join(', ')
                                return readers.length > 0 ? (
                                  <span
                                    className="inline-flex items-center gap-0.5 text-sky-300 font-sans text-[9.5px]"
                                    title={`Dibaca oleh: ${names}`}
                                  >
                                    <Checks weight="bold" className="h-3.5 w-3.5" />
                                    <span>
                                      {readers.length === 1 ? readers[0].display_name || '1' : readers.length}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center text-paper/40" title="Terkirim">
                                    <Checks weight="regular" className="h-3.5 w-3.5" />
                                  </span>
                                )
                              })()}
                          </span>
                        </span>
                      </button>
                    </div>
                  </li>
                )
              })}
              <div ref={chatEndRef} />
            </ul>

            {/* Quick composer */}
            <div className="shrink-0 border-t border-line bg-paper-raised/95 backdrop-blur-md px-3 py-2.5 sm:px-4 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
              {/* typing peers */}
              <div aria-live="polite" className="min-h-5 px-1 pb-1">
                {realtime.typing.length > 0 && (
                  <p className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
                    <span className="flex gap-0.5" aria-hidden="true">
                      <span className="h-1 w-1 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.2s]" />
                      <span className="h-1 w-1 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.1s]" />
                      <span className="h-1 w-1 animate-bounce rounded-full bg-ink-faint" />
                    </span>
                    {realtime.typing.map((t) => t.name).join(', ')} {realtime.typing.length === 1 ? 'is' : 'are'}{' '}
                    typing…
                  </p>
                )}
              </div>
              {quickTarget ? (
                <form onSubmit={sendQuick} className="flex items-end gap-2">
                  <input
                    value={quickText}
                    onChange={(e) => {
                      setQuickText(e.target.value)
                      if (e.target.value.trim()) realtime.sendTyping(selfName)
                    }}
                    placeholder={`Message ${group.name}… (Enter to send)`}
                    aria-label={`Message ${group.name}`}
                    className="min-h-10 max-h-28 flex-1 rounded-xl border border-line bg-paper px-3.5 py-2 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-clay-soft focus:outline-none focus:ring-2 focus:ring-clay-soft/40"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) void sendQuick(e as unknown as React.FormEvent)
                    }}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!quickText.trim() || createEntry.isPending}
                    className="press h-10 w-10 shrink-0 rounded-xl shadow-ink"
                    aria-label="Send message"
                  >
                    <PaperPlaneTilt weight="fill" className="h-4 w-4" />
                  </Button>
                </form>
              ) : (
                <Button size="sm" className="press h-10 w-full gap-1.5 shadow-ink" onClick={handleComposeClick}>
                  <PenNib weight="bold" className="h-3.5 w-3.5" />
                  Link or create notebook to message
                </Button>
              )}
              <p className="mt-1 text-center font-mono text-[9.5px] text-ink-faint">
                {quickTarget
                  ? `Posting to ${quickTarget.title} · live${seenBy.length > 0 ? ` · seen by ${seenBy.join(', ')}` : ''}.`
                  : 'Choose a notebook to post from.'}
              </p>
            </div>
          </div>
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
              <div className="flex gap-2" role="tablist" aria-label="Notebook source" onKeyDown={modalTabs.onKeyDown}>
                <button
                  ref={modalTabs.registerItem('link')}
                  type="button"
                  role="tab"
                  id="link-nb-tab-link"
                  aria-controls="link-nb-panel"
                  aria-selected={modalMode === 'link'}
                  tabIndex={modalTabs.tabIndexFor('link')}
                  onClick={() => setModalMode('link')}
                  className={`press rounded-full px-3 py-1 text-[11.5px] font-medium ${
                    modalMode === 'link' ? 'bg-ink text-paper' : 'text-ink-faint hover:bg-paper-deep'
                  }`}
                >
                  Link existing notebook
                </button>
                <button
                  ref={modalTabs.registerItem('create')}
                  type="button"
                  role="tab"
                  id="link-nb-tab-create"
                  aria-controls="link-nb-panel"
                  aria-selected={modalMode === 'create'}
                  tabIndex={modalTabs.tabIndexFor('create')}
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
              <div
                role="tabpanel"
                id="link-nb-panel"
                aria-labelledby="link-nb-tab-create"
                className="flex flex-col gap-2"
              >
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
              <div
                role="tabpanel"
                id="link-nb-panel"
                aria-labelledby="link-nb-tab-link"
                className="flex flex-col gap-2"
              >
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
          {/* Radix warns (and screen readers get a dangling reference)
              when a dialog has no description. */}
          <DialogDescription className="sr-only">
            Change this group&apos;s name. Members see the new name immediately.
          </DialogDescription>
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
  const removeMember = useRemoveMember()
  const leave = useLeaveGroup()
  const removeGroup = useDeleteGroup()
  const realtime = useGroupRealtime(selectedGroupId)

  // The tab choice is remembered *with the group it was made for*, so
  // switching groups falls back to the default without a render-phase setState
  // (React's documented escape hatch; it discards the render and is fragile
  // under concurrent rendering).
  const [tabChoice, setTabChoice] = useState<{ groupId: string | null; tab: 'journal' | 'members' | 'sharing' } | null>(
    null,
  )
  const [renameOpen, setRenameOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const activeTab = tabChoice && tabChoice.groupId === selectedGroupId ? tabChoice.tab : 'journal'
  const setActiveTab = (tab: 'journal' | 'members' | 'sharing') => setTabChoice({ groupId: selectedGroupId, tab })

  const group = detail.data ?? null
  const isOwner = group?.my_role === 'owner'
  const list = groups.data ?? []

  // A newer device of mine may still be missing this group's key (it was
  // sealed before that device existed). If I hold the key here, hand it over
  // silently — one background write, no prompt, no rotation.
  const coveredFor = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedGroupId || !user || coveredFor.current === selectedGroupId) return
    coveredFor.current = selectedGroupId
    void import('@/lib/crypto/group-keys')
      .then(({ ensureDeviceCoverage }) => ensureDeviceCoverage(selectedGroupId, user.id))
      .catch(() => {
        coveredFor.current = null // retry on the next visit
      })
  }, [selectedGroupId, user])

  // Sharing is owner-only, so it must not be an arrow-key destination for
  // members.
  const sectionTabs = (isOwner ? ['journal', 'members', 'sharing'] : ['journal', 'members']) as Array<
    'journal' | 'members' | 'sharing'
  >
  const tabKeys = useRovingSelection({ values: sectionTabs, selected: activeTab, onSelect: setActiveTab })

  return (
    <div className={selectedGroupId ? 'lg:mx-0' : 'mx-4 lg:mx-0'}>
      <div className={`flex items-center gap-4 ${selectedGroupId ? 'hidden lg:flex' : 'flex'}`}>
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

      <div className={`grid gap-10 lg:grid-cols-[13rem_1fr] lg:gap-12 ${selectedGroupId ? 'mt-0 lg:mt-8' : 'mt-8'}`}>
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
        <div
          className={
            selectedGroupId
              ? 'fixed inset-0 z-40 flex flex-col bg-paper h-[100dvh] lg:static lg:inset-auto lg:z-auto lg:h-auto lg:min-w-0 lg:flex-none'
              : 'min-w-0'
          }
        >
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
              <div className="flex-1 flex flex-col h-full p-4 lg:p-0 space-y-3">
                <div className="flex items-center gap-3 border-b border-line pb-3 lg:hidden">
                  <button
                    type="button"
                    onClick={() => onNavigate({ kind: 'groups' })}
                    className="press rounded-md p-1.5 text-ink-soft"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="skeleton-line h-5 w-32" />
                </div>
                <div className="skeleton-line h-8 w-44" />
                <div className="skeleton-line h-9 w-full" />
                <div className="skeleton-line h-9 w-full" />
              </div>
            ) : (
              <div className="flex-1 p-4 lg:p-0">
                <div className="flex items-center gap-3 border-b border-line pb-3 mb-4 lg:hidden">
                  <button
                    type="button"
                    onClick={() => onNavigate({ kind: 'groups' })}
                    className="press rounded-md p-1.5 text-ink-soft"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <span className="text-[14px] font-medium text-ink">Back to groups</span>
                </div>
                <QueryError
                  error={detail.error}
                  fallback="Couldn't load this group."
                  onRetry={() => detail.refetch()}
                />
              </div>
            )
          ) : (
            <div className="flex-1 flex flex-col min-h-0 h-full lg:h-auto">
              {/* mobile topbar — fullscreen chatroom bar */}
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-paper/95 px-3 backdrop-blur-md pt-[env(safe-area-inset-top)] lg:hidden">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => onNavigate({ kind: 'groups' })}
                    className="press -ml-1 rounded-md p-1.5 text-ink-soft hover:bg-paper-deep hover:text-ink"
                    aria-label="Back to all groups"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div
                    onClick={() => setActiveTab(activeTab === 'journal' ? 'members' : 'journal')}
                    className="cursor-pointer min-w-0"
                  >
                    <h2 className="truncate text-[15px] font-semibold leading-tight text-ink">{group.name}</h2>
                    <p className="flex items-center gap-1.5 font-mono text-[10px] text-ink-faint">
                      <span>
                        {group.member_count} {group.member_count === 1 ? 'member' : 'members'}
                      </span>
                      <span>·</span>
                      <span className="capitalize">{group.my_role}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab(activeTab === 'journal' ? 'members' : 'journal')}
                    aria-label={activeTab === 'journal' ? 'View members' : 'Back to chat'}
                    className={`press rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                      activeTab === 'journal' ? 'bg-paper-deep text-ink-soft hover:text-ink' : 'bg-clay text-white'
                    }`}
                  >
                    {activeTab === 'journal' ? 'Members' : 'Chat'}
                  </button>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => setActiveTab(activeTab === 'sharing' ? 'journal' : 'sharing')}
                      aria-label="Sharing settings"
                      className={`press rounded-md p-1.5 transition-colors ${
                        activeTab === 'sharing' ? 'bg-clay text-white' : 'text-ink-soft hover:bg-paper-deep'
                      }`}
                    >
                      <LinkSimple className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* desktop header */}
              <div className="hidden lg:block">
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
                <div
                  className="flex border-b border-line"
                  role="tablist"
                  aria-label="Group sections"
                  onKeyDown={tabKeys.onKeyDown}
                >
                  <button
                    ref={tabKeys.registerItem('journal')}
                    type="button"
                    role="tab"
                    id="group-tab-journal"
                    aria-controls="group-panel-journal"
                    aria-selected={activeTab === 'journal'}
                    tabIndex={tabKeys.tabIndexFor('journal')}
                    onClick={() => setActiveTab('journal')}
                    className={`press relative -mb-px flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors ${
                      activeTab === 'journal' ? 'border-b-2 border-clay text-ink' : 'text-ink-faint hover:text-ink'
                    }`}
                  >
                    <BookOpen className="h-4 w-4" />
                    <span>Journal</span>
                  </button>
                  <button
                    ref={tabKeys.registerItem('members')}
                    type="button"
                    role="tab"
                    id="group-tab-members"
                    aria-controls="group-panel-members"
                    aria-selected={activeTab === 'members'}
                    tabIndex={tabKeys.tabIndexFor('members')}
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
                      ref={tabKeys.registerItem('sharing')}
                      type="button"
                      role="tab"
                      id="group-tab-sharing"
                      aria-controls="group-panel-sharing"
                      aria-selected={activeTab === 'sharing'}
                      tabIndex={tabKeys.tabIndexFor('sharing')}
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
              </div>

              {/* Tab Contents */}
              <div
                className={
                  activeTab === 'journal'
                    ? 'flex-1 flex flex-col min-h-0 overflow-hidden lg:pt-6 lg:overflow-visible'
                    : 'flex-1 overflow-y-auto p-4 lg:p-0 lg:pt-6'
                }
                role="tabpanel"
                id={`group-panel-${activeTab}`}
                aria-labelledby={`group-tab-${activeTab}`}
                tabIndex={0}
              >
                {activeTab === 'journal' && (
                  <GroupJournalTab group={group} onNavigate={onNavigate} realtime={realtime} />
                )}

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
                                      onSuccess: () => {
                                        toast.success(
                                          `${m.display_name ?? 'Member'} removed — their access is gone immediately.`,
                                        )
                                        // E2EE: rotate the group CEK so the removed member's
                                        // key dies. Best-effort — a missed rotation surfaces as
                                        // a "rotate keys" hint, entries stay sealed regardless.
                                        void import('@/lib/crypto/group-keys')
                                          .then(({ distributeOrRotate }) =>
                                            distributeOrRotate(group.id, user?.id ?? ''),
                                          )
                                          .catch(() =>
                                            toast(
                                              'Rotate the group key from the sharing panel to lock them out of new entries.',
                                            ),
                                          )
                                      },
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
