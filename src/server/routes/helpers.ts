import type { OpenAPIHono } from '@hono/zod-openapi'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ZodType } from 'zod'
import { ErrorSchema, ApiError, Errors, fromPostgrestError } from '../errors'
import type { AppEnv } from '../types'
import { isSupabaseConfigured, hasServiceRole } from '../env'

/**
 * Shared route-building helpers.
 */

export type App = OpenAPIHono<AppEnv>

/**
 * Typed JSON request-body spec for createRoute. Generic so the specific Zod
 * schema type survives — `c.req.valid('json')` then returns the parsed type
 * instead of `unknown`.
 */
export function jsonBody<T extends ZodType>(schema: T) {
  return {
    required: true as const,
    content: { 'application/json': { schema } },
  }
}

/** Standard error responses for a route, keyed by status code. */
export function errorResponses(
  ...codes: Array<400 | 401 | 402 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503>
): Record<string, { description: string; content: { 'application/json': { schema: typeof ErrorSchema } } }> {
  const descriptions: Record<number, string> = {
    400: 'Bad request',
    401: 'Missing or invalid bearer token',
    402: 'Payment required',
    403: 'Row level security or ownership check denied the operation',
    404: 'Resource not found',
    409: 'Conflict with existing data',
    422: 'Validation failed',
    429: 'Rate limit exceeded (per-IP sliding window on auth endpoints)',
    500: 'Unexpected server error',
    502: 'Upstream auth provider unreachable',
    503: 'Supabase is not configured on this deployment',
  }
  return Object.fromEntries(
    codes.map((code) => [
      String(code),
      {
        description: descriptions[code] ?? 'Error',
        content: { 'application/json': { schema: ErrorSchema } },
      },
    ]),
  )
}

/** Throws when Supabase env vars are absent. Call first in every handler. */
export function requireSupabaseConfig(): void {
  if (!isSupabaseConfigured()) throw Errors.supabaseNotConfigured()
}

/** Throws when the service role key is absent (seed/admin operations). */
export function requireServiceRoleConfig(): void {
  if (!hasServiceRole()) {
    throw new ApiError(503, 'SERVICE_ROLE_NOT_CONFIGURED', 'SUPABASE_SERVICE_ROLE_KEY is required for this operation')
  }
}

/** Reusable security requirement for bearer-authenticated endpoints. */
export const bearerAuth: { bearerAuth: string[] } = { bearerAuth: [] }

// ---------------------------------------------------------------- group access

export interface GroupOwnershipRow {
  id: string
  owner_id: string
  name?: string
}

/**
 * Resolve a group the caller may see, or throw 404.
 *
 * RLS already hides invisible groups, so a missing row is genuinely "not
 * found (or not visible to you)" — the two cases are deliberately
 * indistinguishable so group ids cannot be probed.
 */
export async function requireGroupVisible(
  client: SupabaseClient,
  groupId: string,
  select = 'id, owner_id',
): Promise<GroupOwnershipRow> {
  const { data, error } = await client.from('groups').select(select).eq('id', groupId).maybeSingle()
  if (error) throw fromPostgrestError(error)
  if (!data) throw Errors.notFound('Group not found (or not visible to you)')
  return data as unknown as GroupOwnershipRow
}

/**
 * Resolve a group the caller *owns*, or throw 403.
 *
 * This exact block was copy-pasted into six handlers; one missed check is a
 * cross-tenant write, so it lives in one place now.
 */
export async function requireGroupOwner(
  client: SupabaseClient,
  groupId: string,
  userId: string,
  { select = 'id, owner_id', message = 'Only the group owner can do this' }: { select?: string; message?: string } = {},
): Promise<GroupOwnershipRow> {
  const group = await requireGroupVisible(client, groupId, select)
  if (group.owner_id !== userId) throw Errors.forbidden(message)
  return group
}
