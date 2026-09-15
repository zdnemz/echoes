'use client'

/**
 * Typed wrappers over every API endpoint the frontend uses.
 * One function per operation — hooks and components never build URLs.
 */

import { api, json } from './client'
import type {
  CreateEntryInput,
  CreateNotebookInput,
  Entry,
  Group,
  GroupDetail,
  GroupMember,
  Health,
  InviteLink,
  JoinRequest,
  JoinResult,
  LinkInfo,
  LoginInput,
  Notebook,
  Paginated,
  Session,
  SignUpInput,
  UpdateEntryInput,
  UpdateNotebookInput,
} from './types'
import type { Mood } from '@/components/mood/glyphs'

// ----------------------------------------------------------------- system

export const getHealth = () => api<Health>('/api/health')

// ----------------------------------------------------------------- auth

export const signUp = (input: SignUpInput) =>
  api<Session | null>('/api/auth/signup', { method: 'POST', ...json(input) })

export const login = (input: LoginInput) => api<Session>('/api/auth/login', { method: 'POST', ...json(input) })

export const requestMagicLink = (email: string, redirectTo?: string) =>
  api<{ message: string; dev_link: string | null }>('/api/auth/magic-link', {
    method: 'POST',
    ...json({ email, ...(redirectTo ? { redirect_to: redirectTo } : {}) }),
  })

export const getMe = () => api<Session['user']>('/api/auth/me')

export const updateProfile = (displayName: string) =>
  api<Session['user'] & { email: string }>('/api/auth/profile', {
    method: 'PATCH',
    ...json({ display_name: displayName }),
  })

export const logout = () => api<{ message: string }>('/api/auth/logout', { method: 'POST' })

export const updatePassword = (password: string) =>
  api<{ message: string }>('/api/auth/password', { method: 'POST', ...json({ password }) })

// ----------------------------------------------------------------- notebooks

export interface ListNotebooksParams {
  page?: number
  limit?: number
}

export const listNotebooks = (params: ListNotebooksParams = {}) => {
  const q = new URLSearchParams()
  q.set('page', String(params.page ?? 1))
  q.set('limit', String(params.limit ?? 50))
  return api<Paginated<Notebook>>(`/api/notebooks?${q}`)
}

export const createNotebook = (input: CreateNotebookInput) =>
  api<Notebook>('/api/notebooks', { method: 'POST', ...json(input) })

export const updateNotebook = (id: string, input: UpdateNotebookInput) =>
  api<Notebook>(`/api/notebooks/${id}`, { method: 'PATCH', ...json(input) })

export const deleteNotebook = (id: string) => api<void>(`/api/notebooks/${id}`, { method: 'DELETE' })

// ----------------------------------------------------------------- entries

export interface ListEntriesParams {
  page?: number
  limit?: number
  mood?: Mood
}

export const listEntries = (notebookId: string, params: ListEntriesParams = {}) => {
  const q = new URLSearchParams()
  q.set('page', String(params.page ?? 1))
  q.set('limit', String(params.limit ?? 20))
  if (params.mood) q.set('mood', params.mood)
  return api<Paginated<Entry>>(`/api/notebooks/${notebookId}/entries?${q}`)
}

export const createEntry = (notebookId: string, input: CreateEntryInput) =>
  api<Entry>(`/api/notebooks/${notebookId}/entries`, { method: 'POST', ...json(input) })

export const getEntry = (id: string) => api<Entry>(`/api/entries/${id}`)

export const updateEntry = (id: string, input: UpdateEntryInput) =>
  api<Entry>(`/api/entries/${id}`, { method: 'PATCH', ...json(input) })

export const deleteEntry = (id: string) => api<void>(`/api/entries/${id}`, { method: 'DELETE' })

// ----------------------------------------------------------------- group journal

export interface GroupJournalParams {
  page?: number
  limit?: number
  author_id?: string
  mood?: Mood
  tags?: string
  q?: string
  since?: string
  until?: string
}

export const listGroupEntries = (groupId: string, params: GroupJournalParams = {}) => {
  const q = new URLSearchParams()
  q.set('page', String(params.page ?? 1))
  q.set('limit', String(params.limit ?? 20))
  if (params.author_id) q.set('author_id', params.author_id)
  if (params.mood) q.set('mood', params.mood)
  if (params.tags) q.set('tags', params.tags)
  if (params.q) q.set('q', params.q)
  if (params.since) q.set('since', params.since)
  if (params.until) q.set('until', params.until)
  return api<Paginated<Entry>>(`/api/groups/${groupId}/entries?${q}`)
}

// ----------------------------------------------------------------- search

export const searchEntries = (term: string, page = 1, limit = 20) => {
  const q = new URLSearchParams({ q: term, page: String(page), limit: String(limit) })
  return api<Paginated<Entry>>(`/api/search?${q}`)
}

// ----------------------------------------------------------------- groups

export const listGroups = () => api<Group[]>('/api/groups')

export const createGroup = (name: string) => api<Group>('/api/groups', { method: 'POST', ...json({ name }) })

export const getGroup = (id: string) => api<GroupDetail>(`/api/groups/${id}`)

export const updateGroup = (id: string, input: { name?: string; auto_accept?: boolean; webhook_url?: string | null }) =>
  api<GroupDetail>(`/api/groups/${id}`, { method: 'PATCH', ...json(input) })

export const deleteGroup = (id: string) => api<void>(`/api/groups/${id}`, { method: 'DELETE' })

export const listMembers = (id: string) => api<GroupMember[]>(`/api/groups/${id}/members`)

export const removeMember = (groupId: string, userId: string) =>
  api<void>(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' })

export const leaveGroup = (groupId: string) => api<void>(`/api/groups/${groupId}/leave`, { method: 'POST' })

// ----------------------------------------------------------------- invites (link-based)

export const getInviteLink = (groupId: string) => api<InviteLink>(`/api/groups/${groupId}/invite-link`)

export const rotateInviteLink = (groupId: string, input: { expires_in_hours?: number | null } = {}) =>
  api<InviteLink>(`/api/groups/${groupId}/invite-link`, { method: 'POST', ...json(input) })

export const revokeInviteLink = (groupId: string) =>
  api<void>(`/api/groups/${groupId}/invite-link`, { method: 'DELETE' })

export const linkInfo = (token: string) => api<LinkInfo>(`/api/invites/link/${token}`)

export const joinViaLink = (token: string) => api<JoinResult>(`/api/invites/link/${token}/join`, { method: 'POST' })

export const listJoinRequests = (groupId: string) => api<JoinRequest[]>(`/api/groups/${groupId}/requests`)

export const decideJoinRequest = (groupId: string, requestId: string, decision: 'approved' | 'denied') =>
  api<JoinRequest>(`/api/groups/${groupId}/requests/${requestId}/${decision}`, { method: 'POST' })

// ----------------------------------------------------------------- realtime (ephemeral)

export const sendTyping = (groupId: string, input: { typing: boolean; name?: string }) =>
  api<{ ok: boolean }>(`/api/groups/${groupId}/typing`, { method: 'POST', ...json(input) })

export const sendSeen = (groupId: string, entryId: string) =>
  api<{ ok: boolean }>(`/api/groups/${groupId}/seen`, { method: 'POST', ...json({ entry_id: entryId }) })

export interface EntryViewRow {
  entry_id: string
  user_id: string
  display_name: string | null
  viewed_at: string
}

export const listGroupViews = (groupId: string) => api<EntryViewRow[]>(`/api/groups/${groupId}/views`)

// ----------------------------------------------------------------- reflect (agentic companion)

export interface ReflectMessage {
  role: 'user' | 'assistant'
  content: string
}

export const reflectChat = (input: { notebook_ids: string[]; messages: ReflectMessage[] }) =>
  api<{ reply: string; tools_used: string[]; model: string }>('/api/reflect/chat', {
    method: 'POST',
    ...json(input),
  })

export interface ReflectContextEntry {
  title: string
  body: string
  mood: string | null
  tags: string[]
  created_at: string
}

/**
 * Reflect with a client-decrypted context bundle: entries the caller
 * decrypted locally are passed to the AI provider via the tool loop —
 * the server relays them without storing or re-reading them.
 */
export const reflectChatWithContext = (input: {
  notebook_ids: string[]
  messages: ReflectMessage[]
  context?: ReflectContextEntry[]
}) =>
  api<{ reply: string; tools_used: string[]; model: string }>('/api/reflect/chat', {
    method: 'POST',
    ...json(input),
  })

// ----------------------------------------------------------------- encryption (E2EE)

export interface KeyMaterial {
  salt: string | null
  iterations: number | null
  wrapped_dek: string | null
  public_key: string | null
  wrapped_private_key: string | null
}

export const getMyKeys = () => api<KeyMaterial>('/api/me/keys')

export const publishKeys = (input: {
  salt: string
  iterations: number
  wrapped_dek: string
  public_key: string
  wrapped_private_key: string
}) => api<KeyMaterial>('/api/me/keys', { method: 'PUT', ...json(input) })

export interface GroupKeyWrap {
  group_id: string
  generation: number
  sealed_box: string
  created_at: string
}

export const getMyGroupKeyWrap = (groupId: string) => api<GroupKeyWrap>(`/api/groups/${groupId}/key`)

export const distributeGroupKeys = (
  groupId: string,
  input: { generation: number; wraps: Array<{ user_id: string; sealed_box: string }> },
) => api<{ group_id: string; generation: number }>(`/api/groups/${groupId}/key`, { method: 'PUT', ...json(input) })

export const rotateGroupEntryKeys = (
  groupId: string,
  input: { rewraps: Array<{ entry_id: string; wrapped_key: string }> },
) => api<{ rewrapped: number }>(`/api/groups/${groupId}/rotate`, { method: 'POST', ...json(input) })

export const encryptMigrate = (input: { entries: Array<{ id: string; title_cipher: string; body_cipher: string }> }) =>
  api<{ migrated: number; remaining: number }>('/api/me/encrypt-migrate', { method: 'POST', ...json(input) })
