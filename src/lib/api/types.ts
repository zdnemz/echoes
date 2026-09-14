/**
 * DTO types for the Echoes API — mirrors the Zod schemas in
 * src/server/schemas/index.ts (the OpenAPI document is the contract).
 */

import type { Mood } from '@/components/mood/glyphs'

export type { Mood }

export interface Pagination {
  page: number
  limit: number
  total: number
}

export interface Paginated<T> {
  data: T[]
  pagination: Pagination
}

// ----------------------------------------------------------------- auth

export interface AuthUser {
  id: string
  email: string | null
  display_name: string | null
  created_at: string
}

export interface Session {
  access_token: string
  refresh_token: string | null
  expires_in: number | null
  token_type: string | null
  user: AuthUser
}

export interface SignUpInput {
  email: string
  password: string
  display_name?: string
}

export interface LoginInput {
  email: string
  password: string
}

// ----------------------------------------------------------------- notebooks

export interface Notebook {
  id: string
  owner_id: string
  title: string
  group_id: string | null
  created_at: string
  updated_at: string
}

export interface CreateNotebookInput {
  title: string
}

export interface UpdateNotebookInput {
  title?: string
  group_id?: string | null
}

// ----------------------------------------------------------------- entries

export interface Entry {
  id: string
  notebook_id: string
  author_id: string
  title: string
  body: string
  mood: Mood | null
  tags: string[]
  is_shared: boolean
  created_at: string
  updated_at: string
}

export interface CreateEntryInput {
  title: string
  body: string
  mood?: Mood
  tags?: string[]
  is_shared?: boolean
}

export interface UpdateEntryInput {
  title?: string
  body?: string
  mood?: Mood | null
  tags?: string[]
  is_shared?: boolean
}

// ----------------------------------------------------------------- groups

export type GroupRole = 'owner' | 'member'

export interface Group {
  id: string
  owner_id: string
  name: string
  created_at: string
  auto_accept: boolean
  my_role: GroupRole
  member_count: number
}

export interface GroupMember {
  user_id: string
  email: string | null
  display_name: string | null
  role: GroupRole
  joined_at: string
}

export interface GroupDetail extends Group {
  members: GroupMember[]
}

// ----------------------------------------------------------------- invites (link-based)

export interface InviteLink {
  /**
   * Only populated right after a rotation — the server stores a hash, so an
   * existing link can never be displayed again.
   */
  url: string | null
  /** An active link exists, even when `url` is null (not recoverable). */
  has_link: boolean
  expires_at: string | null
  auto_accept: boolean
}

export interface LinkInfo {
  token: string
  group_name: string
  group_id: string
  auto_accept: boolean
  expires_at: string | null
  usable: boolean
}

export type JoinStatus = 'joined' | 'requested' | 'member' | 'pending'

export interface JoinResult {
  status: JoinStatus
  group_id: string
  group_name: string
  message: string
}

export type JoinRequestStatus = 'pending' | 'approved' | 'denied'

export interface JoinRequest {
  id: string
  group_id: string
  user_id: string
  email: string | null
  display_name: string | null
  status: JoinRequestStatus
  created_at: string
}

// ----------------------------------------------------------------- system

export interface Health {
  status: 'ok' | 'degraded'
  time: string
  supabase: {
    configured: boolean
    service_role: boolean
    reachable: boolean | null
    schema_ready: boolean | null
  }
  version: string
}
