import { createRoute, z } from '@hono/zod-openapi'
import { EntrySchema, PageQuerySchema, PaginatedSchema } from '../schemas'
import { fromPostgrestError } from '../errors'
import { requireAuth } from '../auth'
import { bearerAuth, errorResponses, type App } from './helpers'

const SearchQuery = z
  .object({
    q: z
      .string()
      .min(1)
      .max(200)
      .openapi({ example: 'coffee', description: 'Search term matched against title, body and tags' }),
    ...PageQuerySchema.shape,
  })
  .strict()

/**
 * PostgREST `or` filter value escaping: wrap in double quotes and escape
 * backslashes + double quotes so user input cannot break out of the filter.
 */
export function escapePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function registerSearchRoutes(app: App) {
  const search = createRoute({
    method: 'get',
    path: '/search',
    tags: ['Search'],
    summary: 'Search your own entries',
    description:
      'Full-text-ish search over the entries YOU authored (per PRD §6.4 — searching other members’ shared entries is a fast follow). Matches the term against entry title, body and tags, newest first.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { query: SearchQuery },
    responses: {
      ...errorResponses(401, 422, 503),
      200: {
        description: 'Matching entries',
        content: { 'application/json': { schema: PaginatedSchema(EntrySchema) } },
      },
    },
  })
  app.openapi(search, async (c) => {
    const { q, page, limit } = c.req.valid('query')
    const user = c.var.user
    const from = (page - 1) * limit

    const likePattern = escapePostgrestValue(`%${q}%`)
    const tagValue = escapePostgrestValue(q)
    const orFilter = `title.ilike.${likePattern},body.ilike.${likePattern},tags.cs.{${tagValue}}`

    const { data, count, error } = await c.var.userClient
      .from('entries')
      .select('*', { count: 'exact' })
      .eq('author_id', user.id)
      .or(orFilter)
      .order('updated_at', { ascending: false })
      .range(from, from + limit - 1)
    if (error) throw fromPostgrestError(error)

    return c.json({
      data: data ?? [],
      pagination: { page, limit, total: count ?? 0 },
    })
  })
}
