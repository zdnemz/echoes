'use client'

/**
 * TanStack Query hooks over the endpoint functions. Components consume
 * these; they never call fetch directly. Mutations invalidate precisely
 * (notebook-scoped entry queries, not everything).
 */

import { useMutation, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from './endpoints'
import type { Entry, Group, GroupDetail, Paginated } from './types'
import type { Mood } from '@/components/mood/glyphs'
import { useSession } from '@/lib/auth/session'
import { ApiError, isUnconfigured, isUnauthorized } from './client'

// ---------------------------------------------------------------- helpers

/** True when a session is active — a hook (calls useSession). */
function useAuthed() {
  return useSession().status === 'authenticated'
}

/** Don't retry unconfigured/auth errors — surface them immediately. */
const retryPolicy = (failureCount: number, error: unknown) => {
  if (isUnconfigured(error) || isUnauthorized(error)) return false
  return failureCount < 1
}

// ---------------------------------------------------------------- system

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: api.getHealth, staleTime: 15_000 })
}

// ---------------------------------------------------------------- notebooks

export function useNotebooks() {
  const enabled = useAuthed()
  return useQuery({
    queryKey: ['notebooks'],
    queryFn: () => api.listNotebooks({ limit: 100 }),
    enabled,
    retry: retryPolicy,
  })
}

export function useCreateNotebook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createNotebook,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notebooks'] }),
  })
}

export function useUpdateNotebook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; title?: string; group_id?: string | null }) =>
      api.updateNotebook(id, input),
    onSuccess: (nb) => {
      qc.invalidateQueries({ queryKey: ['notebooks'] })
      qc.invalidateQueries({ queryKey: ['entries', nb.id] })
      // A notebook can be linked to / unlinked from a group here, and group
      // journals are queried per group — scoping is impossible without the
      // group id, so refresh every group journal.
      qc.invalidateQueries({ queryKey: ['group-entries'] })
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}

export function useDeleteNotebook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteNotebook,
    onSuccess: () => {
      // Deleting a notebook deletes its entries, so every list that could
      // have contained them is now stale.
      qc.invalidateQueries({ queryKey: ['notebooks'] })
      qc.invalidateQueries({ queryKey: ['entries'] })
      qc.invalidateQueries({ queryKey: ['group-entries'] })
      qc.invalidateQueries({ queryKey: ['search'] })
    },
  })
}

// ---------------------------------------------------------------- entries

export function useEntries(notebookId: string | null, mood?: Mood) {
  const enabled = useAuthed() && notebookId !== null
  return useInfiniteQuery({
    queryKey: ['entries', notebookId, mood ?? 'all'],
    queryFn: ({ pageParam }) => api.listEntries(notebookId as string, { page: pageParam as number, mood }),
    initialPageParam: 1,
    getNextPageParam: (last: Paginated<Entry>) => {
      const { page, limit, total } = last.pagination
      return page * limit < total ? page + 1 : undefined
    },
    enabled,
    retry: retryPolicy,
    placeholderData: (prev) => prev,
  })
}

export function useEntry(id: string | null) {
  const enabled = useAuthed() && id !== null
  return useQuery({
    queryKey: ['entry', id],
    queryFn: () => api.getEntry(id as string),
    enabled,
    retry: retryPolicy,
  })
}

export function useCreateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ notebookId, ...input }: { notebookId: string } & Parameters<typeof api.createEntry>[1]) =>
      api.createEntry(notebookId, input),
    onSuccess: (entry) => {
      qc.invalidateQueries({ queryKey: ['entries', entry.notebook_id] })
      qc.invalidateQueries({ queryKey: ['group-entries'] })
      qc.invalidateQueries({ queryKey: ['notebooks'] })
    },
  })
}

export function useUpdateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Parameters<typeof api.updateEntry>[1]) =>
      api.updateEntry(id, input),
    onSuccess: (entry) => {
      qc.setQueryData(['entry', entry.id], entry)
      qc.invalidateQueries({ queryKey: ['entries', entry.notebook_id] })
      qc.invalidateQueries({ queryKey: ['group-entries'] })
      qc.invalidateQueries({ queryKey: ['search'] })
    },
  })
}

export function useDeleteEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteEntry,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entries'] })
      qc.invalidateQueries({ queryKey: ['group-entries'] })
      qc.invalidateQueries({ queryKey: ['notebooks'] })
      qc.invalidateQueries({ queryKey: ['search'] })
    },
  })
}

// ---------------------------------------------------------------- group journal

export interface GroupJournalFilters {
  author_id?: string
  mood?: Mood
  tags?: string
  q?: string
  since?: string
  until?: string
}

export function useGroupEntries(
  groupId: string | null,
  filters: GroupJournalFilters = {},
  streamStatus: 'live' | 'connecting' | 'offline' = 'live',
) {
  const enabled = useAuthed() && groupId !== null
  const { author_id, mood, tags, q, since, until } = filters
  return useInfiniteQuery({
    queryKey: ['group-entries', groupId, author_id ?? '', mood ?? '', tags ?? '', q ?? '', since ?? '', until ?? ''],
    queryFn: ({ pageParam }) =>
      api.listGroupEntries(groupId as string, {
        page: pageParam as number,
        author_id,
        mood,
        tags,
        q,
        since,
        until,
      }),
    initialPageParam: 1,
    getNextPageParam: (last: Paginated<Entry>) => {
      const { page, limit, total } = last.pagination
      return page * limit < total ? page + 1 : undefined
    },
    enabled,
    retry: retryPolicy,
    placeholderData: (prev) => prev,
    // Safety poll under the SSE stream: the stream pushes changes in ~2s,
    // so the poll only needs to catch a dropped connection. 60s while
    // live, 15s while reconnecting.
    refetchInterval: streamStatus === 'live' ? 60_000 : 15_000,
    refetchOnWindowFocus: true,
  })
}

export function useGroupViews(groupId: string | null) {
  const enabled = useAuthed() && groupId !== null
  return useQuery({
    queryKey: ['group-views', groupId],
    queryFn: () => api.listGroupViews(groupId as string),
    enabled,
    retry: retryPolicy,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  })
}

// ---------------------------------------------------------------- search

export function useSearch(term: string, enabled = true) {
  const normalized = term.trim()
  const isEnabled = useAuthed() && enabled && normalized.length > 0
  return useInfiniteQuery({
    // Keyed on the normalized term only: page is the cursor, and the previous
    // key included it, which would have made each page a separate cache entry.
    queryKey: ['search', normalized.toLowerCase()],
    queryFn: ({ pageParam }) => api.searchEntries(normalized, pageParam as number),
    initialPageParam: 1,
    // Continue while a full page came back. Using the page length rather than
    // the server's `total` keeps paging correct when entries are added or
    // deleted mid-scroll (a shrinking total used to truncate the list).
    getNextPageParam: (last: Paginated<Entry>) =>
      last.data.length === last.pagination.limit ? last.pagination.page + 1 : undefined,
    enabled: isEnabled,
    retry: retryPolicy,
    placeholderData: (prev) => prev,
  })
}

// ---------------------------------------------------------------- groups

export function useGroups() {
  const enabled = useAuthed()
  return useQuery({ queryKey: ['groups'], queryFn: api.listGroups, enabled, retry: retryPolicy })
}

export function useGroup(id: string | null) {
  const enabled = useAuthed() && id !== null
  return useQuery({
    queryKey: ['group', id],
    queryFn: () => api.getGroup(id as string),
    enabled,
    retry: retryPolicy,
  })
}

export function useCreateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createGroup,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  })
}

export function useUpdateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; auto_accept?: boolean; webhook_url?: string | null }) =>
      api.updateGroup(id, input),
    onSuccess: (g: GroupDetail) => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      qc.invalidateQueries({ queryKey: ['group', g.id] })
    },
  })
}

export function useDeleteGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteGroup,
    onSuccess: (_data, groupId) => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      qc.invalidateQueries({ queryKey: ['notebooks'] })
      // Scoped: query keys are prefix-matched, so ['group'] alone would evict
      // the detail cache of every other group too.
      qc.removeQueries({ queryKey: ['group', groupId] })
      qc.removeQueries({ queryKey: ['group-entries', groupId] })
      qc.removeQueries({ queryKey: ['group-members', groupId] })
      qc.removeQueries({ queryKey: ['invite-link', groupId] })
      qc.removeQueries({ queryKey: ['join-requests', groupId] })
    },
  })
}

export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) => api.removeMember(groupId, userId),
    onSuccess: (_data, { groupId }) => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      qc.invalidateQueries({ queryKey: ['group', groupId] })
      qc.invalidateQueries({ queryKey: ['group-members', groupId] })
      qc.invalidateQueries({ queryKey: ['notebooks'] })
    },
  })
}

export function useLeaveGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.leaveGroup,
    onSuccess: (_data, groupId) => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      qc.invalidateQueries({ queryKey: ['notebooks'] })
      // Same prefix-match caveat as useDeleteGroup.
      qc.removeQueries({ queryKey: ['group', groupId] })
      qc.removeQueries({ queryKey: ['group-entries', groupId] })
      qc.removeQueries({ queryKey: ['group-members', groupId] })
    },
  })
}

// ---------------------------------------------------------------- invites (link-based)

export function useInviteLink(groupId: string | null, enabled = true) {
  const isEnabled = useAuthed() && groupId !== null && enabled
  return useQuery({
    queryKey: ['invite-link', groupId],
    queryFn: () => api.getInviteLink(groupId as string),
    enabled: isEnabled,
    retry: retryPolicy,
  })
}

export function useRotateInviteLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, ...input }: { groupId: string; expires_in_hours?: number | null }) =>
      api.rotateInviteLink(groupId, input),
    onSuccess: (_link, { groupId }) => qc.invalidateQueries({ queryKey: ['invite-link', groupId] }),
  })
}

export function useRevokeInviteLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (groupId: string) => api.revokeInviteLink(groupId),
    onSuccess: (_v, groupId) => qc.invalidateQueries({ queryKey: ['invite-link', groupId] }),
  })
}

export function useLinkInfo(token: string | null) {
  return useQuery({
    queryKey: ['link', token],
    queryFn: () => api.linkInfo(token as string),
    enabled: token !== null && token.length > 0,
    retry: (failureCount: number, error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return false
      return failureCount < 1
    },
  })
}

export function useJoinViaLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.joinViaLink,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      qc.invalidateQueries({ queryKey: ['notebooks'] })
    },
  })
}

export function useJoinRequests(groupId: string | null, enabled = true) {
  const isEnabled = useAuthed() && groupId !== null && enabled
  return useQuery({
    queryKey: ['join-requests', groupId],
    queryFn: () => api.listJoinRequests(groupId as string),
    enabled: isEnabled,
    retry: retryPolicy,
  })
}

export function useDecideJoinRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      groupId,
      requestId,
      decision,
    }: {
      groupId: string
      requestId: string
      decision: 'approved' | 'denied'
    }) => api.decideJoinRequest(groupId, requestId, decision),
    onSuccess: (_r, { groupId }) => {
      qc.invalidateQueries({ queryKey: ['join-requests', groupId] })
      qc.invalidateQueries({ queryKey: ['group', groupId] })
      // Approving adds a member, and member names label entry rows.
      qc.invalidateQueries({ queryKey: ['group-members', groupId] })
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}
