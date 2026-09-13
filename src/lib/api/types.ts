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

// ----------------------------------------------------------------- invites

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

export interface Invite {
  id: string
  group_id: string
  email: string
  status: InviteStatus
  expires_at: string
  created_at: string
  /** Present in actual responses (full row) — used for revoke-by-token. */
  token?: string
  invited_by?: string
  accept_url?: string
}

export interface InviteInfo {
  token: string
  group_name: string
  group_id: string
  invited_email: string
  status: InviteStatus | 'unknown_email'
  expires_at: string | null
  already_member: boolean
}

export interface AcceptInviteResult {
  group_id: string
  group_name: string
  role: GroupRole
  message: string
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
