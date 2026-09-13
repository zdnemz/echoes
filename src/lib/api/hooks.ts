'use client'

/**
 * TanStack Query hooks over the endpoint functions. Components consume
 * these; they never call fetch directly. Mutations invalidate precisely
 * (notebook-scoped entry queries, not everything).
 */

import { useMutation, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from './endpoints'
import type { Entry, Group, Invite, GroupDetail, Paginated } from './types'
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
      qc.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}

export function useDeleteNotebook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.deleteNotebook,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notebooks'] }),
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
      qc.invalidateQueries({ queryKey: ['notebooks'] })
      qc.invalidateQueries({ queryKey: ['search'] })
    },
  })
}

// ---------------------------------------------------------------- search

export function useSearch(term: string, page = 1, enabled = true) {
  const isEnabled = useAuthed() && enabled && term.trim().length > 0
  return useQuery({
    queryKey: ['search', term.trim().toLowerCase(), page],
    queryFn: () => api.searchEntries(term.trim(), page),
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
    mutationFn: ({ id, name }: { id: string; name: string }) => api.updateGroup(id, name),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      qc.invalidateQueries({ queryKey: ['notebooks'] })
      qc.removeQueries({ queryKey: ['group'] })
    },
  })
}

export function useRemoveMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) => api.removeMember(groupId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      qc.invalidateQueries({ queryKey: ['group'] })
      qc.invalidateQueries({ queryKey: ['notebooks'] })
    },
  })
}

export function useLeaveGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.leaveGroup,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      qc.invalidateQueries({ queryKey: ['notebooks'] })
      qc.removeQueries({ queryKey: ['group'] })
    },
  })
}

// ---------------------------------------------------------------- invites

export function useInvites(groupId: string | null, enabled = true) {
  const isEnabled = useAuthed() && groupId !== null && enabled
  return useQuery({
    queryKey: ['invites', groupId],
    queryFn: () => api.listInvites(groupId as string),
    enabled: isEnabled,
    retry: retryPolicy,
  })
}

export function useInviteInfo(token: string | null) {
  return useQuery({
    queryKey: ['invite', token],
    queryFn: () => api.inviteInfo(token as string),
    enabled: token !== null && token.length > 0,
    retry: (failureCount: number, error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return false
      return failureCount < 1
    },
  })
}

export function useCreateInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, ...input }: { groupId: string; email: string; expires_in_hours?: number }) =>
      api.createInvite(groupId, input),
    onSuccess: (invite: Invite) => qc.invalidateQueries({ queryKey: ['invites', invite.group_id] }),
  })
}

export function useRevokeInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.revokeInvite,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites'] }),
  })
}

export function useAcceptInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.acceptInvite,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      qc.invalidateQueries({ queryKey: ['notebooks'] })
    },
  })
}
