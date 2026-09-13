import type { OpenAPIHono } from '@hono/zod-openapi'
import type { ZodType } from 'zod'
import { ErrorSchema, ApiError, Errors } from '../errors'
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
