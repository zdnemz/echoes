import type { Context } from 'hono'
import { z } from '@hono/zod-openapi'

/**
 * Uniform error envelope returned by every route:
 *   { "error": { "code": "...", "message": "...", "details": ... } }
 */
export const ErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().openapi({ example: 'NOT_FOUND' }),
        message: z.string().openapi({ example: 'Resource not found' }),
        details: z
          .union([z.array(z.string()), z.record(z.string(), z.array(z.string())), z.null()])
          .openapi({ example: null, description: 'Structured validation issues when available' })
          .nullable()
          .optional(),
      })
      .openapi({ description: 'Error details' }),
  })
  .openapi('Error')

export type ErrorEnvelope = z.infer<typeof ErrorSchema>

/** Typed application error — mapped to the envelope by app.onError. */
export class ApiError extends Error {
  status: number
  code: string
  details?: ErrorEnvelope['error']['details']

  constructor(status: number, code: string, message: string, details?: ErrorEnvelope['error']['details']) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const Errors = {
  unauthorized: (message = 'Authentication required') => new ApiError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'You are not allowed to do this') => new ApiError(403, 'FORBIDDEN', message),
  notFound: (message = 'Resource not found') => new ApiError(404, 'NOT_FOUND', message),
  conflict: (code: string, message: string) => new ApiError(409, code, message),
  badRequest: (message: string, details?: ErrorEnvelope['error']['details']) =>
    new ApiError(400, 'BAD_REQUEST', message, details),
  supabaseNotConfigured: () =>
    new ApiError(
      503,
      'SUPABASE_NOT_CONFIGURED',
      'Supabase credentials are missing. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env',
    ),
}

/** Helper for handlers: throw this to produce a clean error response. */
export function jsonError(c: Context, err: ApiError) {
  return c.json({ error: { code: err.code, message: err.message, details: err.details ?? null } }, err.status as 400)
}

/** Map a PostgREST error to an ApiError with a sensible status code. */
export function fromPostgrestError(postgrestError: {
  code?: string
  message: string
  details?: unknown
  hint?: unknown
}): ApiError {
  const code = postgrestError.code ?? 'DB_ERROR'
  switch (code) {
    case 'PGRST205':
      // PostgREST schema cache is stale (or the migrations were never applied
      // to the database this deployment points at). 503, not 400: retrying
      // the same request cannot succeed until the schema is reloaded.
      return new ApiError(
        503,
        'SCHEMA_NOT_READY',
        'The data layer does not see the required tables yet — run the Supabase migrations, then reload the PostgREST schema cache',
      )
    case 'PGRST116':
      // supabase-js `.single()` yields this when the response contains zero
      // rows — e.g. an UPDATE that matched nothing because RLS denied it or
      // the row was deleted concurrently. 404, not a raw DB 400.
      return new ApiError(404, 'NOT_FOUND', 'The resource was not found (or is not visible to you)')
    case '23505':
      return new ApiError(409, 'CONFLICT', 'The request conflicts with existing data')
    case '23503':
      // Foreign-key violation: the request references a row that is not
      // there (e.g. a profile for a pre-migration account). 409, not 400:
      // retrying the identical request cannot succeed, and the previous
      // message ("conflicts with existing data") sent reporters hunting
      // for a duplicate that does not exist.
      return new ApiError(409, 'CONFLICT', 'The request references related data that does not exist')
    case '42501':
      return new ApiError(403, 'RLS_DENIED', 'Row level security denied this operation')
    case '23514':
      return new ApiError(400, 'CHECK_VIOLATION', 'The request violates a data constraint')
    default:
      return new ApiError(400, code, postgrestError.message)
  }
}

/** Zod error → flat field error map used by the defaultHook and onError. */
export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    fields[key] = [...(fields[key] ?? []), issue.message]
  }
  return fields
}
